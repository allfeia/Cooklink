## Интеграция с внешними сервисами (внутренняя логика)

Эти вызовы не видны клиенту, но важны для понимания пайплайна:

| Сервис | Назначение | Формат данных |
|--------|-----------|---------------|
| **YouTube Data API** | Получение метаданных видео, проверка доступности | JSON: `{ title, duration, has_captions }` |
| **YouTube TimedText** | Извлечение субтитров (CC) | XML/JSON: транскрипция с таймкодами |
| **Yandex SpeechKit** | Транскрибация аудио (fallback) | POST audio/m4a → JSON: `{ text, confidence }` |
| **Qwen-72B API** | Извлечение рецепта из текста | POST prompt + transcript → JSON recipe |
| **Yandex Object Storage** | Хранение PDF | PUT PDF binary → presigned URL |

// TODO: подробнее расписать асинхронный пайплайн обработки