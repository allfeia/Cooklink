# Backend API: эндпоинты и правила использования

Описание текущих HTTP-эндпоинтов бэкенда Video2Recipe, их назначение, форматы запросов/ответов, а также типичные ошибки.

## Общие сведения

- **Base URL**: `https://api.video2recipe.com/v1` (prod) или `http://localhost:8000/v1` (dev)
- **Content-Type**: `application/json` для всех запросов с телом

### Rate Limiting

| Параметр | Значение | Заголовок ответа |
|----------|----------|-----------------|
| Лимит запросов | 10 запросов / час / IP | `X-RateLimit-Limit: 10` |
| Остаток | — | `X-RateLimit-Remaining: 9` |
| Сброс лимита | UTC Timestamp | `X-RateLimit-Reset: 1711630000` |
| Превышение лимита | HTTP 429 | `Retry-After: 3600` |

Все ответы включают заголовки rate limiting для информирования клиента.

---

## Эндпоинты

### 1. Healthcheck

**GET `/health`**

Назначение: проверка доступности сервиса и статуса подключения к зависимостям (БД, Redis, LLM, Storage).

**Ответ (200):**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "db": "up",
    "redis": "up",
    "llm_provider": "up",
    "storage": "up"
  }
}
```

---

### 2. Создать задачу (Generate Recipe)

**POST `/recipes`**

Назначение: принять ссылку на You(Ru)Tube-видео, запустить асинхронный пайплайн обработки, вернуть идентификатор задачи для поллинга

**Тело запроса:**

```json
{
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

Ограничения:

- `source_url` — обязательное поле, валидный URL домена `youtube.com` / `youtu.be` или `rutube.ru`
- Видео должно быть публичным и доступным
- Максимальная длительность видео: **15 минут** (проверяется во время обработки)

**Ответ (202 Accepted):**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "canonical_key": "youtube:dQw4w9WgXcQ",
  "status": "scanning",
  "created_at": "2024-05-25T10:00:00Z"
}
```

- `job_id` — UUID v4, используется для поллинга статуса
- `canonical_key` — составной ключ `{platform}:{videoId}`, используется для дедупликации
- `status` — начальный статус всегда `scanning`

**Возможные ошибки POST `/recipes`:**

- `400` — `INVALID_URL` (неверный формат ссылки или неподдерживаемый домен) — возвращается немедленно

Остальные ошибки обработки (`VIDEO_UNAVAILABLE`, `VIDEO_TOO_LONG`, `NO_SUBTITLES` и т.д.) не возвращаются при создании задачи — они устанавливают `status: "failed"` внутри задачи и доступны через `GET /recipes/{job_id}`.

---

### 3. Получить статус и результат задачи

**GET `/recipes/{job_id}`**

Назначение: получить текущий статус обработки задачи. Используется для поллинга на фронтенде

Проверка статуса каждые 2 секунды

**Параметры пути:**

- `job_id` — UUID задачи, полученный при создании

| Статус | Описание |
|--------|----------|
| `scanning` | Получение метаданных видео |
| `transcribing` | Получение субтитров |
| `llm_processing` | Извлечение рецепта через LLM |
| `generating_pdf` | Генерация PDF |
| `completed` | Успешно завершено |
| `failed` | Завершено с ошибкой |
| `cancelled` | Отменено пользователем |

**Ответ (200) — задача в процессе:**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "canonical_key": "youtube:dQw4w9WgXcQ",
  "status": "transcribing",
  "created_at": "2024-05-25T10:00:00Z"
}
```
**Ответ (200) — задача завершена успешно:**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "canonical_key": "youtube:dQw4w9WgXcQ",
  "status": "completed",
  "created_at": "2024-05-25T10:00:35Z",
  "data": {
    "title": "Паста Карбонара",
    "type": "Горячее",
    "cooking_time_minutes": 20,
    "difficulty": 3,
    "portions": 4,
    "ingredients": [
      {
        "name": "спагетти",
        "quantity": 400,
        "unit": "г"
      },
      {
        "name": "бекон",
        "quantity": 200,
        "unit": "г"
      }
    ],
    "steps": [
      {
        "step_number": 1,
        "description": "Отварите спагетти в подсоленной воде до состояния al dente."
      }
    ],
    "comments": "Классический рецепт римской пасты карбонара."
  },
  "pdf_url": "/v1/recipes/550e8400-e29b-41d4-a716-446655440000/pdf"
}
```

- `pdf_url` — относительный путь для скачивания PDF (см. эндпоинт ниже)

**Ответ (200) — задача завершена с ошибкой:**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "canonical_key": "youtube:dQw4w9WgXcQ",
  "status": "failed",
  "error_code": "AI_EXTRACTION_FAILED",
  "error_message": "Не удалось извлечь рецепт",
  "created_at": "2024-05-24T10:00:00Z"
}
```

Задача `failed` - это корректный ответ сервера на вопрос о статусе задачи, поэтому HTTP-статус остаётся `200`. Бизнес-ошибка отражается в полях `error_code` и `error_message`.

**Возможные ошибки:**

- `404` — `JOB_NOT_FOUND` (задача с таким ID не существует)

---

### 4. Скачать PDF

**GET `/recipes/{job_id}/pdf`**

Назначение: скачать сгенерированный PDF-файл рецепта. Возвращает бинарный PDF напрямую.

**Параметры пути:**

- `job_id` — UUID задачи

**Ответ (200 OK) — успешно:**

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="550e8400-e29b-41d4-a716-446655440000.pdf"

<бинарное содержимое PDF>
```

**Возможные ошибки:**

- `404` — `JOB_NOT_FOUND` (задача не найдена)
- `404` — `PDF_NOT_READY` (PDF ещё не сгенерирован — задача не завершена)

```json
{
  "error": {
    "code": "PDF_NOT_READY",
    "message": "PDF ещё не готов. Проверьте статус задачи."
  }
}
```

---

### 5. Отмена задачи

**POST `/recipes/{job_id}/cancel`**

Назначение: отменить обработку задачи, если пользователь передумал.

Отмена работает кооперативно: пайплайн проверяет статус между этапами. Уже завершённые задачи (`completed`, `failed`, `cancelled`) отменить нельзя — статус не изменится, вернётся текущее состояние задачи.

**Ответ (200) — текущее состояние задачи после попытки отмены:**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "source_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "canonical_key": "youtube:dQw4w9WgXcQ",
  "status": "cancelled",
  "created_at": "2024-05-25T10:00:00Z"
}
```

**Возможные ошибки:**

- `404` — `JOB_NOT_FOUND`

---

## Формат ошибок

### Сводка ошибок

| Код   | Error Code               | Сообщение                                     | Где возникает                                             |
|-------|--------------------------|-----------------------------------------------|-----------------------------------------------------------|
| `400` | `INVALID_URL`            | Неверный формат ссылки                        | `POST /recipes` — немедленно                              |
| `400` | `VIDEO_UNAVAILABLE`      | Видео недоступно                              | В `job.error_code` при `status: "failed"`                 |
| `400` | `VIDEO_TOO_LONG`         | Длительность видео превышает лимит в 15 минут | В `job.error_code` при `status: "failed"`                 |
| `400` | `VIDEO_NO_AUDIO`         | В видео отсутствует аудиодорожка              | В `job.error_code` при `status: "failed"`                 |
| `400` | `NO_SUBTITLES`           | Субтитры недоступны                           | В `job.error_code` при `status: "failed"`                 |
| `400` | `SUBTITLES_FETCH_FAILED` | Не удалось получить субтитры                  | В `job.error_code` при `status: "failed"`                 |
| `—`   | `AI_EXTRACTION_FAILED`   | Не удалось извлечь рецепт                     | В `job.error_code` при `status: "failed"`                 |
| `—`   | `INVALID_JSON_SCHEMA`    | Ошибка валидации ответа AI                    | В `job.error_code` при `status: "failed"`                 |
| `—`   | `PDF_GENERATION_FAILED`  | Не удалось сгенерировать PDF                  | В `job.error_code` при `status: "failed"`                 |
| `429` | `LLM_RATE_LIMITED`       | Превышен лимит запросов к LLM                 | LLM-воркер исчерпал retry к провайдеру                   |
| `404` | `JOB_NOT_FOUND`          | Задача с указанным идентификатором не найдена | `GET /recipes/{id}`, `GET /recipes/{id}/pdf`, `POST /recipes/{id}/cancel` |
| `404` | `PDF_NOT_READY`          | PDF ещё не готов                              | `GET /recipes/{id}/pdf` — задача ещё не `completed`       |
| `500` | `INTERNAL_SERVER_ERROR`  | Внутренняя ошибка сервера                     | Критический сбой                                          |

---

### Ошибки валидации (400)

```json
{
  "error": {
    "code": "INVALID_URL",
    "message": "Неверный формат ссылки",
    "details": {
      "source_url": "https://example.com"
    }
  }
}
```

### Ошибки доступности (400)

```json
{
  "error": {
    "code": "VIDEO_UNAVAILABLE",
    "message": "Видео недоступно",
    "details": {
      "video_url": "https://www.youtube.com/watch?v=ABC123"
    }
  }
}
```

### Ошибки длительности (400)

```json
{
  "error": {
    "code": "VIDEO_TOO_LONG",
    "message": "Длительность видео превышает лимит в 15 минут",
    "details": {
      "video_duration_sec": 1245,
      "max_duration_sec": 900,
      "video_url": "https://www.youtube.com/watch?v=ABC123"
    }
  }
}
```

### Ошибка отсутствия аудио (400)

```json
{
  "error": {
    "code": "VIDEO_NO_AUDIO",
    "message": "В видео отсутствует аудиодорожка",
    "details": {
      "video_url": "https://www.youtube.com/watch?v=ABC123"
    }
  }
}
```

### Ошибка отсутствия субтитров (400)

Возвращается, когда у видео нет субтитров ни на `ru`, ни на `en` (ни ручных, ни автоматических), либо скачанный текст пустой после снятия разметки:

```json
{
  "error": {
    "code": "NO_SUBTITLES",
    "message": "Субтитры недоступны",
    "details": {
      "source_url": "https://www.youtube.com/watch?v=ABC123"
    }
  }
}
```

### Ошибка получения субтитров (400)

Возвращается, когда загрузка субтитров стабильно падает — YouTube отвечает `429` после исчерпания всех retry (с exponential backoff), либо происходит другая техническая ошибка при обращении к `yt-dlp`:

```json
{
  "error": {
    "code": "SUBTITLES_FETCH_FAILED",
    "message": "Не удалось получить субтитры",
    "details": {
      "reason": "HTTP Error 429: Too Many Requests"
    }
  }
}
```

### Ошибка LLM-провайдера (429)

Возвращается LLM-воркером, когда исчерпаны retry к провайдеру из-за rate limiting:

```json
{
  "error": {
    "code": "LLM_RATE_LIMITED",
    "message": "Превышен лимит запросов к LLM"
  }
}
```

### Ошибка отсутствия задачи (404)

```json
{
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Задача с указанным идентификатором не найдена",
    "details": {
      "job_id": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

### Ошибка отсутствия PDF (404)

```json
{
  "error": {
    "code": "PDF_NOT_READY",
    "message": "PDF ещё не готов. Проверьте статус задачи."
  }
}
```

### Ошибка сервера (500)

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Внутренняя ошибка сервера",
    "details": {
      "timestamp": "2024-05-24T10:00:00Z"
    }
  }
}
```
