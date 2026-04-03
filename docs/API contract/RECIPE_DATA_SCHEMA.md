## Схема данных рецепта (TypeScript-интерфейс)

Для типизации на фронтенде и валидации на бэкенде:


```ts

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export type JobStatus = 'processing' | 'completed' | 'failed';

export interface Ingredient {
  name: string;              // min 1, max 100 chars
  quantity: string | number; // "200" | 200 | "по вкусу"
  unit: string;              // "г", "мл", "шт", "ст.л.", "ч.л.", ""
}
// если quantity="по вкусу", то unit=""

export interface RecipeStep {
  step_number: number;       // 1..20
  description: string;       // min 10, max 500 chars
}

export interface RecipeData {
  title: string;             // 3..100 chars
  type: string;              // "Основное блюдо", "Десерт"...
  cooking_time_minutes: number; // >= 1
  difficulty: Difficulty;    // 1..5
  portions: number;          // >= 1
  ingredients: Ingredient[]; // min 1, max 50
  steps: RecipeStep[];       // min 1, max 20
  comments?: string;         // optional, max 500 chars
  dish_image_url?: string;   // optional, valid URL
}

export interface RecipeJob {
  job_id: string;            // UUID v4
  recipe_id: string;         // UUID v4
  source_url: string;        // нормализованный You(Ru)Tube URL
  status: JobStatus;
  data?: RecipeData;         // присутствует только если status === 'completed'
  error_code?: string;       // присутствует только если status === 'failed'
  error_message?: string;    // human-readable описание ошибки
  pdf_url?: string;          // presigned URL, TTL 24h
  pdf_expires_at?: string;   // ISO 8601 timestamp
  created_at: string;        // ISO 8601 timestamp
}
```
