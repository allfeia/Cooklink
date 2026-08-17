export interface Nutrition {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface Recipe {
  title: string;
  time: number;
  nutrition: Nutrition;
  servings: number;
  type: string;
  ingredients: Ingredient[];
  steps: string[];
  comment?: string;
  youtubeUrl?: string;
  dishImage?: string;
  pdfUrl?: string;
}

export interface Ingredient {
  quantity: string;
  unit: string;
  name: string;
}

export const RECIPE_TYPES = ["Горячее", "Суп", "Десерт", "Салат", "Закуска"] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export interface ApiRecipeData {
  title: string;
  type: RecipeType;
  cooking_time_minutes: number;
  nutrition_per_100g: { calories: number; protein: number; fat: number; carbs: number };
  portions: number;
  ingredients: { name: string; quantity: string | number; unit: string }[];
  steps: { step_number: number; description: string }[];
  comments?: string;
}

function normalizeQuantity(rawQuantity: string | number, unit: string): string {
  const quantity = String(rawQuantity ?? "").trim();
  if (!quantity || !unit) return quantity;

  const unitTrimmed = unit.trim();
  if (unitTrimmed && quantity.toLowerCase().endsWith(unitTrimmed.toLowerCase())) {
    return quantity.slice(0, quantity.length - unitTrimmed.length).trim();
  }
  return quantity;
}

export function mapApiRecipeToRecipe(data: ApiRecipeData, sourceUrl: string, pdfUrl?: string): Recipe {
  return {
    title: data.title,
    time: data.cooking_time_minutes,
    nutrition: data.nutrition_per_100g,
    servings: data.portions,
    type: data.type,
    ingredients: data.ingredients.map((ingredient) => {
      const unit = (ingredient.unit ?? "").trim();
      return {
        quantity: normalizeQuantity(ingredient.quantity, unit),
        unit,
        name: ingredient.name,
      };
    }),
    steps: [...data.steps]
      .sort((a, b) => a.step_number - b.step_number)
      .map((step) => step.description),
    comment: data.comments,
    youtubeUrl: sourceUrl,
    dishImage: "",
    pdfUrl,
  };
}

