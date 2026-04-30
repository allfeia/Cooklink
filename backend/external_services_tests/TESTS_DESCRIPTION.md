# Тесты внешних API — описание и запуск

## Структура директории

```
backend/
├── external_services_tests/
│   ├── test-1-metadata.js
│   ├── test-2-subtitles.js
│   ├── test-3-llm.js
│   ├── utils/
│   │   ├── fetch-recipe.js
│   │   ├── logger.js
│   │   ├── qwen-call.js
│   ├── subtitles/               # сюда сохраняются .txt субтитров
│   └── results/
│       ├── test-urls-auto.js    # список URL для тестов
│       ├── recipes-ru-en.json   # метаданные собранных видео
│       ├── recipes/             # извлечённые рецепты (JSON)
│       │   └── logs/            # логи прогонов
│       └── *.json               
├── .env
├── RESULTS.md
└── package.json

```

---

## Переменные окружения (.env)

```env
YOUTUBE_API_KEY=your_key_here
QWEN_API_KEY=your_key_here
```

---

## Test 0 — Сбор тестовых URL

**Файл:** `utils/fetch-recipe.js`

Делает поисковые запросы к YouTube Data API v3 и собирает ссылки на видео с рецептами на русском и английском языках. Фильтрует по языку заголовка и длительности (не более 15 минут). Результат сохраняется в `results/test-urls-auto.js` и используется как входные данные для тестов 1–2.

**Требования:** `YOUTUBE_API_KEY` в `.env`

```bash
node external_services_tests/utils/fetch-recipe.js
```

**Что сохраняется:**
- `results/test-urls-auto.js` — массив URL 
- `results/recipes-ru-en.json` — метаданные всех найденных видео

---

## Test 1 — Метаданные видео

**Файл:** `test-1-metadata.js`  
**npm скрипт:** `npm run test:1`

Сравнивает три способа получить метаданные видео (название, канал, длительность, количество просмотров) для каждого URL из `test-urls-auto.js`.

| Инструмент | Описание |
|---|---|
| **A** `@distube/ytdl-core` | JS, без бинарных зависимостей |
| **B** `yt-dlp-exec` | Обёртка над yt-dlp бинарником |
| **C** YouTube Data API v3 | Официальный Google API |

**Запуск:**

```bash
# все три инструмента
npm run test:1

# только один инструмент
npm run test:1:A
npm run test:1:B
npm run test:1:C
```

**Что сохраняется:**
- `results/test-1-metadata_<timestamp>.json`

---

## Test 2 — Субтитры

**Файл:** `test-2-subtitles.js`  
**npm скрипты:** `npm run test:2:A`, `npm run test:2:B`

Загружает субтитры для каждого видео из `test-urls-auto.js` через `yt-dlp`. Работает в двух режимах.

**Tool A — проверка доступности** (быстро, без скачивания файлов): запрашивает метаданные видео и проверяет, существуют ли субтитры на русском или английском. Используется для предварительной фильтрации.

**Tool B — полная загрузка** (сохраняет `.txt` файлы): скачивает `.vtt` субтитры, снимает разметку таймкодов и тегов, сохраняет как plain text. Эти файлы используются в Test 3.

**Запуск:**

```bash
# проверка доступности субтитров (Tool A)
npm run test:2:A

# загрузка субтитров (Tool B)
npm run test:2:B

# оба режима подряд
npm run test:2

# лимит на обработку 10 ссылок
npm run test:2:10
```

| Флаг | По умолчанию | Описание |
|---|---|---|
| `--tool=A\|B` | `BOTH` | запустить только один режим |
| `--limit=N` | все URL | обработать первые N видео |
| `--delay=мс` | `2000` | задержка между запросами |

**Важно:** для стабильной работы необходим файл с cookies авторизованного YouTube-аккаунта. Подробнее — в разделе «Проблема 429» ниже.

**Что сохраняется:**
- `subtitles/<videoId>_B__yt_dlp_exec.txt` — субтитры каждого видео
- `results/test-2-subtitles_<timestamp>.json` — лог прогона

---

## Test 3 — Извлечение рецепта через LLM

**Файл:** `test-3-llm.js`  
**npm скрипт:** `npm run test:3`

Читает `.txt` файлы из `subtitles/`, отправляет каждый в Qwen (модель `qwen-max`) с инструкцией извлечь структурированный рецепт, валидирует ответ по схеме и сохраняет результат.

**Схема рецепта:**

```
{
    "title": "string (3-100 chars)",
    "type": "string",
    "cooking_time_minutes": number,
    "difficulty": 1|2|3|4|5,
    "portions": number,
    "ingredients": [{"name": "string", "quantity": string, "unit": "string"}],
    "steps": [{"step_number": number, "description": "string (max 1000 chars)"}],
    "comments": "string (optional, max 1000 chars)"
}
```

**Требования:** `QWEN_API_KEY` в `.env`, наличие файлов в `subtitles/` (сначала запустить Test 2)

**Запуск:**

```bash
# все файлы из subtitles/
npm run test:3

# один файл
npm run test:3:single

# первые N файлов
node external_services_tests/test-3-llm.js --limit=10
```

**Что сохраняется:**
- `results/recipes/<videoId>.json` — каждый валидный рецепт отдельным файлом
- `results/recipes/logs/test-3-llm_<timestamp>.json` — лог прогона со статусами и токенами

---

## Полный прогон (все тесты по порядку)

```bash
# 1. собрать URL
node external_services_tests/utils/fetch-recipe.js

# 2. проверить метаданные (опционально, для сравнения инструментов)
npm run test:1

# 3. проверить доступность субтитров
npm run test:2:A

# 4. скачать субтитры
npm run test:2:B

# 5. извлечь рецепты
npm run test:3
```

---

## Известная проблема: HTTP 429 при загрузке субтитров

YouTube возвращает `429 Too Many Requests` при большом количестве запросов от неавторизованной сессии. Скрипт добавляет случайную задержку между запросами и делает до 3 повторных попыток, но при длительных прогонах этого может быть недостаточно.

**Решение для тестовой среды:** передать cookies авторизованного YouTube-аккаунта через параметр `cookies` в вызове yt-dlp (файл `www.youtube.com_cookies.txt` в директории теста).

**Рекомендации для продакшена** — см. раздел «Проблема с rate limiting» в [RESULTS.md](./RESULTS.md).