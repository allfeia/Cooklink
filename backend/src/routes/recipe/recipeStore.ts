import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { recipes } from '../../db/schema';

export const RECIPE_TYPES = ['Горячее', 'Суп', 'Десерт', 'Салат', 'Закуска'] as const;
export type RecipeType = (typeof RECIPE_TYPES)[number];

export interface RecipeData {
    title: string;
    type: RecipeType;
    cooking_time_minutes: number;
    nutrition_per_100g: { calories: number; protein: number; fat: number; carbs: number };
    portions: number;
    ingredients: { name: string; quantity: string | number; unit: string }[];
    steps: { step_number: number; description: string }[];
    comments?: string;
}

export interface RecipeRepository {
    save(canonicalKey: string, recipe: RecipeData): Promise<void>;
    get(canonicalKey: string): Promise<RecipeData | undefined>;
}

export class InMemoryRecipeRepository implements RecipeRepository {
    private recipeByCanonicalKey = new Map<string, RecipeData>();

    async save(canonicalKey: string, recipe: RecipeData): Promise<void> {
        this.recipeByCanonicalKey.set(canonicalKey, recipe);
    }

    async get(canonicalKey: string): Promise<RecipeData | undefined> {
        return this.recipeByCanonicalKey.get(canonicalKey);
    }
}

export class PostgresRecipeRepository implements RecipeRepository {
    async save(canonicalKey: string, recipe: RecipeData): Promise<void> {
        await db
            .insert(recipes)
            .values({ canonicalKey, recipe })
            .onConflictDoUpdate({ target: recipes.canonicalKey, set: { recipe } });
    }

    async get(canonicalKey: string): Promise<RecipeData | undefined> {
        const [row] = await db
            .select()
            .from(recipes)
            .where(eq(recipes.canonicalKey, canonicalKey))
            .limit(1);
        return row ? (row.recipe as RecipeData) : undefined;
    }
}

export const recipeStore: RecipeRepository = new PostgresRecipeRepository();
