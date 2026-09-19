import { describe, expect, it } from 'vitest';
import { buildRecipeHtml } from '../../../backend/src/routes/pdf/pdfTemplate';
import type { RecipeData } from '../../../backend/src/routes/recipe/recipeStore';

const buildRecipe = (overrides: Partial<RecipeData> = {}): RecipeData => ({
    title: 'Паста Карбонара',
    type: 'Горячее',
    cooking_time_minutes: 20,
    nutrition_per_100g: { calories: 250, protein: 12, fat: 10, carbs: 30 },
    portions: 2,
    ingredients: [{ name: 'спагетти', quantity: 200, unit: 'г' }],
    steps: [{ step_number: 1, description: 'Отварите спагетти' }],
    ...overrides,
});

describe('buildRecipeHtml', () => {
    it('includes title, meta info, ingredients and steps', () => {
        const html = buildRecipeHtml(buildRecipe());

        expect(html).toContain('Паста Карбонара');
        expect(html).toContain('20 мин');
        expect(html).toContain('К 250 · Б 12 · Ж 10 · У 30');
        expect(html).toContain('спагетти');
        expect(html).toContain('200 г');
        expect(html).toContain('Отварите спагетти');
    });

    it('renders the header brand as a clickable link to the site', () => {
        const html = buildRecipeHtml(buildRecipe());

        expect(html).toMatch(/<div class="brand"><a href="https:\/\/cooklink\.ru">cooklink<i>\.ai<\/i><\/a><\/div>/);
    });

    it('renders steps in step_number order regardless of input order', () => {
        const html = buildRecipeHtml(
            buildRecipe({
                steps: [
                    { step_number: 2, description: 'Второй шаг' },
                    { step_number: 1, description: 'Первый шаг' },
                ],
            })
        );

        expect(html.indexOf('Первый шаг')).toBeLessThan(html.indexOf('Второй шаг'));
    });

    it('escapes HTML special characters in user-controlled fields', () => {
        const html = buildRecipeHtml(
            buildRecipe({ title: '<script>alert(1)</script>' })
        );

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('omits the comment block when comments are absent', () => {
        const html = buildRecipeHtml(buildRecipe());
        expect(html).not.toContain('class="comment"');
    });

    it('includes the comment block when comments are present', () => {
        const html = buildRecipeHtml(buildRecipe({ comments: 'Приятного аппетита' }));
        expect(html).toContain('Приятного аппетита');
    });
});
