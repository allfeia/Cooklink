import OpenAI from 'openai';
import { ProxyAgent } from 'undici';
import { recipeStore, RECIPE_TYPES, type RecipeData } from '../recipe/recipeStore';

export type { RecipeData } from '../recipe/recipeStore';
export { RECIPE_TYPES } from '../recipe/recipeStore';

export const MAX_RETRIES = 2;

const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? 'https://openrouter.ai/api/v1';
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'meta-llama/llama-3.3-70b-instruct';

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
7. Если в транскрипции нет рецепта — текст пустой, не по теме кулинарии, или представляет собой бессвязный/нечитаемый набор символов — не отвечай вообще, верни пустую строку без пояснений
8. "quantity" — только число или короткая дробь ("200", "1/4", "2"), НИКОГДА не включай в неё единицу измерения и не пиши количество словами (не "четвёртая часть чайной ложки", а quantity: "1/4", unit: "ч.л.")
9. "unit" — краткое стандартное обозначение: г, мл, шт, ст.л., ч.л., зубчик — без повторения его в quantity
10. Если количество ингредиента не названо в видео (например, "по вкусу" или просто упомянут без числа) — quantity: "по вкусу", unit: ""
11. "type" — строго одно из значений: ${RECIPE_TYPES.join(', ')}. Не придумывай других категорий, выбери ближайшую подходящую

Схема ответа:
${RECIPE_SCHEMA}`;

export type LlmErrorCode = 'AI_EXTRACTION_FAILED' | 'INVALID_JSON_SCHEMA' | 'LLM_RATE_LIMITED';

export class LlmExtractionError extends Error {
    constructor(
        public code: LlmErrorCode,
        message: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'LlmExtractionError';
    }
}

const GROQ_PROXY_URL = process.env.GROQ_PROXY_URL;
const proxyDispatcher = GROQ_PROXY_URL ? new ProxyAgent(GROQ_PROXY_URL) : undefined;

function getClient(): OpenAI {
    return new OpenAI({
        baseURL: GROQ_BASE_URL,
        apiKey: process.env.OPENROUTER_API_KEY,
        ...(proxyDispatcher ? { fetchOptions: { dispatcher: proxyDispatcher } } : {}),
    });
}

function preview(text: string, maxChars = 300): string {
    return text.length > maxChars ? `${text.slice(0, maxChars)}… (${text.length} chars total)` : text;
}

async function callLlm(transcriptText: string): Promise<string> {
    const client = getClient();

    console.log('[llm] sending request', {
        model: GROQ_MODEL,
        base_url: GROQ_BASE_URL,
        transcript_chars: transcriptText.length,
        transcript_preview: preview(transcriptText, 200),
    });

    let stream;
    try {
        stream = await client.chat.completions.create({
            model: GROQ_MODEL,
            temperature: 0.2,
            max_tokens: 2048,
            stream: true,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `Extract the recipe from this transcript:\n\n${transcriptText}` },
            ],
        });
    } catch (err) {
        const status = (err as { status?: number })?.status;
        const code = (err as { code?: string })?.code;
        console.error('[llm] request failed', {
            status,
            code,
            message: err instanceof Error ? err.message : String(err),
        });
        if (status === 429) {
            throw new LlmExtractionError(
                'LLM_RATE_LIMITED',
                'Сервис генерации рецептов временно перегружен, попробуйте позже',
                { status, code }
            );
        }
        throw err;
    }

    let result = '';
    for await (const chunk of stream as AsyncIterable<{ choices: { delta?: { content?: string } }[] }>) {
        result += chunk.choices[0]?.delta?.content ?? '';
    }

    console.log('[llm] received response', {
        response_chars: result.length,
        response_preview: preview(result),
    });

    return result;
}

function stripMarkdownFences(raw: string): string {
    return raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function isValidIngredient(value: unknown): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { name?: unknown }).name === 'string' &&
        (value as { name: string }).name.trim().length > 0
    );
}

function isValidStep(value: unknown): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { description?: unknown }).description === 'string' &&
        (value as { description: string }).description.trim().length > 0 &&
        typeof (value as { step_number?: unknown }).step_number === 'number'
    );
}

function isValidNutrition(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const n = value as Record<string, unknown>;
    return (
        typeof n.calories === 'number' && Number.isFinite(n.calories) && n.calories >= 0 &&
        typeof n.protein === 'number' && Number.isFinite(n.protein) && n.protein >= 0 &&
        typeof n.fat === 'number' && Number.isFinite(n.fat) && n.fat >= 0 &&
        typeof n.carbs === 'number' && Number.isFinite(n.carbs) && n.carbs >= 0
    );
}

function isValidRecipeData(value: unknown): value is RecipeData {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;

    if (typeof candidate.title !== 'string' || !candidate.title.trim()) return false;
    if (!RECIPE_TYPES.includes(candidate.type as (typeof RECIPE_TYPES)[number])) return false;
    if (typeof candidate.cooking_time_minutes !== 'number' || !Number.isFinite(candidate.cooking_time_minutes) || candidate.cooking_time_minutes <= 0) return false;
    if (!isValidNutrition(candidate.nutrition_per_100g)) return false;
    if (typeof candidate.portions !== 'number' || !Number.isFinite(candidate.portions) || candidate.portions <= 0) return false;
    if (!Array.isArray(candidate.ingredients) || candidate.ingredients.length === 0) return false;
    if (!candidate.ingredients.every(isValidIngredient)) return false;
    if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) return false;
    if (!candidate.steps.every(isValidStep)) return false;

    return true;
}

const MAX_TRANSCRIPT_CHARS = 20_000;

function preprocessTranscript(text: string): string {
    const lines = text.split('\n');
    const deduped: string[] = [];
    for (const line of lines) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
            deduped.push(line);
        }
    }
    return deduped.join('\n').slice(0, MAX_TRANSCRIPT_CHARS);
}

export async function extractRecipe(transcriptText: string, canonicalKey: string): Promise<RecipeData> {
    const processed = preprocessTranscript(transcriptText);
    console.log('[llm] extractRecipe start', {
        canonical_key: canonicalKey,
        transcript_chars: transcriptText.length,
        processed_chars: processed.length,
    });

    const firstResponse = await callLlm(processed);

    if (!firstResponse.trim()) {
        console.warn('[llm] empty response — treating as AI_EXTRACTION_FAILED', { canonical_key: canonicalKey });
        throw new LlmExtractionError('AI_EXTRACTION_FAILED', 'Не удалось извлечь рецепт');
    }

    let rawAnswer = firstResponse;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const cleaned = stripMarkdownFences(rawAnswer);

        let parsed: unknown;
        let parseError: string | undefined;
        try {
            parsed = JSON.parse(cleaned);
        } catch (err) {
            parsed = undefined;
            parseError = err instanceof Error ? err.message : String(err);
        }

        const schemaValid = parsed !== undefined && isValidRecipeData(parsed);
        const isEmptyObject =
            parsed !== undefined &&
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            Object.keys(parsed).length === 0;
        console.log('[llm] parse attempt', {
            canonical_key: canonicalKey,
            attempt,
            json_parse_ok: parsed !== undefined,
            parse_error: parseError,
            schema_valid: schemaValid,
        });

        if (schemaValid) {
            const recipe = parsed as RecipeData;
            await recipeStore.save(canonicalKey, recipe);
            console.log('[llm] extractRecipe success', { canonical_key: canonicalKey, attempt });
            return recipe;
        }

        if (isEmptyObject) {
            console.warn('[llm] empty object response — treating as AI_EXTRACTION_FAILED', {
                canonical_key: canonicalKey,
                attempt,
            });
            throw new LlmExtractionError('AI_EXTRACTION_FAILED', 'Не удалось извлечь рецепт');
        }

        if (attempt === MAX_RETRIES) {
            console.error('[llm] extractRecipe failed — INVALID_JSON_SCHEMA', {
                canonical_key: canonicalKey,
                retry_count: attempt - 1,
                ai_ans: preview(cleaned),
            });
            throw new LlmExtractionError('INVALID_JSON_SCHEMA', 'Ошибка валидации ответа AI', {
                retry_count: attempt - 1,
                ai_ans: cleaned,
            });
        }

        rawAnswer = await callLlm(processed);
    }

    throw new LlmExtractionError('INVALID_JSON_SCHEMA', 'Ошибка валидации ответа AI');
}
