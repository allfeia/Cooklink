### Промпт для Qwen-72B

```text
Ты — эксперт по кулинарии. Извлеки рецепт из следующей транскрипции видео.

Требования:
1. Верни ТОЛЬКО валидный JSON без пояснений
2. Не выдумывай ингредиенты, не упомянутые в тексте
3. Агрегируй повторяющиеся ингредиенты (соль в шагах 1 и 3 → один раз)
4. Оцени сложность от 1 до 5 на основе техник и количества шагов

Схема ответа:
{
  "title": "string (3-100 chars)",
  "type": "string",
  "cooking_time_minutes": number,
  "difficulty": 1|2|3|4|5,
  "portions": number,
  "ingredients": [{"name": "string", "quantity": number|string, "unit": "string"}],
  "steps": [{"step_number": number, "description": "string (max 500 chars)"}],
  "comments": "string (optional, max 500 chars)"
}

Транскрипция:
"""
{transcript_text}
"""
```
// TODO:
### Промпт для Unsplash API (генерация изображения по рецепту)