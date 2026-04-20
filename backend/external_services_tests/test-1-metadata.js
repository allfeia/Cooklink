'use strict';

/**
 * TEST 1 — YouTube Metadata
 * ─────────────────────────
 * Compares three approaches for fetching video metadata (title, channel, duration):
 *   [A] @distube/ytdl-core  — pure JS, no binary required
 *   [B] yt-dlp-exec         — wraps yt-dlp binary (must be installed on the system)
 *   [C] YouTube Data API v3 — official Google API (requires YOUTUBE_API_KEY in .env)
 *
 * Output: results/test-1-metadata_<timestamp>.json
 *
 * Usage:
 *   node test-1-metadata.js
 *   node test-1-metadata.js --tool=A     # run only ytdl-core
 *   node test-1-metadata.js --tool=B     # run only yt-dlp-exec
 *   node test-1-metadata.js --tool=C     # run only YouTube Data API v3
 */

require('dotenv').config();
const { saveResults, printSummary } = require('./utils/logger');
const TEST_URLS = require('./results/test-urls-auto');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const arg = process.argv.find(a => a.startsWith('--tool='));
const TOOL_FILTER = arg ? arg.split('=')[1].toUpperCase() : 'ALL'; // 'A' | 'B' | 'C' | 'ALL'

const MAX_DURATION_SEC  = parseInt(process.env.MAX_VIDEO_DURATION_SEC ?? '3600', 10);
const YOUTUBE_API_KEY   = process.env.YOUTUBE_API_KEY ?? null;

// ─────────────────────────────────────────────────────────────────────────────
// TOOL A: @distube/ytdl-core
// ─────────────────────────────────────────────────────────────────────────────
async function fetchMetaYtdlCore(url) {
  const ytdl = require('@distube/ytdl-core');
  const info = await ytdl.getBasicInfo(url);
  const { videoDetails } = info;
  return {
    title:       videoDetails.title,
    channel:     videoDetails.author?.name ?? null,
    duration_sec: parseInt(videoDetails.lengthSeconds, 10),
    view_count:  parseInt(videoDetails.viewCount, 10),
    is_live:     videoDetails.isLiveContent,
    url,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL B: yt-dlp-exec
// ─────────────────────────────────────────────────────────────────────────────
async function fetchMetaYtDlp(url) {
  const ytDlp = require('yt-dlp-exec');
  const info = await ytDlp(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    skipDownload: true,
  });
  return {
    title:        info.title,
    channel:      info.uploader ?? info.channel ?? null,
    duration_sec: info.duration,
    view_count:   info.view_count,
    is_live:      info.is_live,
    url,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL C: YouTube Data API v3 (official Google API)
// ─────────────────────────────────────────────────────────────────────────────

// Extract video ID from any standard YouTube URL format
function extractVideoId(url) {
  const m = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?]+)/);
  return m?.[1] ?? null;
}

// Convert ISO 8601 duration (PT1H23M45S) → seconds
function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (parseInt(m[1] ?? 0) * 3600) + (parseInt(m[2] ?? 0) * 60) + parseInt(m[3] ?? 0);
}

async function fetchMetaYouTubeAPI(url) {
  if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY is not set in .env');

  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Cannot extract video ID from URL');

  // Single request: parts=snippet (title, channel) + contentDetails (duration) + statistics
  const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  apiUrl.searchParams.set('part',  'snippet,contentDetails,statistics');
  apiUrl.searchParams.set('id',    videoId);
  apiUrl.searchParams.set('key',   YOUTUBE_API_KEY);
  apiUrl.searchParams.set('fields',
    'items(snippet(title,channelTitle,liveBroadcastContent),' +
    'contentDetails(duration),' +
    'statistics(viewCount))'
  );

  const res = await fetch(apiUrl.toString());

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.message ?? res.statusText;
    // Surface quota/auth errors clearly
    if (res.status === 403) throw new Error(`QUOTA_OR_AUTH_ERROR: ${reason}`);
    if (res.status === 400) throw new Error(`BAD_REQUEST: ${reason}`);
    throw new Error(`YouTube API ${res.status}: ${reason}`);
  }

  const data  = await res.json();
  const item  = data.items?.[0];
  if (!item) throw new Error(`VIDEO_NOT_FOUND (id=${videoId})`);

  const duration_sec = parseDuration(item.contentDetails?.duration);

  return {
    title:        item.snippet.title,
    channel:      item.snippet.channelTitle ?? null,
    duration_sec,
    duration_iso: item.contentDetails?.duration ?? null,
    view_count:   parseInt(item.statistics?.viewCount ?? 0, 10),
    is_live:      item.snippet.liveBroadcastContent === 'live',
    url,
    video_id:     videoId,
  };
}


async function runTool(label, fetchFn, urls) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Tool ${label}`);
  console.log(`${'─'.repeat(50)}`);

  const results = [];

  for (const url of urls) {
    process.stdout.write(`  Fetching ${url} … `);
    const t0 = Date.now();
    try {
      const meta = await fetchFn(url);
      const duration_ms = Date.now() - t0;

      // Business-rule validation
      let warning = null;
      if (meta.duration_sec > MAX_DURATION_SEC) {
        warning = `TOO_LONG (${meta.duration_sec}s > ${MAX_DURATION_SEC}s)`;
      }
      if (meta.is_live) {
        warning = 'LIVE_STREAM';
      }

      console.log(`✅ ${duration_ms}ms${warning ? ' ⚠️  ' + warning : ''}`);
      results.push({ status: 'ok', duration_ms, meta, warning, url });

    } catch (err) {
      const duration_ms = Date.now() - t0;
      const error = err?.message ?? String(err);
      console.log(`❌ ${duration_ms}ms — ${error}`);
      results.push({ status: 'error', duration_ms, error, url });
    }
  }

  printSummary(results);
  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST 1 — YouTube Metadata (compare 3 tools)');
  console.log(`  URLs: ${TEST_URLS.length}   Tool filter: ${TOOL_FILTER}`);
  if (!YOUTUBE_API_KEY) console.log('  ⚠️  YOUTUBE_API_KEY not set — Tool C will be skipped');
  console.log('═══════════════════════════════════════════════════════');

  const report = { runAt: new Date().toISOString(), tool_filter: TOOL_FILTER, urls: TEST_URLS };

  if (TOOL_FILTER === 'ALL' || TOOL_FILTER === 'A') {
    try {
      report.tool_A = await runTool('A (@distube/ytdl-core)', fetchMetaYtdlCore, TEST_URLS);
    } catch (e) {
      console.error('Tool A crashed (is @distube/ytdl-core installed?):', e.message);
      report.tool_A = [{ status: 'error', error: 'library not installed: ' + e.message }];
    }
  }

  if (TOOL_FILTER === 'ALL' || TOOL_FILTER === 'B') {
    try {
      report.tool_B = await runTool('B (yt-dlp-exec)', fetchMetaYtDlp, TEST_URLS);
    } catch (e) {
      console.error('Tool B crashed (is yt-dlp binary installed?):', e.message);
      report.tool_B = [{ status: 'error', error: 'binary not installed: ' + e.message }];
    }
  }

  if (TOOL_FILTER === 'ALL' || TOOL_FILTER === 'C') {
    if (!YOUTUBE_API_KEY) {
      console.warn('\n⚠️  Skipping Tool C: YOUTUBE_API_KEY not set in .env');
      report.tool_C = [{ status: 'error', error: 'YOUTUBE_API_KEY not configured' }];
    } else {
      try {
        report.tool_C = await runTool('C (YouTube Data API v3)', fetchMetaYouTubeAPI, TEST_URLS);
      } catch (e) {
        console.error('Tool C crashed:', e.message);
        report.tool_C = [{ status: 'error', error: e.message }];
      }
    }
  }

  // Side-by-side comparison across all available tools
  const toolEntries = [
    report.tool_A && ['A', report.tool_A],
    report.tool_B && ['B', report.tool_B],
    report.tool_C && ['C', report.tool_C],
  ].filter(Boolean);

  if (toolEntries.length > 1) {
    console.log('\n📊 Head-to-head comparison:');
    console.log(`  ${'URL (last 20 chars)'.padEnd(22)}${toolEntries.map(([l]) => l.padStart(8)).join('')}`);
    console.log(`  ${''.padEnd(22)}${toolEntries.map(([l]) => 'ms'.padStart(8)).join('')}`);

    TEST_URLS.forEach((url, i) => {
      const label = url.slice(-20).padEnd(22);
      const times = toolEntries.map(([, results]) => {
        const r = results[i];
        if (!r) return '    N/A';
        if (r.status === 'error') return '    ERR';
        return String(r.duration_ms).padStart(7);
      }).join('');
      console.log(`  ${label}${times}`);
    });
  }

  saveResults('test-1-metadata', report);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
