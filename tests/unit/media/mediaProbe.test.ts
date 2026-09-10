import { describe, expect, it } from 'vitest';
import {
    extractSubtitleTracks,
    buildMediaProbe,
    selectSubtitleTrack,
    type SubtitleTracks,
} from '../../../backend/src/media/mediaProbe';

describe('extractSubtitleTracks', () => {
    it('keeps only ru/en, splits manual vs auto', () => {
        const raw = {
            subtitles: {
                ru: [{ ext: 'vtt', url: 'r.vtt' }],
                de: [{ ext: 'vtt', url: 'd.vtt' }],
            },
            automatic_captions: {
                en: [{ ext: 'json3', url: 'e.json' }],
                fr: [{ ext: 'vtt', url: 'f.vtt' }],
            },
        };

        expect(extractSubtitleTracks(raw)).toEqual({
            manual: { ru: [{ ext: 'vtt', url: 'r.vtt' }] },
            auto: { en: [{ ext: 'json3', url: 'e.json' }] },
        });
    });

    it('drops malformed track entries (no url / no ext)', () => {
        const raw = {
            subtitles: { ru: [{ ext: 'vtt' }, { url: 'x.vtt' }, null, { ext: 'vtt', url: 'ok.vtt' }] },
        };
        expect(extractSubtitleTracks(raw as never)).toEqual({
            manual: { ru: [{ ext: 'vtt', url: 'ok.vtt' }] },
            auto: {},
        });
    });

    it('returns empty maps when raw has nothing', () => {
        expect(buildMediaProbe({}).subtitleTracks).toEqual({ manual: {}, auto: {} });
    });
});

describe('selectSubtitleTrack', () => {
    const t = (url: string, ext = 'vtt') => ({ ext, url });

    it('prefers ru over en', () => {
        const tracks: SubtitleTracks = { manual: { ru: [t('ru')], en: [t('en')] }, auto: {} };
        expect(selectSubtitleTrack(tracks)).toEqual({ url: 'ru', language: 'ru' });
    });

    it('prefers manual over auto for the same language', () => {
        const tracks: SubtitleTracks = { manual: { ru: [t('manual')] }, auto: { ru: [t('auto')] } };
        expect(selectSubtitleTrack(tracks)).toEqual({ url: 'manual', language: 'ru' });
    });

    it('falls back to en when ru is absent', () => {
        const tracks: SubtitleTracks = { manual: {}, auto: { en: [t('en-auto')] } };
        expect(selectSubtitleTrack(tracks)).toEqual({ url: 'en-auto', language: 'en' });
    });

    it('prefers a vtt track over other formats', () => {
        const tracks: SubtitleTracks = {
            manual: { ru: [t('a.json', 'json3'), t('b.vtt', 'vtt'), t('c.srv', 'srv1')] },
            auto: {},
        };
        expect(selectSubtitleTrack(tracks)).toEqual({ url: 'b.vtt', language: 'ru' });
    });

    it('returns null when nothing matches', () => {
        expect(selectSubtitleTrack({ manual: {}, auto: {} })).toBeNull();
    });
});
