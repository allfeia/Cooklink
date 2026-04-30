'use strict';

/**
 * TEST 3 — Subtitle → Structured Recipe JSON (via Qwen)
 * ───────────────────────────────────────────────────────
 * Reads saved .txt subtitle files from /subtitles/, sends each to Qwen72B,
 * validates the response JSON against the recipe schema, and saves results.
 *
 * Requires: QWEN_API_KEY in .env
 *
 * Usage:
 *   node test-3-qwen.js                         # process all .txt in /subtitles/
 *   node test-3-qwen.js --file=subtitles/X.txt  # single file
 *   node test-3-qwen.js --limit=5               # first N files only
 *
 * Output:
 *   results/test-3-qwen_<timestamp>.json
 *   For each input: results/recipes/<videoId>.json  (valid recipes only)
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { saveResults} = require('./utils/logger');

// ── Config ────────────────────────────────────────────────────────────────────
const QWEN_API_KEY  = process.env.QWEN_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL    = process.env.QWEN_MODEL    ?? 'qwen-max'; // or qwen-max / qwen2.5-72b-instruct

const SUBTITLES_DIR = path.join(__dirname, 'subtitles');
const RECIPES_DIR   = path.join(__dirname, 'results', 'recipes');

if (!QWEN_API_KEY) {
    console.error('❌ QWEN_API_KEY is not set in .env');
    process.exit(1);
}
if (!fs.existsSync(RECIPES_DIR)) fs.mkdirSync(RECIPES_DIR, { recursive: true });

// ── CLI args ──────────────────────────────────────────────────────────────────
const fileArg  = process.argv.find(a => a.startsWith('--file='));
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ── Recipe JSON schema (documented for the LLM prompt) ───────────────────────
const RECIPE_SCHEMA = `
{
  "title": "string (3-100 chars)",
  "type": "string",
  "cooking_time_minutes": number,
  "difficulty": 1|2|3|4|5,
  "portions": number,
  "ingredients": [{"name": "string", "quantity": string, "unit": "string"}],
  "steps": [{"step_number": number, "description": "string (max 1000 chars)"}],
  "comments": "string (optional, max 1000 chars)"
}
`.trim();

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
Ты — эксперт по кулинарии. Извлеки рецепт из следующей транскрипции видео.

Требования:
1. Верни ТОЛЬКО валидный JSON без пояснений
2. Не выдумывай ингредиенты, не упомянутые в тексте
3. Агрегируй повторяющиеся ингредиенты (соль в шагах 1 и 3 → один раз)
4. Оцени сложность от 1 до 5 на основе техник и количества шагов
5. Строго экранируй все переносы строк внутри JSON (используй \\n)
6. Не вставляй лишние символы или текст вне JSON

Схема ответа:
${RECIPE_SCHEMA}
`.trim();

// ── Qwen API call ─────────────────────────────────────────────────────────────
async function callQwen(transcript) {
    const url = `${QWEN_BASE_URL}/chat/completions`;

    const body = {
        model: QWEN_MODEL,
        max_tokens: 2048,
        temperature: 0.2,   // low temperature for deterministic structured output
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Extract the recipe from this transcript:\n\n${transcript}`,
            },
        ],
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${QWEN_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Qwen API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content?.trim() ?? '';

    // Strip accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (e) {
        throw new Error(`Invalid JSON from LLM:\n${cleaned.slice(0, 2000)}`);
    }

    return {
        // raw,
        tokens_in:  data.usage?.prompt_tokens     ?? null,
        tokens_out: data.usage?.completion_tokens ?? null,
        parsed,
    };
}

// ── Schema validation ─────────────────────────────────────────────────────────
function validateRecipe(obj) {
    const errors = [];
    const debug  = {};

    if (!obj || typeof obj !== 'object') {
        return { valid: false, errors: ['response is not an object'], debug: { raw: obj } };
    }

    // ── Title ─────────────────────
    if (typeof obj.title !== 'string' || !obj.title.trim()) {
        errors.push('missing title');
        debug.title = obj.title;
    }

    // ── Ingredients ──────────────
    if (!Array.isArray(obj.ingredients) || obj.ingredients.length === 0) {
        errors.push('ingredients empty');
        debug.ingredients = obj.ingredients;
    } else {
        obj.ingredients.forEach((ing, i) => {
            if (!ing.name) {
                errors.push(`ingredient[${i}].name missing`);
                debug[`ingredient_${i}`] = ing;
            }
        });
    }

    // ── Steps ────────────────────
    if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
        errors.push('steps empty');
        debug.steps = obj.steps;
    } else {
        obj.steps.forEach((s, i) => {
            if (!s.description) {
                errors.push(`step[${i}].description missing`);
                debug[`step_${i}`] = s;
            }
            if (typeof s.step_number !== 'number') {
                errors.push(`step[${i}].step_number not a number`);
                debug[`step_${i}`] = s;
            }
        });
    }

    return { valid: errors.length === 0, errors, debug };
}

// Clean transcript
function cleanTranscript(text) {
    return text
        // убрать строки с файлами/ID
        .replace(/\[.*?\].*\.txt/g, '')

        // убрать дубли подряд
        .replace(/(.+)\n\1/g, '$1')

        // убрать лишние переносы
        .replace(/\n+/g, '\n')

        .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    // Collect subtitle files to process
    let files;
    if (fileArg) {
        const f = fileArg.split('=')[1];
        if (!fs.existsSync(f)) { console.error(`File not found: ${f}`); process.exit(1); }
        files = [path.resolve(f)];
    } else {
        if (!fs.existsSync(SUBTITLES_DIR)) {
            console.error(`Subtitles directory not found: ${SUBTITLES_DIR}`);
            console.error('Run test-2-subtitles.js first to generate subtitle files.');
            process.exit(1);
        }
        files = fs.readdirSync(SUBTITLES_DIR)
            .filter(f => f.endsWith('.txt'))
            .slice(0, LIMIT)
            .map(f => path.join(SUBTITLES_DIR, f));
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST 3 — Subtitle → Recipe JSON (Qwen)');
    console.log(`  Model  : ${QWEN_MODEL}`);
    console.log(`  Files  : ${files.length}`);
    console.log(`  Output : ${RECIPES_DIR}`);
    console.log('═══════════════════════════════════════════════════════\n');

    const results = [];

    for (const filepath of files) {
        const filename    = path.basename(filepath);
        const videoId     = filename.split('_')[0];
        process.stdout.write(`  [${videoId}] ${filename} … `);

        const transcript = cleanTranscript(fs.readFileSync(filepath, 'utf-8'));
        if (!transcript) {
            console.log('⚠️  empty file, skipping');
            results.push({ status: 'skipping', filename, error: 'EMPTY_FILE', duration_ms: 0 });
            continue;
        }

        // Truncate very long transcripts (Qwen context limit safety)
        const MAX_CHARS = 30_000;
        const truncated = transcript.length > MAX_CHARS;
        const input     = truncated ? transcript.slice(0, MAX_CHARS) : transcript;

        const t0 = Date.now();
        try {
            const { parsed, tokens_in, tokens_out } = await callQwen(input);
            const duration_ms = Date.now() - t0;
            const validation  = validateRecipe(parsed);

            if (validation.valid) {
                // Save individual recipe file
                const outPath = path.join(RECIPES_DIR, `${videoId}.json`);
                fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2), 'utf-8');
                console.log(`✅ ${duration_ms}ms | in=${tokens_in} out=${tokens_out} → ${path.basename(outPath)}`);
            } else {
                console.log(`⚠️  ${duration_ms}ms | schema errors: ${validation.errors.join('; ')}`);

                if (validation.debug && Object.keys(validation.debug).length > 0) {
                    console.log(' Debug:', JSON.stringify(validation.debug, null, 2).slice(0, 500));
                }
            }

            results.push({
                status:       validation.valid ? 'ok' : 'schema_error',
                filename,
                video_id:     videoId,
                duration_ms,
                tokens_in,
                tokens_out,
                truncated,
                schema_valid: validation.valid,
                schema_errors: validation.errors,
                recipe:       parsed,
                debug: validation.debug
            });

        } catch (err) {
            const duration_ms = Date.now() - t0;
            const error = err?.message ?? String(err);
            console.log(`❌ ${duration_ms}ms | ${error}`);
            results.push({ status: 'error', filename, video_id: videoId, error, duration_ms });
        }
    }

    // Summary
    const ok      = results.filter(r => r.status === 'ok').length;
    const schErr  = results.filter(r => r.status === 'schema_error').length;
    const apiErr  = results.filter(r => r.status === 'error').length;
    const totalTokens = results.reduce((s, r) => s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0);
    const durations = results.map(r => r.duration_ms).filter(d => typeof d === 'number' && d > 0);
    const maxTime = durations.length ? Math.max(...durations) : 0;
    const avgTime = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    console.log('\n──────────────── SUMMARY ────────────────');
    console.log(`  Total       : ${results.length}`);
    console.log(`  ✅ Valid     : ${ok}`);
    console.log(`  ⚠️  Schema err: ${schErr}`);
    console.log(`  ❌ API error : ${apiErr}`);
    console.log(`  🪙 Tokens    : ${totalTokens.toLocaleString()} total`);
    console.log(`  ⏱️ Max time  : ${maxTime} ms`);
    console.log(`  ⚡ Avg time  : ${avgTime} ms`);
    console.log('─────────────────────────────────────────\n');

    saveResults('recipes/logs/test-3-llm', {
        runAt:     new Date().toISOString(),
        model:     QWEN_MODEL,
        files:     files.map(f => path.basename(f)),
        summary:   { ok, schema_errors: schErr, api_errors: apiErr, total_tokens: totalTokens },
        results,
    });
}

main().catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
});