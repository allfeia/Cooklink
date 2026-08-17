import type { RecipeData } from '../recipe/recipeStore';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAmount(quantity: string | number, unit: string): string {
    return [String(quantity), unit].filter(Boolean).join(' ').trim();
}

export function buildRecipeHtml(recipe: RecipeData): string {
    const ingredientsHtml = recipe.ingredients
        .map((ingredient) => {
            const amount = formatAmount(ingredient.quantity, ingredient.unit);
            const amountHtml = amount ? ` <span class="amount">— ${escapeHtml(amount)}</span>` : '';
            return `<li>${escapeHtml(ingredient.name)}${amountHtml}</li>`;
        })
        .join('\n');

    const stepsHtml = [...recipe.steps]
        .sort((a, b) => a.step_number - b.step_number)
        .map((step) => `<li>${escapeHtml(step.description)}</li>`)
        .join('\n');

    const commentHtml = recipe.comments
        ? `<div class="comment">💭 ${escapeHtml(recipe.comments)}</div>`
        : '';

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(recipe.title)}</title>
<style>
  @page { margin: 24mm 18mm; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f2937; margin: 0; }
  h1 { font-size: 26px; margin: 0 0 12px; }
  .meta { display: flex; gap: 20px; flex-wrap: wrap; color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .meta strong { color: #1f2937; display: block; font-size: 14px; }
  h2 { font-size: 16px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; margin: 20px 0 10px; }
  ul, ol { margin: 0; padding-left: 20px; }
  li { margin-bottom: 8px; line-height: 1.5; }
  .amount { color: #2563eb; font-weight: 600; }
  .comment { margin-top: 20px; padding: 12px 16px; background: #f3f4f6; border-radius: 8px; font-style: italic; color: #4b5563; }
</style>
</head>
<body>
  <h1>${escapeHtml(recipe.title)}</h1>
  <div class="meta">
    <div>Время<strong>${recipe.cooking_time_minutes} мин</strong></div>
    <div>Порции<strong>${recipe.portions}</strong></div>
    <div>Тип<strong>${escapeHtml(recipe.type)}</strong></div>
    <div>КБЖУ на 100г<strong>К ${recipe.nutrition_per_100g.calories} · Б ${recipe.nutrition_per_100g.protein} · Ж ${recipe.nutrition_per_100g.fat} · У ${recipe.nutrition_per_100g.carbs}</strong></div>
  </div>
  <h2>Ингредиенты</h2>
  <ul>
${ingredientsHtml}
  </ul>
  <h2>Приготовление</h2>
  <ol>
${stepsHtml}
  </ol>
  ${commentHtml}
</body>
</html>`;
}
