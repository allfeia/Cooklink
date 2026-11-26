# CookLink.ai

[Русский](README.md) · [English](README.en.md)

CookLink.ai turns a video recipe link into a structured recipe and a PDF file. The user submits a YouTube link, the service retrieves the video's metadata and subtitles, extracts the recipe with an LLM, and generates a PDF.

The project is currently at the MVP stage.

## Features

- YouTube link processing;
- extraction of the title, ingredients, steps, cooking time, servings, and nutrition data;
- recipe deduplication by platform and video key;
- asynchronous processing status;
- job cancellation;
- PDF recipe downloads;
- Russian and English interface;
- light and dark themes;
- responsive desktop and mobile layout;
- health checks, structured logs, Prometheus, Grafana, and Loki;
- request limits at the nginx gateway.

## Architecture

The frontend is a React application built with Vite. The Express backend accepts jobs and starts the processing pipeline. Pipeline stages are separated into workers:

```text
Frontend
   ↓
nginx gateway
   ↓
Backend API
   ├─ metadata-worker  — video metadata and available subtitles
   ├─ subtitles-worker — subtitle retrieval and text preparation
   ├─ llm-worker       — recipe extraction through OpenRouter
   └─ pdf-worker       — PDF generation through Gotenberg
                         ↓
                      PostgreSQL
```

Processing is asynchronous. The API returns a `job_id`, and the frontend polls the job status. A previously processed video is served from the stored recipe.

## Technology stack

- React 18, TypeScript, Vite, React Router;
- Node.js, Express, TypeScript;
- PostgreSQL and Drizzle ORM;
- yt-dlp for retrieving YouTube data;
- OpenRouter with `meta-llama/llama-3.3-70b-instruct`;
- Gotenberg for PDF generation;
- Docker Compose;
- nginx as the gateway;
- Prometheus, Grafana, Loki, Promtail, cAdvisor, and Node Exporter;
- Vitest for tests.

## Quick start

### Requirements

- Node.js 20 or newer;
- Docker and Docker Compose;
- environment variables for PostgreSQL and OpenRouter;
- a yt-dlp cookies file when required for video access.

### Frontend development mode

```bash
npm install
npm run dev
```

### Backend and services

```bash
docker compose up -d --build
```

The local frontend is available at `http://127.0.0.1:8080`. The backend is available at `http://127.0.0.1:8000`.

### Monitoring

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

Prometheus, Grafana, and Loki run in the Docker monitoring network. Grafana is published only on the server's local port and can be exposed through an external nginx proxy.

## API

Main endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/recipes` | create a video processing job |
| `GET` | `/v1/recipes/{job_id}` | get job status or result |
| `POST` | `/v1/recipes/{job_id}/cancel` | cancel a job |
| `GET` | `/v1/recipes/{job_id}/pdf` | download the PDF |
| `GET` | `/health/live` | check that the backend process is running |
| `GET` | `/health/ready` | check backend readiness and the PostgreSQL connection |
| `GET` | `/metrics` | expose Prometheus metrics |

Request, response, and error formats are described in the [API contract](docs/API%20contract/ENDPOINTS_DESCRIPTION.md).

## Logs and monitoring

The backend and workers write structured JSON logs. Logs include `trace_id`, the client IP, and `job_id` when a record belongs to a processing job. Docker logs are collected by Promtail and stored in Loki.

Prometheus collects infrastructure metrics from Node Exporter and cAdvisor, as well as backend application metrics:

- created and completed jobs;
- cache hits;
- pipeline failures by stage;
- LLM limit errors;
- PDF downloads;
- pipeline duration and execution-time distribution.

Grafana is used for infrastructure, container, and application dashboards. Monitoring configuration is stored in [`monitoring`](monitoring/), and the business dashboard is located at [`monitoring/grafana/dashboards/business.json`](monitoring/grafana/dashboards/business.json).

## Rate limits

The nginx gateway applies the following limits:

- recipe creation — up to 5 requests per minute per IP, with a short burst allowance;
- other API requests — up to 60 requests per minute per IP, also with a burst allowance;
- exceeding a limit returns HTTP 429.

The backend and databases are published only on the server loopback interface, so they are not directly reachable from the internet.

## Testing

Run the application tests with:

```bash
npm test
```

Load and limit scenarios are located in [`load-test`](load-test/). Results are collected in [`load-test/RESULTS.md`](load-test/RESULTS.md).

External service checks are located in [`backend/external_services_tests`](backend/external_services_tests/). They cover metadata retrieval, subtitles, and LLM calls.

## Documentation

### API and data

- [API contract](docs/API%20contract/ENDPOINTS_DESCRIPTION.md)
- [Recipe data schema](docs/API%20contract/RECIPE_DATA_SCHEMA.md)
- [PostgreSQL ER diagram](docs/Data/postgres/ER_DIAGRAM_POSTGRES.md)
- [PostgreSQL indexes](docs/Data/postgres/INDEXES_POSTGRES.md)
- [Redis keys](docs/Data/redis/KEYS.md)

### Architecture and external services

- [Deployment diagram](docs/Services%20and%20additional%20info/DEPLOYMENT_DIAGRAM.md)
- [Processing sequence](docs/Services%20and%20additional%20info/SEQUENCE_DIAGRAM.md)
- [External services](docs/Services%20and%20additional%20info/EXTERNAL_SERVICES.md)
- [LLM prompts](docs/Services%20and%20additional%20info/PROMPTS.md)

### Monitoring and load testing

- [Load testing results](load-test/RESULTS.md)
- [Load testing scripts](load-test/)
- [Prometheus](monitoring/prometheus.yml)
- [Loki](monitoring/loki.yml)
- [Promtail](monitoring/promtail.yml)
- [Business Grafana dashboard](monitoring/grafana/dashboards/business.json)

## Repository structure

```text
backend/       Backend API, workers, database, and integrations
common/        Shared URL and platform validation
docs/          Architecture, API, and user documentation
src/           React frontend
monitoring/    Prometheus, Loki, Promtail, and Grafana
load-test/     Load and limit tests
tests/         Frontend and shared component tests
```
