import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { recipes } from '../../db/schema';

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
    get(videoId: string): Promise<RecipeData | undefined>;
}

export class InMemoryRecipeRepository implements RecipeRepository {
    private recipeByVideoId = new Map<string, RecipeData>();

    async save(videoId: string, recipe: RecipeData): Promise<void> {
        this.recipeByVideoId.set(videoId, recipe);
    }

    async get(videoId: string): Promise<RecipeData | undefined> {
        return this.recipeByVideoId.get(videoId);
    }
}

export class PostgresRecipeRepository implements RecipeRepository {
    async save(videoId: string, recipe: RecipeData): Promise<void> {
        await db
            .insert(recipes)
            .values({ videoId, recipe })
            .onConflictDoUpdate({ target: recipes.videoId, set: { recipe } });
    }

    async get(videoId: string): Promise<RecipeData | undefined> {
        const [row] = await db
            .select()
            .from(recipes)
            .where(eq(recipes.videoId, videoId))
            .limit(1);
        return row ? (row.recipe as RecipeData) : undefined;
    }
}

export const recipeStore: RecipeRepository = new PostgresRecipeRepository();
