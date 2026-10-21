/**
 * Поведінка ShowFinder: пошук (C1), сторінка серіалу (C2), помилки й повторні спроби (C3).
 * Специфікація — ТЗ, §3–4.
 */
import { getShow, searchShows, TvmazeError } from './api.js';
import { renderResults, renderShow } from './view.js';

/** Підключає форму пошуку #search і області #results та #details. main.js викликає її один раз. */
export function initApp() {
  const form = document.querySelector('#search');
  const input = form?.querySelector('[name="query"]');
  const results = document.querySelector('#results');
  const details = document.querySelector('#details');
  const status = document.querySelector('#status');
  const loadingTemplate = document.querySelector('#state-loading');
  const messageTemplate = document.querySelector('#state-message');
  const errorTemplate = document.querySelector('#state-error');

  if (
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLInputElement) ||
    !(results instanceof Element) ||
    !(details instanceof Element) ||
    !(status instanceof Element) ||
    !(loadingTemplate instanceof HTMLTemplateElement) ||
    !(messageTemplate instanceof HTMLTemplateElement) ||
    !(errorTemplate instanceof HTMLTemplateElement)
  ) {
    throw new Error('Не знайдено обов’язкові елементи ShowFinder.');
  }

  let searchController;
  let detailsController;
  let debounceTimer;

  function setBusy(region, busy) {
    if (busy) {
      region.setAttribute('aria-busy', 'true');
    } else {
      region.removeAttribute('aria-busy');
    }
  }

  function showLoading(region) {
    region.replaceChildren(loadingTemplate.content.cloneNode(true));
  }

  function showMessage(region, text) {
    const fragment = messageTemplate.content.cloneNode(true);
    const textElem =
      fragment.querySelector('.state__text') ||
      fragment.querySelector('.state--message') ||
      fragment.firstElementChild;
    if (textElem) textElem.textContent = text;
    region.replaceChildren(fragment);
  }

  function showError(region, error, retry) {
    const fragment = errorTemplate.content.cloneNode(true);
    const textElem = fragment.querySelector('.state__text');
    const message = error instanceof Error ? error.message : 'Не вдалося отримати дані від TVmaze.';

    if (textElem) {
      textElem.textContent = message;
    }

    const retryButton = fragment.querySelector('[data-action="retry"]');
    if (retryButton && retry) {
      retryButton.addEventListener('click', retry, { once: true });
    }

    region.replaceChildren(fragment);
  }

  function cancelSearch() {
    clearTimeout(debounceTimer);
    if (searchController) {
      searchController.abort();
      searchController = undefined;
    }
    setBusy(results, false);
  }

  function scheduleSearch(rawQuery, delay = 0) {
    clearTimeout(debounceTimer);
    const query = rawQuery.trim();

    // C1.5: Менше 2 символів — запиту немає, область результатів і статус порожні
    if (query.length < 2) {
      cancelSearch();
      results.replaceChildren();
      status.textContent = '';
      return;
    }

    const run = async () => {
      // Скасовуємо попередній запит перед запуском нового
      if (searchController) {
        searchController.abort();
      }

      const controller = new AbortController();
      searchController = controller;

      // C1.6, C1.8: Поки запит триває — показуємо завантаження
      setBusy(results, true);
      showLoading(results);
      status.textContent = 'Завантаження…';

      try {
        const shows = await searchShows(query, {
          signal: controller.signal,
          // C3.6: Текст статусу при очікуванні повтору 429
          onRateLimitWait: () => {
            if (searchController === controller) {
              status.textContent = 'Забагато запитів до TVmaze, повторюю…';
            }
          },
        });

        // C1.8: Старіша відповідь ніколи не замінює новішу
        if (searchController !== controller) return;

        // C1.7: Порожня відповідь
        if (shows.length === 0) {
          const emptyMessage = `Нічого не знайдено за запитом «${query}»`;
          showMessage(results, emptyMessage);
          status.textContent = emptyMessage;
          return;
        }

        // C1.2: Успішні результати
        renderResults(results, shows);
        status.textContent = `Знайдено: ${shows.length}`;
      } catch (error) {
        if (error?.name === 'AbortError' || searchController !== controller) return;

        console.error(error);

        // C3.4: Для помилок пошуку статус дублює повідомлення
        const message = error instanceof Error ? error.message : 'Не вдалося отримати дані від TVmaze.';
        status.textContent = message;
        showError(results, error, () => scheduleSearch(query, 0));
      } finally {
        if (searchController === controller) {
          searchController = undefined;
          setBusy(results, false);
        }
      }
    };

    if (delay > 0) {
      debounceTimer = setTimeout(run, delay);
    } else {
      void run();
    }
  }

  async function openShow(id) {
    if (detailsController) {
      detailsController.abort();
    }

    const controller = new AbortController();
    detailsController = controller;

    // C2.3, C2.5: Завантаження в #details
    setBusy(details, true);
    showLoading(details);

    try {
      const data = await getShow(id, { signal: controller.signal });
      if (detailsController !== controller) return;

      renderShow(details, data);
    } catch (error) {
      if (error?.name === 'AbortError' || detailsController !== controller) return;

      console.error(error);

      // C3.2: 404 для серіалу — повідомлення без кнопки retry
      if (
        (error instanceof TvmazeError && error.kind === 'not-found') ||
        error?.message === 'Серіал не знайдено'
      ) {
        showMessage(details, 'Серіал не знайдено');
        return;
      }

      // C3.3, C3.4: Помилка з кнопкою повтору
      showError(details, error, () => void openShow(id));
    } finally {
      if (detailsController === controller) {
        detailsController = undefined;
        setBusy(details, false);
      }
    }
  }

  // C1.4: Enter шукає негайно, скасовуючи запланований debounce
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    scheduleSearch(input.value, 0);
  });

  // C1.3: Подія input із затримкою 200 мс (комфортно вкладається в ліміт 500 мс)
  input.addEventListener('input', () => {
    scheduleSearch(input.value, 200);
  });

  // C2.1: Відкриття серіалу по кліку
  results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="open"]');
    const item = button?.closest('[data-id]');
    if (item && item.dataset.id) {
      void openShow(item.dataset.id);
    }
  });
}