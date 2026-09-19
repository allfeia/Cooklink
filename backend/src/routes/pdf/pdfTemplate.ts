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

const BURST = `<svg class="burst" viewBox="0 0 120 120" aria-hidden="true"><polygon fill="currentColor" points="60,2 65.9,37.8 89,9.8 76.3,43.7 110.2,31 82.2,54 118,60 82.2,66 110.2,89 76.3,76.3 89,110.2 65.9,82.2 60,118 54,82.2 31,110.2 43.7,76.3 9.8,89 37.8,66 2,60 37.8,54 9.8,31 43.7,43.7 31,9.8 54,37.8"/></svg>`;

const SITE_URL = 'https://cooklink.ru';

export function buildRecipeHtml(recipe: RecipeData): string {
    const ingredientsHtml = recipe.ingredients
        .map((ingredient) => {
            const amount = formatAmount(ingredient.quantity, ingredient.unit);
            const amountHtml = amount
                ? `<span class="dots"></span><span class="amount">${escapeHtml(amount)}</span>`
                : '';
            return `<li><span class="nm">${escapeHtml(ingredient.name)}</span>${amountHtml}</li>`;
        })
        .join('\n');

    const stepsHtml = [...recipe.steps]
        .sort((a, b) => a.step_number - b.step_number)
        .map((step) => `<li>${escapeHtml(step.description)}</li>`)
        .join('\n');

    const commentHtml = recipe.comments
        ? `<div class="comment">💭 ${escapeHtml(recipe.comments)}</div>`
        : '';

    const n = recipe.nutrition_per_100g;

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(recipe.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Roboto+Slab:wght@700;800&family=Manrope:wght@400;600;700&display=swap">
<style>
  :root {
    --paper: #f4efe0;
    --ink: #33534a;
    --ink-2: #6e857b;
    --display: #2e4a3f;
    --burst: #e5794c;
    --rule: #b7c3bb;
    --stripe-a: #8a9cc6;
  }
  * { box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { margin: 0; }
  body {
    font-family: "Manrope", -apple-system, "Segoe UI", Arial, sans-serif;
    color: var(--ink);
    background: var(--paper);
    margin: 0;
    padding: 20mm 18mm 22mm;
    font-size: 12px;
    line-height: 1.55;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 2px solid var(--rule);
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .brand { font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: 15px; color: var(--display); letter-spacing: .02em; }
  .brand i { font-style: normal; color: var(--burst); }
  .brand a { color: inherit; text-decoration: none; }
  .burst { width: 34px; height: 34px; color: var(--burst); flex: 0 0 auto; }

  h1 {
    font-family: "Playfair Display", Georgia, serif;
    font-weight: 700;
    font-size: 30px;
    line-height: 1.1;
    color: var(--display);
    margin: 0 0 10px;
  }

  .meta { display: flex; flex-wrap: wrap; gap: 6px 22px; color: var(--ink-2); font-size: 11px; margin-bottom: 24px; }
  .meta div { display: flex; gap: 5px; align-items: baseline; }
  .meta strong { color: var(--ink); font-weight: 700; }

  h2 {
    font-family: "Roboto Slab", Georgia, serif;
    font-weight: 800;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: .03em;
    color: var(--display);
    border-bottom: 2px solid var(--rule);
    padding-bottom: 4px;
    margin: 22px 0 12px;
  }

  ul.ings { list-style: none; margin: 0; padding: 0; }
  ul.ings li { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
  ul.ings .nm { flex: 0 0 auto; }
  ul.ings .dots { flex: 1 1 auto; border-bottom: 1px dotted var(--ink-2); transform: translateY(-3px); }
  ul.ings .amount { flex: 0 0 auto; color: var(--burst); font-weight: 700; font-variant-numeric: tabular-nums; }

  ol.steps { list-style: none; margin: 0; padding: 0; counter-reset: st; }
  ol.steps li {
    position: relative;
    padding-left: 30px;
    margin-bottom: 12px;
    line-height: 1.6;
  }
  ol.steps li::before {
    counter-increment: st;
    content: counter(st);
    position: absolute;
    left: 0;
    top: -2px;
    font-family: "Playfair Display", Georgia, serif;
    font-weight: 700;
    font-size: 20px;
    color: var(--burst);
    line-height: 1;
  }

  .comment {
    margin-top: 20px;
    padding: 12px 16px;
    background: rgba(138, 156, 198, 0.22);
    border-radius: 10px;
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: var(--ink);
  }

  .foot {
    margin-top: 26px;
    border-top: 1px solid var(--rule);
    padding-top: 8px;
    font-size: 9.5px;
    color: var(--ink-2);
  }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand"><a href="${SITE_URL}">cooklink<i>.ai</i></a></div>
    </div>
    ${BURST}
  </div>

  <h1>${escapeHtml(recipe.title)}</h1>
  <div class="meta">
    <div>Время<strong>${recipe.cooking_time_minutes} мин</strong></div>
    <div>Порции<strong>${recipe.portions}</strong></div>
    <div>Тип<strong>${escapeHtml(recipe.type)}</strong></div>
    <div>КБЖУ на 100г<strong>К ${n.calories} · Б ${n.protein} · Ж ${n.fat} · У ${n.carbs}</strong></div>
  </div>

  <h2>Ингредиенты</h2>
  <ul class="ings">
${ingredientsHtml}
  </ul>

  <h2>Приготовление</h2>
  <ol class="steps">
${stepsHtml}
  </ol>
  ${commentHtml}

  <div class="foot">Рецепт собран из видео сервисом cooklink.ai</div>
</body>
</html>`;
}
