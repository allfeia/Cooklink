# CookLink.ai

[Русский](README.md) · [English](README.en.md)

CookLink.ai превращает ссылку на видео-рецепт в структурированный рецепт и PDF-файл. Пользователь вставляет ссылку на YouTube, сервис получает метаданные и субтитры видео, извлекает рецепт с помощью LLM и формирует PDF.

Проект находится в стадии MVP.

## Возможности

- обработка YouTube-ссылок;
- извлечение названия, ингредиентов, шагов, времени приготовления, порций и пищевой ценности;
- дедупликация рецептов по ключу платформы и видео;
- отображение статуса асинхронной обработки;
- отмена задачи обработки;
- скачивание рецепта в PDF;
- русский и английский интерфейс;
- светлая и тёмная тема;
- адаптивная вёрстка для мобильных устройств и десктопа;
- health-проверки, структурированные логи, Prometheus, Grafana и Loki;
- ограничения запросов на gateway nginx.

## Как устроен проект

Фронтенд работает как React-приложение на Vite. Backend на Express принимает задачу и запускает пайплайн обработки. Этапы пайплайна разделены по воркерам:

```text
Frontend
   ↓
nginx gateway
   ↓
Backend API
   ├─ metadata-worker  — метаданные видео и доступные субтитры
   ├─ subtitles-worker — получение и подготовка текста субтитров
   ├─ llm-worker       — извлечение структуры рецепта через OpenRouter
   └─ pdf-worker       — подготовка PDF через Gotenberg
                         ↓
                      PostgreSQL
```

Обработка запускается асинхронно. API возвращает `job_id`, а фронтенд получает статус задачи через polling. Повторная обработка уже известного видео использует сохранённый рецепт.

## Технологии

- React 18, TypeScript, Vite, React Router;
- Node.js, Express, TypeScript;
- PostgreSQL и Drizzle ORM;
- yt-dlp для получения данных YouTube;
- OpenRouter и модель `meta-llama/llama-3.3-70b-instruct`;
- Gotenberg для генерации PDF;
- Docker Compose;
- nginx как gateway;
- Prometheus, Grafana, Loki, Promtail, cAdvisor и Node Exporter;
- Vitest для тестов.

## Быстрый запуск

### Требования

- Node.js 20 или новее;
- Docker и Docker Compose;
- файл окружения с параметрами PostgreSQL и OpenRouter;
- файл cookies для yt-dlp, если он нужен для доступа к видео.

### Фронтенд в режиме разработки

```bash
npm install
npm run dev
```

### Backend и сервисы

```bash
docker compose up -d --build
```

После запуска основной локальный адрес фронтенда — `http://127.0.0.1:8080`. Backend доступен через `http://127.0.0.1:8000`.

### Мониторинг

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Prometheus, Grafana и Loki доступны внутри Docker-сети мониторинга. Grafana публикуется только на локальном порту сервера и может быть проксирована через внешний nginx.

## API

Основные ручки:

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/v1/recipes` | создать задачу обработки видео |
| `GET` | `/v1/recipes/{job_id}` | получить статус или результат |
| `POST` | `/v1/recipes/{job_id}/cancel` | отменить задачу |
| `GET` | `/v1/recipes/{job_id}/pdf` | скачать PDF |
| `GET` | `/health/live` | проверить, что процесс Backend работает |
| `GET` | `/health/ready` | проверить готовность Backend и подключение к PostgreSQL |
| `GET` | `/metrics` | получить метрики Prometheus |

Подробные форматы запросов, ответов и ошибок описаны в [контракте API](docs/API%20contract/ENDPOINTS_DESCRIPTION.md).

## Логи и мониторинг

Backend и воркеры пишут структурированные JSON-логи. В логах используются `trace_id`, IP клиента и `job_id`, когда запись относится к задаче обработки. Логи Docker собираются Promtail и хранятся в Loki.

Prometheus собирает инфраструктурные метрики Node Exporter и cAdvisor, а также прикладные метрики Backend:

- созданные и завершённые задачи;
- попадания в кэш;
- ошибки по этапам пайплайна;
- ошибки лимитов LLM;
- скачивания PDF;
- длительность пайплайна и распределение времени выполнения.

Grafana используется для инфраструктурных, контейнерных и прикладных дашбордов. Конфигурация мониторинга находится в каталоге [`monitoring`](monitoring/), а бизнесовый дашборд — в [`monitoring/grafana/dashboards/business.json`](monitoring/grafana/dashboards/business.json).

## Rate limits

На gateway nginx настроены ограничения:

- создание рецептов — до 5 запросов в минуту с одного IP, с разрешённым кратковременным burst;
- остальные API-запросы — до 60 запросов в минуту с одного IP, также с burst;
- при превышении лимита возвращается HTTP 429.

Backend и базы данных публикуются только на loopback-интерфейсе сервера, поэтому прямой доступ к ним из интернета закрыт.

## Тестирование

Тесты приложения запускаются командой:

```bash
npm test
```

Нагрузочные и лимитные сценарии находятся в [`load-test`](load-test/). Результаты проведённых прогонов собраны в [`load-test/RESULTS.md`](load-test/RESULTS.md).

В репозитории также находятся проверки внешних сервисов в [`backend/external_services_tests`](backend/external_services_tests/). Они отдельно проверяют получение метаданных, субтитров и работу LLM.

## Документация

### API и данные

- [Контракт API](docs/API%20contract/ENDPOINTS_DESCRIPTION.md)
- [Схема данных рецепта](docs/API%20contract/RECIPE_DATA_SCHEMA.md)
- [ER-диаграмма PostgreSQL](docs/Data/postgres/ER_DIAGRAM_POSTGRES.md)
- [Индексы PostgreSQL](docs/Data/postgres/INDEXES_POSTGRES.md)
- [Ключи Redis](docs/Data/redis/KEYS.md)

### Архитектура и внешние сервисы

- [Диаграмма развёртывания](docs/Services%20and%20additional%20info/DEPLOYMENT_DIAGRAM.md)
- [Последовательность обработки](docs/Services%20and%20additional%20info/SEQUENCE_DIAGRAM.md)
- [Внешние сервисы](docs/Services%20and%20additional%20info/EXTERNAL_SERVICES.md)
- [Промпты LLM](docs/Services%20and%20additional%20info/PROMPTS.md)

### Мониторинг и нагрузочные проверки

- [Сводные результаты нагрузочного тестирования](load-test/RESULTS.md)
- [Скрипты нагрузочного тестирования](load-test/)
- [Prometheus](monitoring/prometheus.yml)
- [Loki](monitoring/loki.yml)
- [Promtail](monitoring/promtail.yml)
- [Бизнесовый дашборд Grafana](monitoring/grafana/dashboards/business.json)

## Структура репозитория

```text
backend/       Backend API, воркеры, база данных и интеграции
common/        Общая валидация URL и платформ
docs/          Архитектурная, API- и пользовательская документация
src/           React-фронтенд
monitoring/    Prometheus, Loki, Promtail и Grafana
load-test/     Нагрузочные и лимитные тесты
tests/         Тесты фронтенда и общих компонентов
```
