'use strict';

/**
 * ТЕСТ 2 — ЛИМИТЫ МОДЕЛИ (OpenRouter, llama-3.3-70b-instruct)
 * ====================================================================
 * Отвечает на вопрос: «на сколько запросов / токенов хватает, прежде чем
 * провайдер отвечает 429 (rate limit) или 402 (кончились кредиты)», плюс
 * латентность, расход токенов, стоимость и доля валидной схемы под нагрузкой.
 *
 * Бьёт НАПРЯМУЮ в OpenRouter тем же клиентом и промптом, что llm-worker
 * (backend/src/routes/llm/llmService.ts) — не через стек. Вход — реальные
 * транскрипты из backend/external_services_tests/subtitles/*.txt (разной длины).
 *
 * ⚠️  ТРАТИТ реальные кредиты / дневную квоту OpenRouter. Ключ аккаунта —
 *     free-tier с почти нулевым балансом, так что 429/402 придут быстро.
 *     Начинай с маленького --max.
 *
 * АРГУМЕНТЫ:
 *   --concurrency=N   параллельных запросов                 (default 2)
 *   --max=N           всего запросов                        (default 20)
 *   --stream          стримить ответ (как в проде)          (default: да; --no-stream чтобы видеть usage сразу)
 *   --stop-on-limit   стоп на первом 429/402               (default: продолжать)
 *   --model=ID        переопределить модель
 *   --price-in=USD    $/1M prompt-токенов для оценки цены    (default 0.13)
 *   --price-out=USD   $/1M completion-токенов               (default 0.40)
 *
 * ENV (берётся из backend/.env):
 *   OPENROUTER_API_KEY (обязателен), GROQ_BASE_URL, GROQ_MODEL, GROQ_PROXY_URL
 *
 * ЗАПУСК:
 *   node load-test/test2-llm-limits.js --max=10 --concurrency=2 --no-stream
 *   node load-test/test2-llm-limits.js --max=100 --concurrency=5 --stop-on-limit
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'backend/node_modules/dotenv')).config({ path: path.join(ROOT, 'backend/.env') });
const OpenAI = require(path.join(ROOT, 'backend/node_modules/openai'));
let ProxyAgent;
try { ({ ProxyAgent } = require(path.join(ROOT, 'backend/node_modules/undici'))); } catch { /* optional */ }

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};
const CONCURRENCY = parseInt(opt('concurrency', '2'), 10);
const MAX = parseInt(opt('max', '20'), 10);
const STREAM = flag('no-stream') ? false : true;
const STOP_ON_LIMIT = flag('stop-on-limit');
const PRICE_IN = parseFloat(opt('price-in', '0.13'));
const PRICE_OUT = parseFloat(opt('price-out', '0.40'));

const BASE_URL = process.env.GROQ_BASE_URL ?? 'https://openrouter.ai/api/v1';
const MODEL = opt('model', process.env.GROQ_MODEL ?? 'meta-llama/llama-3.3-70b-instruct');
const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) { console.error('❌ OPENROUTER_API_KEY не задан (backend/.env)'); process.exit(1); }

const PROXY = process.env.GROQ_PROXY_URL;
const dispatcher = PROXY && ProxyAgent ? new ProxyAgent(PROXY) : undefined;

const client = new OpenAI({
  baseURL: BASE_URL,
  apiKey: API_KEY,
  ...(dispatcher ? { fetchOptions: { dispatcher } } : {}),
});

// ── промпт: копия из llmService.ts (держать в синхроне) ───────────────────────
const RECIPE_TYPES = ['Горячее', 'Суп', 'Десерт', 'Салат', 'Закуска'];
const RECIPE_SCHEMA = `{
  "title": "string (3-100 chars)",
  "type": ${RECIPE_TYPES.map((t) => `"${t}"`).join(' | ')},
  "cooking_time_minutes": number,
  "nutrition_per_100g": {"calories": number, "protein": number, "fat": number, "carbs": number},
  "portions": number,
  "ingredients": [{"name": "string", "quantity": string, "unit": "string"}],
  "steps": [{"step_number": number, "description": "string (max 1000 chars)"}],
  "comments": "string (optional, max 1000 chars)"
}`;
const SYSTEM_PROMPT = `Ты — эксперт по кулинарии. Извлеки рецепт из следующей транскрипции видео.

Требования:
1. Верни ТОЛЬКО валидный JSON без пояснений
2. Не выдумывай ингредиенты, не упомянутые в тексте
3. Агрегируй повторяющиеся ингредиенты (соль в шагах 1 и 3 → один раз)
4. Оцени КБЖУ на 100г готового блюда (целые числа). Рассчитай количество порций: одна порция = 250г готового блюда, portions = round(итоговый вес блюда в граммах / 250), минимум 1
5. Строго экранируй все переносы строк внутри JSON (используй \\n)
6. Не вставляй лишние символы или текст вне JSON
7. Если в транскрипции нет рецепта — верни пустую строку без пояснений
8. "quantity" — только число или короткая дробь
9. "unit" — краткое стандартное обозначение
10. Если количество не названо — quantity: "по вкусу", unit: ""
11. "type" — строго одно из: ${RECIPE_TYPES.join(', ')}
12. Проверь каждый шаг на логические ошибки

Схема ответа:
${RECIPE_SCHEMA}`;

const MAX_TRANSCRIPT_CHARS = 20_000;

function validRecipe(v) {
  if (!v || typeof v !== 'object') return false;
  if (typeof v.title !== 'string' || !v.title.trim()) return false;
  if (!RECIPE_TYPES.includes(v.type)) return false;
  if (typeof v.cooking_time_minutes !== 'number' || v.cooking_time_minutes <= 0) return false;
  const n = v.nutrition_per_100g;
  if (!n || ['calories', 'protein', 'fat', 'carbs'].some((k) => typeof n[k] !== 'number')) return false;
  if (typeof v.portions !== 'number' || v.portions <= 0) return false;
  if (!Array.isArray(v.ingredients) || !v.ingredients.length) return false;
  if (!Array.isArray(v.steps) || !v.steps.length) return false;
  return true;
}
const stripFences = (s) => s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

// ── один вызов модели ─────────────────────────────────────────────────────────
async function callModel(transcript) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Extract the recipe from this transcript:\n\n${transcript}` },
  ];
  const t0 = Date.now();

  if (!STREAM) {
    const r = await client.chat.completions.create({
      model: MODEL, temperature: 0.2, max_tokens: 2048, messages,
    });
    return {
      ms: Date.now() - t0,
      text: r.choices[0]?.message?.content ?? '',
      tokens_in: r.usage?.prompt_tokens ?? null,
      tokens_out: r.usage?.completion_tokens ?? null,
      finish: r.choices[0]?.finish_reason,
    };
  }

  const stream = await client.chat.completions.create({
    model: MODEL, temperature: 0.2, max_tokens: 2048, stream: true,
    stream_options: { include_usage: true }, messages,
  });
  let text = '';
  let usage = null;
  let finish;
  for await (const chunk of stream) {
    text += chunk.choices[0]?.delta?.content ?? '';
    if (chunk.choices[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  return {
    ms: Date.now() - t0, text,
    tokens_in: usage?.prompt_tokens ?? null,
    tokens_out: usage?.completion_tokens ?? null,
    finish,
  };
}

async function keyStatus() {
  try {
    const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/auth/key`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      ...(dispatcher ? { dispatcher } : {}),
    });
    return await res.json();
  } catch { return null; }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const subDir = path.join(ROOT, 'backend/external_services_tests/subtitles');
  const files = fs.readdirSync(subDir).filter((f) => f.endsWith('.txt'));
  const transcripts = files
    .map((f) => ({ id: f.split('_')[0], text: fs.readFileSync(path.join(subDir, f), 'utf-8').trim().slice(0, MAX_TRANSCRIPT_CHARS) }))
    .filter((t) => t.text.length > 20);

  const before = await keyStatus();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ТЕСТ 2 — лимиты модели (OpenRouter)');
  console.log(`  model=${MODEL}  stream=${STREAM}  concurrency=${CONCURRENCY}  max=${MAX}`);
  console.log(`  транскриптов в пуле: ${transcripts.length}`);
  if (before?.data) console.log(`  ключ: free_tier=${before.data.is_free_tier}  usage=$${before.data.usage?.toFixed?.(5)}  limit_remaining=${before.data.limit_remaining ?? 'n/a'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const results = [];
  const startedAt = Date.now();
  let sent = 0;
  let firstLimit = null;
  let stop = false;

  async function worker(wid) {
    while (!stop) {
      const ordinal = ++sent;
      if (ordinal > MAX) break;
      const tr = transcripts[(ordinal - 1) % transcripts.length];
      const rec = { n: ordinal, id: tr.id, chars: tr.text.length, at_s: +((Date.now() - startedAt) / 1000).toFixed(1) };
      try {
        const r = await callModel(tr.text);
        rec.ms = r.ms;
        rec.tokens_in = r.tokens_in;
        rec.tokens_out = r.tokens_out;
        rec.finish = r.finish;
        const body = r.text.trim();
        rec.empty = body.length === 0;
        if (!rec.empty) {
          try { rec.schema_valid = validRecipe(JSON.parse(stripFences(body))); }
          catch { rec.schema_valid = false; }
        }
        rec.ok = true;
        console.log(`  #${ordinal} ${tr.id} ✅ ${r.ms}ms in=${r.tokens_in} out=${r.tokens_out} schema=${rec.schema_valid ?? '—'} finish=${r.finish}`);
      } catch (err) {
        rec.ok = false;
        rec.status = err?.status ?? err?.response?.status ?? null;
        rec.error = (err?.message || String(err)).slice(0, 300).replace(/\s+/g, ' ');
        rec.retry_after = err?.headers?.['retry-after'] ?? err?.response?.headers?.get?.('retry-after') ?? null;
        rec.is_limit = rec.status === 429 || rec.status === 402;
        if (rec.is_limit && firstLimit === null) {
          firstLimit = { ordinal, status: rec.status, at_s: rec.at_s, retry_after: rec.retry_after };
          console.log(`\n  🔴 ЛИМИТ (${rec.status}) — запрос №${ordinal}, ${rec.at_s}s от старта, retry-after=${rec.retry_after}\n`);
          if (STOP_ON_LIMIT) stop = true;
        }
        console.log(`  #${ordinal} ${tr.id} ${rec.is_limit ? '🔴 ' + rec.status : '❌'} ${rec.error.slice(0, 90)}`);
      }
      results.push(rec);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  const after = await keyStatus();

  // ── сводка ──
  const ok = results.filter((r) => r.ok);
  const okBeforeLimit = firstLimit ? results.filter((r) => r.ok && r.n < firstLimit.ordinal).length : ok.length;
  const tokIn = ok.reduce((s, r) => s + (r.tokens_in || 0), 0);
  const tokOut = ok.reduce((s, r) => s + (r.tokens_out || 0), 0);
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] : 0);
  const schemaValid = ok.filter((r) => r.schema_valid).length;
  const elapsedMin = (Date.now() - startedAt) / 60000;
  const costUsd = (tokIn / 1e6) * PRICE_IN + (tokOut / 1e6) * PRICE_OUT;

  const summary = {
    model: MODEL, stream: STREAM, concurrency: CONCURRENCY,
    total: results.length,
    ok: ok.length,
    ok_before_first_limit: okBeforeLimit,
    first_limit: firstLimit,
    http_429: results.filter((r) => r.status === 429).length,
    http_402: results.filter((r) => r.status === 402).length,
    tokens_in: tokIn, tokens_out: tokOut, tokens_total: tokIn + tokOut,
    tokens_per_min: +((tokIn + tokOut) / elapsedMin).toFixed(0),
    est_cost_usd: +costUsd.toFixed(4),
    schema_valid_pct: ok.length ? +((schemaValid / ok.length) * 100).toFixed(1) : 0,
    empty_responses: ok.filter((r) => r.empty).length,
    latency_ms: { p50: pct(50), p95: pct(95), max: lat[lat.length - 1] || 0 },
    elapsed_min: +elapsedMin.toFixed(2),
    key_usage_before: before?.data?.usage ?? null,
    key_usage_after: after?.data?.usage ?? null,
  };

  console.log('\n──────────────── СВОДКА ТЕСТ 2 ────────────────');
  console.log(`  Запросов всего:          ${summary.total}`);
  console.log(`  Успешно:                 ${summary.ok}`);
  console.log(`  Успешно ДО первого лимита: ${summary.ok_before_first_limit}`);
  console.log(`  Первый лимит:            ${firstLimit ? `№${firstLimit.ordinal}  HTTP ${firstLimit.status}  (retry-after ${firstLimit.retry_after})` : 'не пойман'}`);
  console.log(`  429 / 402:               ${summary.http_429} / ${summary.http_402}`);
  console.log(`  Токенов: in ${tokIn} + out ${tokOut} = ${summary.tokens_total}  (~${summary.tokens_per_min}/мин)`);
  console.log(`  Оценка стоимости:        $${summary.est_cost_usd}   (usage ключа: $${summary.key_usage_before} → $${summary.key_usage_after})`);
  console.log(`  Валидная схема:          ${summary.schema_valid_pct}%   пустых ответов: ${summary.empty_responses}`);
  console.log(`  Латентность:             p50 ${summary.latency_ms.p50}ms | p95 ${summary.latency_ms.p95}ms | max ${summary.latency_ms.max}ms`);
  console.log('───────────────────────────────────────────────\n');

  const outPath = path.join(__dirname, 'results-test2.json');
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`  → ${outPath}`);
}

main().catch((e) => { console.error('\n💥', e); process.exit(1); });
