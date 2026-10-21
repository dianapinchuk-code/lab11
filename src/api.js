/**
 * Запити до TVmaze API: https://www.tvmaze.com/api.
 * Реалізація за ТЗ (§3.2, §3.4 і §4).
 */

/** Адреса API */
export const API = 'https://api.tvmaze.com';

// Кеш для успішно завантажених даних серіалів
const showCache = new Map();

export const serviceErrorMessage = 'Не вдалося отримати дані від TVmaze.';
export const networkErrorMessage = 'Немає з’єднання з TVmaze.';
export const rateLimitErrorMessage = 'Забагато запитів до TVmaze.';

export class TvmazeError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'TvmazeError';
    this.kind = kind;
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);

    function onAbort() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Загальний запит з обробкою статусів і повтором при 429
 */
async function requestJson(url, signal, { notFound = false, onRateLimitWait } = {}) {
  let response;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // Лише чистий GET без кастомних заголовків (C1.9)
      response = await fetch(url, { signal });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new TvmazeError('network', networkErrorMessage);
    }

    if (response.status !== 429 || attempt === 1) {
      break;
    }

    // C3.6: Повідомляємо статус про очікування перед повтором
    if (typeof onRateLimitWait === 'function') {
      onRateLimitWait();
    }

    // Очікування 2.5 с (строго в діапазоні 2–5 с за ТЗ, без випадкових збоїв)
    await wait(2500, signal);
  }

  // C3.6: Другий 429 поспіль
  if (response.status === 429) {
    throw new TvmazeError('rate-limit', rateLimitErrorMessage);
  }

  // C3.2: 404 для сторінки серіалу
  if (response.status === 404 && notFound) {
    throw new TvmazeError('not-found', 'Серіал не знайдено');
  }

  // C3.1, C3.3: 4xx, 5xx — помилка сервісу
  if (!response.ok) {
    throw new TvmazeError('service', serviceErrorMessage);
  }

  // C3.3: Тіло, що не є JSON
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new TvmazeError('service', serviceErrorMessage);
  }
}

/**
 * C1. Шукає серіали за назвою.
 *
 * @param {string} query
 * @param {{ signal?: AbortSignal, onRateLimitWait?: () => void }} [options]
 * @returns {Promise<object[]>}
 */
export async function searchShows(query, { signal, onRateLimitWait } = {}) {
  const cleanQuery = typeof query === 'string' ? query.trim() : '';

  // C1.5: Менше 2 символів — запиту немає
  if (cleanQuery.length < 2) {
    return [];
  }

  const url = `${API}/search/shows?q=${encodeURIComponent(cleanQuery)}`;
  const data = await requestJson(url, signal, { onRateLimitWait });

  if (!Array.isArray(data)) {
    throw new TvmazeError('service', serviceErrorMessage);
  }

  // TVmaze повертає [{ score, show }], для renderResults повертаємо лише show
  return data.map((item) => item.show);
}

/**
 * C2. Завантажує серіал з епізодами й акторами.
 *
 * @param {number|string} id
 * @param {{ signal?: AbortSignal, onRateLimitWait?: () => void }} [options]
 * @returns {Promise<{ show: object, episodes: object[], cast: object[] }>}
 */
export async function getShow(id, { signal, onRateLimitWait } = {}) {
  // C2.4: Нормалізація ключа, щоб "82" і 82 потрапляли в той самий кеш
  const cacheKey = String(id);
  if (showCache.has(cacheKey)) {
    return showCache.get(cacheKey);
  }

  // C2.2: Отримання серіалу, епізодів і акторів одним запитом через embed
  const url = `${API}/shows/${encodeURIComponent(cacheKey)}?embed[]=episodes&embed[]=cast`;
  const data = await requestJson(url, signal, { notFound: true, onRateLimitWait });

  if (!data || typeof data !== 'object') {
    throw new TvmazeError('service', serviceErrorMessage);
  }

  const result = {
    show: data,
    episodes: Array.isArray(data._embedded?.episodes) ? data._embedded.episodes : [],
    cast: Array.isArray(data._embedded?.cast) ? data._embedded.cast : [],
  };

  // C3.8: Кешуємо тільки успішний результат
  showCache.set(cacheKey, result);
  return result;
}
// Challenge 2 draft
