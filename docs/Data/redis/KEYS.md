### Соглашение об именовании ключей

```
v2r:{сущность}:{идентификатор}[:доп_поля]
```
### Полная схема ключей Redis
| Ключ                                     | Тип данных | TTL                    | Поля                                                                                                   | Назначение                                       |
|------------------------------------------|------------|------------------------|--------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| `v2r:queue:jobs:pending`                 | Stream     | - (чистится воркерами) | job_id, source_url, video_id, platform, priority, retry_count, created_at, timeout_at                  | Основная очередь задач для воркеров              |
| `v2r:queue:jobs:dlq`                     | Stream     | -                      | job_id, error_code, error_message, failed_at, payload                                                  | Dead Letter Queue для ошибок >max_retries        |
| `v2r:job:{job_id}:status`                | Hash       | 24ч                    | status, progress_percent, created_at, completed_at, error_code, error_message, pdf_url, pdf_expires_at | Кэш статуса для API поллинга (GET /recipes/{id}) |
| `v2r:ratelimit:ip:{ip_hash}:{window_ts}` | String     | 1ч                     | Числовой счётчик (INCR)                                                                                | Rate limiting: 10 запросов/час на IP             |

