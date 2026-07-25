export const RECIPE_TYPES = ['Горячее', 'Суп', 'Десерт', 'Салат', 'Закуска'] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export interface RecipeData {
    title: string;
    type: RecipeType;
    cooking_time_minutes: number;
    difficulty: 1 | 2 | 3 | 4 | 5;
    portions: number;
    ingredients: { name: string; quantity: string | number; unit: string }[];
    steps: { step_number: number; description: string }[];
    comments?: string;
}

export interface RecipeRepository {
    save(videoId: string, recipe: RecipeData): Promise<void>;
}

export class InMemoryRecipeRepository implements RecipeRepository {
    private recipeByVideoId = new Map<string, RecipeData>();

    async save(videoId: string, recipe: RecipeData): Promise<void> {
        this.recipeByVideoId.set(videoId, recipe);
    }
}

export const recipeStore: RecipeRepository = new InMemoryRecipeRepository();
