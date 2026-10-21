# TVmaze API — Конспект

| Питання | Що каже документація | Що показав запит (адреса) |
|---|---|---|
| Ендпоїнт пошуку за назвою, параметри | `GET /search/shows?q=:query` | `https://api.tvmaze.com/search/shows?q=girls` — повертає масив серіалів з релевантністю |
| Форма відповіді пошуку | Масив об'єктів виду `[{ score: number, show: { id, name, ... } }]` | `https://api.tvmaze.com/search/shows?q=girls` — масив до 10 елементів |
| Ендпоїнт серіалу; як отримати епізоди й акторів одним запитом | `GET /shows/:id` або з параметрами вбудовування `?embed[]=episodes&embed[]=cast` | `https://api.tvmaze.com/shows/139?embed[]=episodes&embed[]=cast` — повертає show з полями `_embedded.episodes` та `_embedded.cast` |
| Поля серіалу, що можуть бути null | `image`, `summary`, `network`, `webChannel`, `ended`, `officialSite` (наприклад, шоу 82 або неопубліковані пілоти) | `https://api.tvmaze.com/shows/9999` або арт-хаусні проєкти: `image: null`, `officialSite: null` |
| Що повертає пошук без результатів | Статус 200 OK і порожній JSON-масив `[]` | `https://api.tvmaze.com/search/shows?q=asdqwezxc12345` — HTTP 200 `[]` |
| Що повертає неіснуючий id | HTTP 404 Not Found, JSON об'єкт помилки | `https://api.tvmaze.com/shows/999999999` — HTTP 404 `{"name":"Not Found","message":"","code":0,"status":404}` |
| Ліміт запитів і що робити на 429 | Ліміт: від 20 запитів за 10 секунд з однієї IP. На 429 почекати кілька секунд (2–5 с) і повторити | `https://api.tvmaze.com/search/shows?q=test` — HTTP 429 `Too Many Requests` |
| Кешування: що кешує TVmaze і що — браузер | TVmaze кешує запити через Fastly/Varnish (`Cache-Control: public, max-age=...`). Браузер зберігає відповіді в HTTP-кеші за цими заголовками | Заголовок `cache-control: public, max-age=3600` або `max-age=86400` залежно від ендпоїнта |
| CORS: що обіцяє документація і що показав експеримент 12 | Усі ендпоїнти відкриті (`Access-Control-Allow-Origin: *`), але лише для простих GET. Додавання `Content-Type` ламає запит через preflight OPTIONS | `https://api.tvmaze.com/shows/82` — працює; з кастомним `Content-Type` падає з помилкою CORS |
| Ліцензія й атрибуція | Дані ліцензовані під Creative Commons BY-SA 4.0. Необхідне обов'язкове посилання на TVmaze як джерело | Умова ліцензії вказана у футері документації TVmaze |