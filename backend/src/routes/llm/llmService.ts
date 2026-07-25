import OpenAI from 'openai';
import { recipeStore, RECIPE_TYPES, type RecipeData } from '../recipe/recipeStore';

export type { RecipeData } from '../recipe/recipeStore';
export { RECIPE_TYPES } from '../recipe/recipeStore';

export const MAX_RETRIES = 3;

const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

const RECIPE_SCHEMA = `{
  "title": "string (3-100 chars)",
  "type": ${RECIPE_TYPES.map((t) => `"${t}"`).join(' | ')},
  "cooking_time_minutes": number,
  "difficulty": 1|2|3|4|5,
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
4. Оцени сложность от 1 до 5 на основе техник и количества шагов
5. Строго экранируй все переносы строк внутри JSON (используй \\n)
6. Не вставляй лишние символы или текст вне JSON
7. Если в транскрипции нет рецепта — текст пустой, не по теме кулинарии, или представляет собой бессвязный/нечитаемый набор символов — не отвечай вообще, верни пустую строку без пояснений
8. "quantity" — только число или короткая дробь ("200", "1/4", "2"), НИКОГДА не включай в неё единицу измерения и не пиши количество словами (не "четвёртая часть чайной ложки", а quantity: "1/4", unit: "ч.л.")
9. "unit" — краткое стандартное обозначение: г, мл, шт, ст.л., ч.л., зубчик — без повторения его в quantity
10. Если количество ингредиента не названо в видео (например, "по вкусу" или просто упомянут без числа) — quantity: "по вкусу", unit: ""
11. "type" — строго одно из значений: ${RECIPE_TYPES.join(', ')}. Не придумывай других категорий, выбери ближайшую подходящую

Схема ответа:
${RECIPE_SCHEMA}`;

export type LlmErrorCode = 'AI_EXTRACTION_FAILED' | 'INVALID_JSON_SCHEMA';

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

function getClient(): OpenAI {
    return new OpenAI({
        baseURL: GROQ_BASE_URL,
        apiKey: process.env.GROQ_API_KEY,
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
        console.error('[llm] request failed', {
            status: (err as { status?: number })?.status,
            code: (err as { code?: string })?.code,
            message: err instanceof Error ? err.message : String(err),
        });
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

function isValidRecipeData(value: unknown): value is RecipeData {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;

    if (typeof candidate.title !== 'string' || !candidate.title.trim()) return false;
    if (!RECIPE_TYPES.includes(candidate.type as (typeof RECIPE_TYPES)[number])) return false;
    if (!Array.isArray(candidate.ingredients) || candidate.ingredients.length === 0) return false;
    if (!candidate.ingredients.every(isValidIngredient)) return false;
    if (!Array.isArray(candidate.steps) || candidate.steps.length === 0) return false;
    if (!candidate.steps.every(isValidStep)) return false;

    return true;
}

export async function extractRecipe(transcriptText: string, videoId: string): Promise<RecipeData> {
    console.log('[llm] extractRecipe start', { video_id: videoId, transcript_chars: transcriptText.length });

    const firstResponse = await callLlm(transcriptText);

    if (!firstResponse.trim()) {
        console.warn('[llm] empty response — treating as AI_EXTRACTION_FAILED', { video_id: videoId });
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
        console.log('[llm] parse attempt', {
            video_id: videoId,
            attempt,
            json_parse_ok: parsed !== undefined,
            parse_error: parseError,
            schema_valid: schemaValid,
        });

        if (schemaValid) {
            await recipeStore.save(videoId, parsed as RecipeData);
            console.log('[llm] extractRecipe success', { video_id: videoId, attempt });
            return parsed as RecipeData;
        }

        if (attempt === MAX_RETRIES) {
            console.error('[llm] extractRecipe failed — INVALID_JSON_SCHEMA', {
                video_id: videoId,
                retry_count: attempt - 1,
                ai_ans: preview(cleaned),
            });
            throw new LlmExtractionError('INVALID_JSON_SCHEMA', 'Ошибка валидации ответа AI', {
                retry_count: attempt - 1,
                ai_ans: cleaned,
            });
        }

        rawAnswer = await callLlm(transcriptText);
    }

    throw new LlmExtractionError('INVALID_JSON_SCHEMA', 'Ошибка валидации ответа AI');
}
