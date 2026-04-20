'use strict';

/**
 * TEST 2 — YouTube Subtitles
 * ──────────────────────────
 * Fetches RU/EN subtitles for each URL using two approaches:
 *   [A] yt-dlp availability check — fast, no file download, shows which langs exist
 *   [B] yt-dlp full download      — saves .txt subtitle files
 *
 * NOTE: youtube-transcript library was dropped — it only fetches manually uploaded
 * subtitles and returns NO_SUBTITLES for auto-generated captions, which is the
 * majority of RU cooking channels. yt-dlp handles both manual and auto captions.
 *
 * Rate limiting: adds a random delay between requests to avoid YouTube 429 errors.
 * On 429, retries up to MAX_RETRIES times with exponential backoff.
 *
 * Usage:
 *   node test-2-subtitles.js                     # check + download (default)
 *   node test-2-subtitles.js --tool=A            # check available langs only (fast)
 *   node test-2-subtitles.js --tool=B            # download subtitles to .txt files
 *   node test-2-subtitles.js --langs=ru,en       # language priority order
 *   node test-2-subtitles.js --delay=3000        # ms between requests (default: 2000)
 *   node test-2-subtitles.js --limit=10          # process first N URLs only
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { saveResults, printSummary } = require('./utils/logger');
const TEST_URLS = require('./results/test-urls-auto');

// ── Config ────────────────────────────────────────────────────────────────────
const arg         = process.argv.find(a => a.startsWith('--tool='));
const TOOL_FILTER = arg ? arg.split('=')[1].toUpperCase() : 'BOTH';

const langArg   = process.argv.find(a => a.startsWith('--langs='));
const LANG_PRIO = (langArg ? langArg.split('=')[1] : 'ru,en').split(',');

const delayArg      = process.argv.find(a => a.startsWith('--delay='));
const BASE_DELAY_MS = delayArg ? parseInt(delayArg.split('=')[1], 10) : 2000;

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

const MAX_RETRIES = 3;

const SUBTITLES_DIR = path.join(__dirname, 'subtitles');
if (!fs.existsSync(SUBTITLES_DIR)) fs.mkdirSync(SUBTITLES_DIR, { recursive: true });

const urls = TEST_URLS.slice(0, LIMIT);

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractVideoId(url) {
    const m = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?]+)/);
    return m?.[1] ?? null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Random delay between BASE_DELAY_MS and BASE_DELAY_MS * 1.5 to look less robotic
function jitter(base = BASE_DELAY_MS) {
    return base + Math.floor(Math.random() * base * 0.5);
}

// Strips VTT/SRT markup → plain text
function stripMarkup(raw) {
    return raw
        .replace(/WEBVTT[^\n]*\n/g, '')
        .replace(/^\d+\n/gm, '')
        .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3} --> [^\n]+/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL A: yt-dlp metadata check only (fast, no file download)
// ─────────────────────────────────────────────────────────────────────────────
async function checkSubsAvailability(url) {
    const ytDlp   = require('yt-dlp-exec');
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Cannot extract video ID from URL');

    const info = await ytDlp(url, {
        dumpSingleJson:      true,
        skipDownload:        true,
        noWarnings:          true,
        noCheckCertificates: true,
    });

    const manual = Object.keys(info.subtitles ?? {});
    const auto   = Object.keys(info.automatic_captions ?? {});

    let langUsed = null;
    let langType = null;
    for (const lang of LANG_PRIO) {
        if (manual.some(l => l.startsWith(lang))) { langUsed = lang; langType = 'manual'; break; }
        if (auto.some(l => l.startsWith(lang)))   { langUsed = lang; langType = 'auto';   break; }
    }

    if (!langUsed) {
        throw new Error(
            `NO_SUBTITLES — manual: [${manual.slice(0,5).join(', ')}], ` +
            `auto: [${auto.slice(0,5).join(', ')}]`
        );
    }

    return { videoId, langUsed, langType, availableLangs: { manual, auto } };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL B: yt-dlp full download → saves .txt file
// ─────────────────────────────────────────────────────────────────────────────
async function downloadSubs(url, attempt = 1) {
    const ytDlp   = require('yt-dlp-exec');
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Cannot extract video ID from URL');

    // Pass 1: check availability
    let info;
    try {
        info = await ytDlp(url, {
            dumpSingleJson:      true,
            skipDownload:        true,
            noWarnings:          true,
            noCheckCertificates: true,
        });
    } catch (err) {
        if (err.message?.includes('429') && attempt <= MAX_RETRIES) {
            const wait = jitter(BASE_DELAY_MS * Math.pow(2, attempt));
            console.log(`\n  ⏳ 429 on metadata, retry ${attempt}/${MAX_RETRIES} in ${wait}ms…`);
            await sleep(wait);
            return downloadSubs(url, attempt + 1);
        }
        throw err;
    }

    const manual = Object.keys(info.subtitles ?? {});
    const auto   = Object.keys(info.automatic_captions ?? {});

    let langUsed = null;
    let langType = null;
    for (const lang of LANG_PRIO) {
        if (manual.some(l => l.startsWith(lang))) { langUsed = lang; langType = 'manual'; break; }
        if (auto.some(l => l.startsWith(lang)))   { langUsed = lang; langType = 'auto';   break; }
    }

    if (!langUsed) {
        throw new Error(
            `NO_SUBTITLES — manual: [${manual.slice(0,5).join(', ')}], ` +
            `auto: [${auto.slice(0,5).join(', ')}]`
        );
    }

    // Pass 2: download subtitle file
    // Remove leftover .vtt/.srt files for this video first
    fs.readdirSync(SUBTITLES_DIR)
        .filter(f => f.startsWith(videoId) && (f.endsWith('.vtt') || f.endsWith('.srt')))
        .forEach(f => fs.unlinkSync(path.join(SUBTITLES_DIR, f)));

    const outTemplate = path.join(SUBTITLES_DIR, `${videoId}_yt-dlp.%(ext)s`);
    try {
        await ytDlp(url, {
            skipDownload:        true,
            writeSubs:           langType === 'manual',
            writeAutoSubs:       langType === 'auto',
            subLangs:            langUsed,
            subFormat:           'vtt/srt/best',
            noWarnings:          true,
            noCheckCertificates: true,
            output:              outTemplate,
        });
    } catch (err) {
        if (err.message?.includes('429') && attempt <= MAX_RETRIES) {
            const wait = jitter(BASE_DELAY_MS * Math.pow(2, attempt));
            console.log(`\n  ⏳ 429 on download, retry ${attempt}/${MAX_RETRIES} in ${wait}ms…`);
            await sleep(wait);
            return downloadSubs(url, attempt + 1);
        }
        throw err;
    }

    // Read downloaded subtitle file
    const candidates = fs.readdirSync(SUBTITLES_DIR)
        .filter(f => f.startsWith(videoId) && f.includes('yt-dlp') && !f.endsWith('.txt'));
    if (!candidates.length) throw new Error('Subtitle file not written by yt-dlp');

    const raw        = fs.readFileSync(path.join(SUBTITLES_DIR, candidates[0]), 'utf-8');
    const transcript = stripMarkup(raw);

    // Clean up raw .vtt/.srt — keep only the .txt
    candidates.forEach(f => fs.unlinkSync(path.join(SUBTITLES_DIR, f)));

    return { transcript, langUsed, langType, videoId, availableLangs: { manual, auto } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic runner with per-request delay
// ─────────────────────────────────────────────────────────────────────────────
async function runTool(label, fetchFn, urls) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  Tool ${label} | langs: ${LANG_PRIO.join(' > ')} | delay: ~${BASE_DELAY_MS}ms`);
    console.log(`${'─'.repeat(55)}`);

    const results = [];

    for (let i = 0; i < urls.length; i++) {
        const url     = urls[i];
        const videoId = extractVideoId(url) ?? 'unknown';
        process.stdout.write(`  [${i + 1}/${urls.length}] [${videoId}] … `);
        const t0 = Date.now();

        try {
            const result      = await fetchFn(url);
            const duration_ms = Date.now() - t0;

            if (result.transcript !== undefined) {
                // Full download mode — save .txt
                const filename = `${videoId}_B__yt_dlp_exec__${result.langUsed}.txt`;
                fs.writeFileSync(path.join(SUBTITLES_DIR, filename), result.transcript, 'utf-8');
                console.log(
                    `✅ ${duration_ms}ms | lang=${result.langUsed} (${result.langType}) | ` +
                    `${result.transcript.length} chars → ${filename}`
                );
                results.push({
                    status: 'ok', url, video_id: videoId,
                    lang: result.langUsed, lang_type: result.langType,
                    char_count: result.transcript.length,
                    subtitle_file: filename, duration_ms,
                    available_langs: result.availableLangs,
                });
            } else {
                // Check-only mode
                console.log(`✅ ${duration_ms}ms | lang=${result.langUsed} (${result.langType})`);
                results.push({
                    status: 'ok', url, video_id: videoId,
                    lang: result.langUsed, lang_type: result.langType,
                    duration_ms, available_langs: result.availableLangs,
                });
            }

        } catch (err) {
            const duration_ms = Date.now() - t0;
            // Shorten 429 error for display — don't dump the full yt-dlp command
            const raw   = err?.message ?? String(err);
            const error = raw.includes('429') ? 'HTTP 429: Too Many Requests (retries exhausted)' : raw.split('\n')[0];
            console.log(`❌ ${duration_ms}ms | ${error}`);
            results.push({ status: 'error', url, video_id: videoId, error, duration_ms });
        }

        // Delay between requests (skip after last)
        if (i < urls.length - 1) {
            await sleep(jitter());
        }
    }

    printSummary(results);
    return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST 2 — YouTube Subtitles (yt-dlp)');
    console.log(`  URLs     : ${urls.length}${LIMIT < Infinity ? ` (limited from ${TEST_URLS.length})` : ''}`);
    console.log(`  Languages: ${LANG_PRIO.join(' > ')}`);
    console.log(`  Tool     : ${TOOL_FILTER}`);
    console.log(`  Delay    : ~${BASE_DELAY_MS}ms between requests (+ jitter)`);
    console.log(`  Output   : ${SUBTITLES_DIR}`);
    console.log('═══════════════════════════════════════════════════════');

    const report = {
        runAt: new Date().toISOString(),
        lang_priority: LANG_PRIO,
        tool_filter: TOOL_FILTER,
        base_delay_ms: BASE_DELAY_MS,
        urls,
    };

    // Tool A = availability check (fast, no files saved)
    if (TOOL_FILTER === 'BOTH' || TOOL_FILTER === 'A') {
        try {
            report.tool_A = await runTool('A — availability check (no download)', checkSubsAvailability, urls);
        } catch (e) {
            console.error('Tool A failed:', e.message);
            report.tool_A_error = e.message;
        }
    }

    // Tool B = full download → .txt files
    if (TOOL_FILTER === 'BOTH' || TOOL_FILTER === 'B') {
        try {
            report.tool_B = await runTool('B — full download → .txt', downloadSubs, urls);
        } catch (e) {
            console.error('Tool B failed:', e.message);
            report.tool_B_error = e.message;
        }
    }

    saveResults('test-2-subtitles', report);

    console.log(`\n📁 Subtitle files in: ${SUBTITLES_DIR}`);
    const saved = fs.readdirSync(SUBTITLES_DIR).filter(f => f.endsWith('.txt'));
    console.log(`   ${saved.length} .txt file(s) saved`);
}

main().catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
});