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

    const hasSubs =
        Object.keys(info.subtitles ?? {}).length > 0 ||
        Object.keys(info.automatic_captions ?? {}).length > 0;

    if (!hasSubs) {
        throw new Error('NO_SUBTITLES');
    }

    return { videoId };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL B: yt-dlp full download → saves .txt file
// ─────────────────────────────────────────────────────────────────────────────
async function downloadSubs(url, attempt = 1) {
    const ytDlp   = require('yt-dlp-exec');
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('Cannot extract video ID from URL');

    const outTemplate = path.join(SUBTITLES_DIR, `${videoId}_yt-dlp_exec`);
    try {
        await ytDlp(url, {
            skipDownload:        true,
            writeSubs:           true,
            writeAutoSubs:       true,
            subLangs:            'ru',
            subFormat:           'vtt',
            output:              outTemplate,
            noCheckCertificate: true,
            cookies: path.join(__dirname, './www.youtube.com_cookies.txt'),
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

    const raw= fs.readFileSync(path.join(SUBTITLES_DIR, candidates[0]), 'utf-8');
    const transcript = stripMarkup(raw);

    if (!transcript || transcript.trim().length === 0) {
        candidates.forEach(c => fs.unlinkSync(path.join(SUBTITLES_DIR, c)));
        throw new Error('EMPTY_TRANSCRIPT');
    }

    // Clean up raw .vtt/.srt — keep only the .txt
    candidates.forEach(f => fs.unlinkSync(path.join(SUBTITLES_DIR, f)));

    return { transcript, videoId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic runner with per-request delay
// ─────────────────────────────────────────────────────────────────────────────
async function runTool(label, fetchFn, urls) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  Tool ${label} | delay: ~${BASE_DELAY_MS}ms`);
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
                const filename = `${videoId}_B__yt_dlp_exec.txt`;
                fs.writeFileSync(path.join(SUBTITLES_DIR, filename), result.transcript, 'utf-8');
                console.log(
                    `✅ ${duration_ms}ms | ` +
                    `${result.transcript.length} chars → ${filename}`
                );
                results.push({
                    status: 'ok', url, video_id: videoId,
                    char_count: result.transcript.length,
                    subtitle_file: filename, duration_ms,
                });
            } else {
                // Check-only mode
                console.log(`✅ ${duration_ms}ms`);
                results.push({
                    status: 'ok', url, video_id: videoId, duration_ms
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
    console.log(`  Tool     : ${TOOL_FILTER}`);
    console.log(`  Delay    : ~${BASE_DELAY_MS}ms between requests (+ jitter)`);
    console.log(`  Output   : ${SUBTITLES_DIR}`);
    console.log('═══════════════════════════════════════════════════════');

    const report = {
        runAt: new Date().toISOString(),
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