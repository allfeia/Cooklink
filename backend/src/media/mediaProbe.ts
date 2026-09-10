/**
 * MEDIA PROBE — результат одного «resolve»-обращения к платформе.
 *
 * Раньше metadata-воркер и subtitles-воркер делали ОДИН И ТОТ ЖЕ вызов
 * `yt-dlp --dump-single-json` и каждый брал из ответа свои поля. Это лишнее
 * обращение к тому эндпоинту YouTube, что отдаёт 429.
 *
 * Теперь metadata-воркер («resolve»-шаг) один раз обращается к платформе,
 * складывает нужное дальше по пайплайну в этот нейтральный объект, а
 * subtitles-воркер использует его вместо собственного вызова.
 *
 * Объект намеренно платформенно-нейтральный: для TikTok / Instagram / и т.п.
 * появится свой адаптер, который заполнит те же поля. Когда у платформы нет
 * готовых субтитров, здесь появится `audioStreamUrl` для пути через STT.
 */

export type SubtitleLanguage = 'ru' | 'en';
export const SUBTITLE_LANGUAGES: readonly SubtitleLanguage[] = ['ru', 'en'] as const;

export interface SubtitleTrack {
    ext: string;
    url: string;
}

/** Нормализованные дорожки субтитров: только поддерживаемые языки. */
export interface SubtitleTracks {
    /** Авторские (ручные) субтитры по языкам. */
    manual: Partial<Record<SubtitleLanguage, SubtitleTrack[]>>;
    /** Автоматические субтитры по языкам. */
    auto: Partial<Record<SubtitleLanguage, SubtitleTrack[]>>;
}

export interface MediaProbe {
    subtitleTracks: SubtitleTracks;
    // audioStreamUrl?: string;  // TODO: для платформ без субтитров → STT
}

// ─── формирование из сырого ответа yt-dlp ────────────────────────────────────

interface RawSubtitleShape {
    subtitles?: Record<string, ({ ext?: unknown; url?: unknown } | null)[]>;
    automatic_captions?: Record<string, ({ ext?: unknown; url?: unknown } | null)[]>;
}

function pickLangs(
    src: RawSubtitleShape['subtitles']
): Partial<Record<SubtitleLanguage, SubtitleTrack[]>> {
    const out: Partial<Record<SubtitleLanguage, SubtitleTrack[]>> = {};
    for (const lang of SUBTITLE_LANGUAGES) {
        const list = src?.[lang];
        if (!Array.isArray(list)) continue;
        const tracks = list.filter(
            (t): t is SubtitleTrack => typeof t?.url === 'string' && typeof t?.ext === 'string'
        );
        if (tracks.length) out[lang] = tracks;
    }
    return out;
}

/** yt-dlp `--dump-single-json` → нормализованный SubtitleTracks (ru/en). */
export function extractSubtitleTracks(raw: RawSubtitleShape): SubtitleTracks {
    return { manual: pickLangs(raw.subtitles), auto: pickLangs(raw.automatic_captions) };
}

/** Полный MediaProbe из сырого ответа yt-dlp. */
export function buildMediaProbe(raw: RawSubtitleShape): MediaProbe {
    return { subtitleTracks: extractSubtitleTracks(raw) };
}

// ─── выбор итоговой дорожки ──────────────────────────────────────────────────

function pickTrack(tracks?: SubtitleTrack[]): SubtitleTrack | undefined {
    if (!tracks || tracks.length === 0) return undefined;
    return tracks.find((t) => t.ext === 'vtt') ?? tracks[0];
}

/** Выбор дорожки для скачивания: ru → en, ручные → авто, приоритет vtt. */
export function selectSubtitleTrack(
    tracks: SubtitleTracks
): { url: string; language: SubtitleLanguage } | null {
    for (const language of SUBTITLE_LANGUAGES) {
        const track = pickTrack(tracks.manual[language]) ?? pickTrack(tracks.auto[language]);
        if (track) return { url: track.url, language };
    }
    return null;
}
