'use strict';

/**
 * ТЕСТ 3 — ЛИМИТ YOUTUBE / yt-dlp (когда прилетает 429)
 * ====================================================================
 * Вопрос: сколько вызовов к YouTube выдерживает библиотека субтитров
 * до `HTTP Error 429`, и (а) при какой устойчивой частоте, (б) при каком
 * размере одновременного залпа.
 *
 * ВАЖНО — как YouTube считает:
 *  - Лимит привязан к IP (и к куки-сессии, если куки заданы), НЕ к
 *    «пользователю». В проде все пользователи ходят через один IP сервера,
 *    поэтому реальный вопрос = «сколько вызовов yt-dlp/мин с одного IP».
 *  - Один рецепт = 2 одинаковых вызова `yt-dlp --dump-single-json`
 *    (metadata + субтитры). Т.е. N рецептов ≈ 2N вызовов к YouTube.
 *  - Датацентр-IP (прод) душат заметно жёстче, чем резидентный (твой Mac).
 *    Числа с Mac и с сервера будут разными — это ожидаемо.
 *  - yt-dlp внутренние ретраи здесь ВЫКЛючены (`retries: 0`), чтобы видеть
 *    сырой первый 429. Прод сверху добавляет свой backoff-ретрай (3 попытки).
 *  - Один жёсткий прогон «жжёт» IP на часы. С Mac — не критично, на проде
 *    после прогона живые запросы будут падать с SUBTITLES_FETCH_FAILED.
 *
 * РЕЖИМЫ:
 *   --mode=ramp   (default) — частота вызовов растёт ступенями, ищем где 429
 *   --mode=burst           — залпы из N параллельных вызовов, N растёт
 *   --mode=both            — сначала burst, потом ramp
 *
 * RAMP:
 *   --rpms=10,20,40,80,160,240   ступени частоты, вызовов/мин  (default)
 *   --per-level=15               вызовов на каждую ступень     (default 15)
 *   --after-429=15               ещё столько вызовов после первого 429 (разово/стабильно) (default 15)
 *
 * BURST:
 *   --sizes=2,4,6,8,12,16,24   размеры одновременных залпов    (default)
 *   --gap=90                   пауза между залпами, сек        (default 90)
 *
 * ОБЩЕЕ:
 *   --cookies=PATH   явный путь к cookies.txt (default: ../youtube_cookies.txt)
 *   --no-cookies     гонять анонимно
 *   --out=PATH       куда писать json (default: load-test/results-test3-youtube.json)
 *
 * ЗАПУСК (с Mac — свежий резидентный IP):
 *   node load-test/test3-youtube-limit.js --mode=burst --no-cookies
 *   node load-test/test3-youtube-limit.js --mode=ramp  --no-cookies --max-calls=150
 *
 * ЗАПУСК на проде (реальный датацентр-IP, жжёт IP):
 *   scp load-test/test3-youtube-limit.js load-test/videos.json root@SERVER:~/recipe-generator-app/load-test/
 *   ssh root@SERVER 'cd ~/recipe-generator-app && node load-test/test3-youtube-limit.js --mode=both --cookies=youtube_cookies.txt'
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ytDlp = require(path.join(ROOT, 'backend/node_modules/yt-dlp-exec'));

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};

const MODE       = opt('mode', 'ramp');
const RPMS       = opt('rpms', '10,20,40,80,160,240').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
const PER_LEVEL  = parseInt(opt('per-level', '15'), 10);  // вызовов на каждую ступень частоты
const AFTER_429  = parseInt(opt('after-429', '15'), 10);  // ещё столько вызовов после первого 429 — понять, разово или стабильно
const SIZES      = opt('sizes', '2,4,6,8,12,16,24').split(',').map((s) => parseInt(s, 10)).filter(Boolean);
const GAP_S      = parseInt(opt('gap', '90'), 10);
const OUT        = opt('out', path.join(__dirname, 'results-test3-youtube.json'));

let COOKIES = opt('cookies', path.join(ROOT, 'youtube_cookies.txt'));
if (flag('no-cookies')) COOKIES = null;
const cookiesOpt =
  COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0 ? { cookies: COOKIES } : {};

const VIDEOS = JSON.parse(fs.readFileSync(path.join(ROOT, 'load-test/videos.json'), 'utf-8'));
const URLS = VIDEOS.map((v) => v.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const YTDLP_OPTS = {
  dumpSingleJson: true,
  skipDownload: true,
  noWarnings: true,
  noCheckCertificates: true,
  retries: 0,
  extractorRetries: 0,
  ...cookiesOpt,
};

function is429(err) {
  const s = err && (err.stderr || err.message || String(err));
  return typeof s === 'string' && /HTTP Error 429|Too Many Requests|Sign in to confirm|not a bot|rate.?limit/i.test(s);
}
// «доброкачественные» ошибки конкретного видео — не лимит, просто это видео такое
function isBenign(err) {
  const s = err && (err.stderr || err.message || String(err));
  return typeof s === 'string' && /Private video|Video unavailable|members-only|removed by the uploader|no longer available|account.*terminated|age|not available in your country/i.test(s);
}
function errText(err) {
  return (err && (err.stderr || err.message || String(err)) || '').replace(/\s+/g, ' ').slice(0, 260);
}

// ── один вызов (то же, что делают metadata- и subtitles-воркеры) ──────────────
async function oneCall(ordinal, url, meta) {
  const t0 = Date.now();
  const rec = { n: ordinal, id: url.split('=').pop(), at_s: +((Date.now() - START_AT) / 1000).toFixed(1), ...meta };
  try {
    const raw = await ytDlp(url, YTDLP_OPTS);
    rec.ok = true;
    rec.ms = Date.now() - t0;
    rec.note = `dur=${raw.duration}s subs=${Object.keys(raw.subtitles || {}).length}/${Object.keys(raw.automatic_captions || {}).length}`;
  } catch (err) {
    rec.ok = false;
    rec.ms = Date.now() - t0;
    rec.is429 = is429(err);
    rec.benign = !rec.is429 && isBenign(err);
    rec.error = errText(err);
  }
  RESULTS.push(rec);
  const tag = rec.ok ? '✅' : rec.is429 ? '🔴 429' : rec.benign ? '⚪ skip' : '❌';
  process.stdout.write(`  #${String(ordinal).padStart(3)}  ${tag}  ${rec.ms}ms  ${rec.ok ? rec.note : rec.error.slice(0, 90)}\n`);
  return rec;
}

const RESULTS = [];
let START_AT = Date.now();
let firstFail = null;

// ── RAMP: держим ступень частоты PER_LEVEL вызовов, потом следующую ──────────
async function runRamp() {
  console.log(`\n─── RAMP: ступени ${RPMS.join(', ')} вызовов/мин, по ${PER_LEVEL} вызовов на ступень ───`);
  console.log(`    (⚪ skip = приватное/удалённое видео, не лимит — не считается)\n`);
  let sent = 0;
  let first429 = null;
  let after429 = 0;

  for (const rpm of RPMS) {
    console.log(`  ── ступень: ${rpm} вызовов/мин ──`);
    for (let i = 0; i < PER_LEVEL; i++) {
      sent++;
      const rec = await oneCall(sent, URLS[(sent - 1) % URLS.length], { mode: 'ramp', rpm_target: rpm });

      if (rec.is429 && !first429) {
        first429 = { ordinal: sent, at_s: rec.at_s, rpm_target: rpm };
        firstFail = first429;
        console.log(`\n  ▶▶ ПЕРВЫЙ 429: вызов №${sent}, ${rec.at_s}s от старта ramp, на частоте ${rpm} вызовов/мин\n`);
      }
      if (first429 && ++after429 >= AFTER_429) {
        console.log(`\n  (сделали ещё ${AFTER_429} вызовов после первого 429 — стоп)\n`);
        return;
      }
      const gapMs = Math.max(0, 60000 / rpm - rec.ms); // держим частоту с учётом времени вызова
      if (gapMs > 0) await sleep(gapMs);
    }
  }
  console.log(`\n  429 не поймали до ${RPMS[RPMS.length - 1]} вызовов/мин / ${sent} вызовов.\n`);
}

// ── BURST: залпы из N параллельных вызовов ───────────────────────────────────
async function runBurst() {
  console.log(`\n─── BURST: залпы ${SIZES.join(', ')}, пауза ${GAP_S}s между ними ───\n`);
  let sent = 0;
  const bursts = [];

  for (const size of SIZES) {
    console.log(`  ── залп из ${size} одновременных вызовов ──`);
    const batchStart = Date.now();
    const recs = await Promise.all(
      Array.from({ length: size }, () => {
        sent++;
        return oneCall(sent, URLS[(sent - 1) % URLS.length], { mode: 'burst', burst_size: size });
      })
    );
    const n429 = recs.filter((r) => r.is429).length;
    const nFail = recs.filter((r) => !r.ok).length;
    const b = { size, ok: recs.filter((r) => r.ok).length, fail: nFail, http_429: n429, ms: Date.now() - batchStart };
    bursts.push(b);
    console.log(`     → ${b.ok}/${size} ок, ${n429} × 429, ${nFail - n429} прочих ошибок\n`);
    if (n429 > 0 && !firstFail) firstFail = { mode: 'burst', burst_size: size, count_429: n429 };
    if (SIZES.indexOf(size) < SIZES.length - 1) {
      console.log(`     (пауза ${GAP_S}s)`);
      await sleep(GAP_S * 1000);
    }
  }
  return bursts;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  ТЕСТ 3 — лимит YouTube / yt-dlp (429)');
  console.log(`  режим: ${MODE}   cookies: ${cookiesOpt.cookies ? path.basename(cookiesOpt.cookies) : 'НЕТ (аноним)'}`);
  console.log(`  корпус: ${URLS.length} видео   ретраи yt-dlp: выкл`);
  console.log('══════════════════════════════════════════════════════════════');

  START_AT = Date.now();
  let bursts = null;

  if (MODE === 'burst' || MODE === 'both') bursts = await runBurst();
  if (MODE === 'ramp' || MODE === 'both') {
    if (MODE === 'both') { console.log(`\n  (пауза ${GAP_S}s перед RAMP — даём IP выдохнуть)`); await sleep(GAP_S * 1000); }
    firstFail = null;
    START_AT = Date.now();
    await runRamp();
  }

  // ── сводка ──
  const all = RESULTS;
  const ok = all.filter((r) => r.ok);
  const n429 = all.filter((r) => r.is429).length;
  const nBenign = all.filter((r) => r.benign).length;
  const nOther = all.length - ok.length - n429 - nBenign;
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] : 0);
  const rampRecs = all.filter((r) => r.mode === 'ramp');
  const ramp429 = rampRecs.find((r) => r.is429);

  // максимальная частота, которую держали без единого 429 (по ступеням ramp)
  let sustainedRpm = null;
  for (const rpm of RPMS) {
    const lvl = rampRecs.filter((r) => r.rpm_target === rpm);
    if (!lvl.length) break;
    if (lvl.some((r) => r.is429)) break;
    sustainedRpm = rpm;
  }

  console.log('\n════════════════════ СВОДКА ТЕСТ 3 ════════════════════');
  console.log(`  cookies:              ${cookiesOpt.cookies ? 'да' : 'нет (аноним)'}`);
  console.log(`  Всего вызовов:        ${all.length}`);
  console.log(`  Успешно:              ${ok.length}`);
  console.log(`  429 (лимит):          ${n429}`);
  console.log(`  ⚪ приват/удалено:     ${nBenign}   ❌ прочее:  ${nOther}`);
  console.log(`  Латентность yt-dlp:   p50 ${pct(50)}ms | p95 ${pct(95)}ms | max ${lat[lat.length - 1] || 0}ms`);

  if (bursts) {
    console.log('\n  BURST — одновременные вызовы (N пользователей вставили ссылку в одну секунду):');
    for (const b of bursts) console.log(`    залп ${String(b.size).padStart(2)}: ${b.ok}/${b.size} ок${b.http_429 ? `, 🔴 ${b.http_429} × 429` : ''}`);
    const firstBad = bursts.find((b) => b.http_429 > 0);
    console.log(`    → порог: ${firstBad ? `429 с залпа ${firstBad.size}` : `до ${SIZES[SIZES.length - 1]} одновременных — БЕЗ 429`}`);
  }

  if (rampRecs.length) {
    console.log('\n  RAMP — устойчивая частота вызовов/мин с одного IP:');
    if (ramp429) {
      const after = rampRecs.filter((r) => r.n > ramp429.n);
      const after429 = after.filter((r) => r.is429).length;
      console.log(`    держит:       ${sustainedRpm ?? '<' + RPMS[0]} вызовов/мин без 429`);
      console.log(`    первый 429:   на ступени ${ramp429.rpm_target}/мин, вызов №${ramp429.n} (${ramp429.at_s}s)`);
      console.log(`    после 429:    ${after429}/${after.length} тоже 429 → ${after429 === after.length ? 'СТАБИЛЬНЫЙ бан' : after429 === 0 ? 'разовый всплеск' : 'частичный (' + after429 + '/' + after.length + ')'}`);
    } else {
      console.log(`    до ${RPMS[RPMS.length - 1]} вызовов/мин (${rampRecs.length} вызовов) — 429 НЕ поймали.`);
    }
  }
  console.log('\n  Напоминание: 1 рецепт = 2 таких вызова. Прод-IP (датацентр) душат жёстче этого.');
  console.log('══════════════════════════════════════════════════════════\n');

  fs.writeFileSync(OUT, JSON.stringify({
    params: { MODE, RPMS, PER_LEVEL, AFTER_429, SIZES, GAP_S, cookies: !!cookiesOpt.cookies },
    summary: {
      total: all.length, ok: ok.length, http_429: n429, benign: nBenign, other_errors: nOther,
      latency_ms: { p50: pct(50), p95: pct(95), max: lat[lat.length - 1] || 0 },
      burst_first_429_size: (bursts || []).find((b) => b.http_429 > 0)?.size ?? null,
      burst_max_tested: SIZES[SIZES.length - 1],
      ramp_sustained_rpm: sustainedRpm,
      ramp_first_429: ramp429 ? { n: ramp429.n, at_s: ramp429.at_s, rpm_target: ramp429.rpm_target } : null,
      bursts,
    },
    results: all,
  }, null, 2));
  console.log(`  → ${OUT}`);
})().catch((e) => { console.error('\n💥', e); process.exit(1); });
