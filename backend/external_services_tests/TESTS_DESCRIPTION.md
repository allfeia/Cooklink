# YT Recipe Tests

## Структура

```
test-1-metadata.js     Тест 1: сбор метаданных (сравнение 3 инструментов)
test-2-subtitles.js    Тест 2: получение субтитров RU/EN
test-3-qwen.js         Тест 4: конвертация субтитров → JSON через Qwen API
utils/logger.js        Общий логгер + saveResults()
utils/fetch-recipe.js  Автоматизированный поиск 100 видео RU/EN до 15 минут
subtitles/             Сохранённые .txt файлы субтитров
results/               JSON-отчёты по каждому тесту
results/recipes/       Извлечённые рецепты (из Теста 4)
```

## Шаг 0 — добавить URL

Поиск видео для тестов происходит автоматизировано при помощи скрипта `utils/fetch-recipe.js`

Он находит до 100 видео на английском и русском в пропорциональном соотношении

Поиск происходит с YouTube API v3

Результаты записываются в файл `results/recipe-ru-en.json` (для ручной проверки)

Список ссылок для использования в тестах в `results/test-urls-auto.js`

```bash
npm run fetch-recipe
````

## Запуск тестов

### Тест 1 — метаданные

```bash
npm run test:1          # все три инструмента
npm run test:1:A        # только @distube/ytdl-core
npm run test:1:B        # только yt-dlp-exec
npm run test:1:C        # только YouTube Data API v3
```

Что проверяем:
- Корректность данных (title, channel, duration)
- Время ответа на 100 ссылках
- Тайм-ауты и блокировки YouTube
- Какой инструмент быстрее и надёжнее

Инструменты:
- **Tool A** (`@distube/ytdl-core`) 
- **Tool B** (`yt-dlp-exec`)
- **Tool C** (YouTube Data API v3) — официальный API Google, нужен `YOUTUBE_API_KEY`; возвращает только публичные видео, квота 10 000 units/day (1 unit = 1 запрос к videos.list)

### Тест 2 — субтитры

```bash
npm run test:2                              # оба, языки ru > en
npm run test:2:A                            # только проверка доступности
npm run test:2:B                            # только скачивание .txt файлов
npm run test:2:EN                           # английский приоритетнее
npm run test:2:10                           # обработать первые 10 видео
```

Что проверяем:
- Успешность получения субтитров (логируется статус + ошибка)
- Какие видео не имеют субтитров
- Разница между ручными и авто-субтитрами

Результаты:
```plain
subtitles/
├── <videoId>_B__yt_dlp_exec__ru.txt   # очищенный текст субтитров

results/
└── test-2-subtitles-<timestamp>.json  # отчёт: статус, язык, тип (manual/auto), ошибки
```

### Тест 3 — Qwen JSON

```bash
# Сначала должен быть выполнен Тест 2 (нужны .txt в /subtitles/)
npm run test:4              # все файлы из /subtitles/
npm run test:4:single       # только первый файл (для отладки промпта)
node test-3-qwen.js --file=subtitles/VIDEO_ID_tool_ru.txt
```

Что проверяем:
- Качество извлечения рецепта (все поля схемы заполнены?)
- Валидность JSON (schema validation автоматически)
- Расход токенов
- Корректность шагов и ингредиентов