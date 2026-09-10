# Нагрузочное тестирование

## Инструменты

| Тест | Файл | Движок | Что меряет |
|---|---|---|---|
| **1** | `test1-breakpoint.js` | k6 | **точка отказа системы** по запросам/сек + на каком запросе YouTube даёт 429 на субтитры |
| 2 | `test2-llm-limits.js` | node | **лимиты модели** OpenRouter (запускаем позже, отдельно) |

`videos.json` — 100 разных кулинарных видео (генерится из
`backend/external_services_tests/results/recipes-ru-en.json`). Тест 1 читает его
через `open()`; тест 2 берёт транскрипты из `backend/external_services_tests/subtitles/`.

## Установка

```bash
brew install k6          # тест 1
# node уже есть; тест 2 использует модули из backend/node_modules
```

---

## Почему это нетривиально

**1. Кэш рецептов маскирует нагрузку.** Если рецепт по видео уже в БД
(`recipeStore`), `POST /v1/recipes` не запускает пайплайн — сразу отдаёт
PDF-only путь (`recipes.ts` → `generatePdfOnly`). Поэтому:

- **Тест 1** мокает llm-worker (`LLM_EXTRACT_PATH=/extract-mock`). Мок
  **не пишет в `recipeStore`**, поэтому каждый `POST` реально прогоняет
  metadata + subtitles + pdf — сколько бы раз ни повторялся URL.
- Корпус из 100 видео — малоизвестные короткие ролики, в проде их, скорее
  всего, нет в кэше. Проверяй панель **Cache Hit Rate** в business-дашборде:
  если хитов много — часть нагрузки уходит в лёгкий путь и тест слабее реального.

**2. Ролики разной длины → время ответа скачет.** 10-секундный шортс и
10-минутное видео дают разный объём работы на субтитрах. Тест 1 берёт URL
детерминированно по сквозному счётчику (по кругу), не случайно — проще
воспроизвести и соотнести с логами.

**3. Точка отказа системы и 429 от субтитров ловятся за один прогон.** Полный
пайплайн под нагрузкой сам утыкается в 429 от YouTube (yt-dlp дёргается 2 раза
на задачу: metadata + subtitles). Тест 1 при большой нагрузке фиксирует и то,
и другое: ищет точку, где система перестаёт справляться, и попутно печатает
номер запроса (`iterationInTest`), на котором впервые прилетел
`SUBTITLES_FETCH_FAILED`.

---

## Тест 1 — точка отказа системы (прод)

### Предпосылки

1. **Включить мок LLM на проде** (оверлей `docker-compose.loadtest.yml` в корне):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d --build backend llm-worker
   ```
   Вернуть реальный LLM после тестов — `make run`.

2. **Мониторинг работает**, дашборд 1860 (node-exporter) + business-дашборд открыты.

3. **Низкий трафик** (ночь): на пике тест долбит YouTube с IP прода, после
   жёсткого прогона живые запросы какое-то время падают с `SUBTITLES_FETCH_FAILED`.

### Запуск

```bash
K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_EXPORT=load-test/results-test1.html \
k6 run -e BASE_URL=https://cooklink.ru \
       -e MAX_RPS=25 \
       --out json=load-test/results-test1.json \
       load-test/test1-breakpoint.js
```

Плоские ступени rps (доезд 15s + плато `STAGE_MIN`=2 мин):
`1 → 2 → 5 → 10 → 15 → 20 → 25` (при `MAX_RPS=25` ≈ 17 мин).
Начни с 25, следующим прогоном подними `MAX_RPS` до 40–50.

Живой дашборд во время прогона — http://127.0.0.1:5665,
HTML-отчёт после — `results-test1.html`.

### Что смотреть

- `create_latency_ms` p95 (итог k6) — когда `POST /v1/recipes` начинает тормозить;
- `job_success_rate`, `fail_stage_*` — где и что сыпется;
- Grafana 1860 — CPU / RAM / load average сервера;
- business-дашборд — ошибки по стадиям, cache hit rate;
- консоль: `[SUB-429] iter=N` — номер запроса, где YouTube начал банить; `[timeout]`.

Точка отказа = где p95 латентности и кривая ошибок уходят вверх и не
возвращаются. Соотнести по времени с Grafana.

Точный порядок событий 429 — в `results-test1.json`, поле
`first_subtitles_429_iteration` (минимум = номер первого).

---

## Тест 2 — лимиты модели (позже, отдельно)

```bash
node load-test/test2-llm-limits.js --max=10 --concurrency=2 --no-stream
node load-test/test2-llm-limits.js --max=100 --concurrency=5 --stop-on-limit
```

Выдаёт: сколько запросов до первого лимита, 429 vs 402, `retry-after`, расход
токенов, оценку стоимости, долю валидной схемы, дельту `usage` по ключу.

⚠️ Тратит реальные кредиты / дневную квоту OpenRouter (free-tier, баланс ≈ 0).
Начинать с `--max=5`.
