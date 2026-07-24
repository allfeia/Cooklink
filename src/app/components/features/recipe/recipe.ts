export interface Recipe {
  title: string;
  time: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  servings: number;
  type: string;
  ingredients: Ingredient[];
  steps: string[];
  comment?: string;
  youtubeUrl?: string;
  dishImage?: string;
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
  difficulty: 1 | 2 | 3 | 4 | 5;
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

export function mapApiRecipeToRecipe(data: ApiRecipeData, sourceUrl: string): Recipe {
  return {
    title: data.title,
    time: data.cooking_time_minutes,
    difficulty: data.difficulty,
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
  };
}

export const EXAMPLE_RECIPES = {
  carbonara: {
    url: "https://youtube.com/watch?v=carbonara",
    title: "Паста Карбонара",
  },
  borscht: {
    url: "https://youtube.com/watch?v=borscht",
    title: "Классический Борщ",
  },
  napoleon: {
    url: "https://youtube.com/watch?v=napoleon",
    title: "Торт Наполеон",
  },
};

export const MOCK_RECIPE: Recipe = {
  title: "Паста Карбонара",
  time: 30,
  difficulty: 2,
  servings: 4,
  type: "Основное блюдо",
  youtubeUrl: "https://youtube.com/watch?v=carbonara",
  dishImage: "", // Will be set dynamically
  ingredients: [
    { quantity: "400", unit: "г", name: "спагетти" },
    { quantity: "200", unit: "г", name: "бекон" },
    { quantity: "4", unit: "шт", name: "яичных желтка" },
    { quantity: "100", unit: "г", name: "сыра пармезан" },
    { quantity: "2", unit: "зубчика", name: "чеснока" },
    { quantity: "по вкусу", unit: "", name: "черный перец" },
    { quantity: "по вкусу", unit: "", name: "соль" },
  ],
  steps: [
    "Отварите спагетти в подсоленной воде до состояния al dente согласно инструкции на упаковке.",
    "Нарежьте бекон небольшими кусочками и обжарьте на сковороде до золотистого цвета.",
    "Добавьте к бекону измельченный чеснок и обжаривайте еще 1 минуту.",
    "В миске смешайте яичные желтки с натертым пармезаном и черным перцем.",
    "Слейте воду со спагетти, оставив немного воды для соуса.",
    "Немедленно добавьте горячие спагетти к яичной смеси, постоянно помешивая.",
    "Добавьте бекон с чесноком, перемешайте. При необходимости добавьте немного воды от пасты.",
    "Подавайте сразу же, посыпав дополнительным пармезаном и черным перцем.",
  ],
  comment:
    "Классический рецепт римской пасты карбонара. Главный секрет — снять сковороду с огня перед добавлением яиц, чтобы они не свернулись!",
};
