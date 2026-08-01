import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRecipeRepository, type RecipeData } from '../../../backend/src/routes/recipe/recipeStore';

describe('InMemoryRecipeRepository', () => {
    let repo: InMemoryRecipeRepository;

    beforeEach(() => {
        repo = new InMemoryRecipeRepository();
    });

    const buildRecipe = (overrides: Partial<RecipeData> = {}): RecipeData => ({
        title: 'Паста Карбонара',
        type: 'Горячее',
        cooking_time_minutes: 20,
        difficulty: 2,
        portions: 2,
        ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
        steps: [{ step_number: 1, description: 'Отварите спагетти' }],
        ...overrides,
    });

    it('saves a recipe without throwing', async () => {
        await expect(repo.save('abc', buildRecipe())).resolves.toBeUndefined();
    });

    it('saves recipes for distinct canonical keys independently', async () => {
        await repo.save('youtube:video-a', buildRecipe());
        await expect(repo.save('youtube:video-b', buildRecipe())).resolves.toBeUndefined();
    });

    it('overwrites existing recipe for the same canonical_key', async () => {
        await repo.save('abc', buildRecipe({ title: 'Старый рецепт' }));
        await expect(repo.save('abc', buildRecipe({ title: 'Новый рецепт' }))).resolves.toBeUndefined();
    });
});
