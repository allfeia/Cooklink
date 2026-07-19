````## Схема данных рецепта (TypeScript-интерфейс)

Для типизации на фронтенде и валидации на бэкенде:


```ts

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type JobStatus =
    | 'scanning'    // получение метаданных видео
    | 'downloading' // скачивание аудиофайла по ссылке
    | 'transcribing' // получение/генерация транскрипции
    | 'llm_processing' // извлечение рецепта через LLM
    | 'generating_pdf' // генерация PDF
    | 'completed'    // успешно завершено
    | 'failed'       // ошибка
    | 'cancelled';   // отменено пользователем

export interface Ingredient {
  name: string;              // min 1, max 100 chars
  quantity: string | number; // "200" | 200 | "по вкусу"
  unit: string;              // enum["г", "мл", "шт", "ст.л.", "ч.л.", ""]
}
// если quantity="по вкусу", то unit=""

export interface RecipeStep {
  step_number: number;       // 1..50
  description: string;       // min 10, max 1000 chars
}

export interface RecipeData {
  title: string;             // 3..100 chars
  type: string;              // enum["Горячее", "Суп", "Десерт", "Салат", "Закуска"]
  cooking_time_minutes: number; // >= 1
  difficulty: Difficulty;    // 1..5
  portions: number;          // >= 1
  ingredients: Ingredient[]; // min 1, max 50
  steps: RecipeStep[];       // min 1, max 50
  comments?: string;         // optional, max 1000 chars
  dish_image_url?: string;   // optional, valid URL
}


export interface RecipeJob {
  job_id: string;            // UUID v4
  recipe_id?: string;         // UUID v4
  source_url: string;        // URL
  canonical_key: string;     // составной ключ видео из домена + id видео
  status: JobStatus;
  data?: RecipeData;         // присутствует только если status === 'completed'
  error_code?: string;       // присутствует только если status === 'failed'
  error_message?: string;    // human-readable описание ошибки
  pdf_url?: string;          // presigned URL, TTL 24h
  pdf_expires_at?: string;   // ISO 8601 timestamp
  created_at: string;        // ISO 8601 timestamp
}
```
````