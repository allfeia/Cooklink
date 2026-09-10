export type SubtitleLanguage = 'ru' | 'en';
export const SUBTITLE_LANGUAGES: readonly SubtitleLanguage[] = ['ru', 'en'] as const;

export interface SubtitleTrack {
    ext: string;
    url: string;
}

export interface SubtitleTracks {
    manual: Partial<Record<SubtitleLanguage, SubtitleTrack[]>>;
    auto: Partial<Record<SubtitleLanguage, SubtitleTrack[]>>;
}

export interface MediaProbe {
    subtitleTracks: SubtitleTracks;
}

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

export function extractSubtitleTracks(raw: RawSubtitleShape): SubtitleTracks {
    return { manual: pickLangs(raw.subtitles), auto: pickLangs(raw.automatic_captions) };
}

export function buildMediaProbe(raw: RawSubtitleShape): MediaProbe {
    return { subtitleTracks: extractSubtitleTracks(raw) };
}

function pickTrack(tracks?: SubtitleTrack[]): SubtitleTrack | undefined {
    if (!tracks || tracks.length === 0) return undefined;
    return tracks.find((t) => t.ext === 'vtt') ?? tracks[0];
}

export function selectSubtitleTrack(
    tracks: SubtitleTracks
): { url: string; language: SubtitleLanguage } | null {
    for (const language of SUBTITLE_LANGUAGES) {
        const track = pickTrack(tracks.manual[language]) ?? pickTrack(tracks.auto[language]);
        if (track) return { url: track.url, language };
    }
    return null;
}
