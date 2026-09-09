import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend, Rate } from 'k6/metrics';

/**
 * ТЕСТ 1 — ТОЧКА ОТКАЗА СИСТЕМЫ
 * =============================
 * Цель: найти, при какой интенсивности запросов система перестаёт
 * справляться — растёт latency создания задачи, появляются 5xx/timeout,
 * падает success rate.
 *
 * Побочно ловит момент, когда yt-dlp начинает получать 429 от YouTube
 * (ошибка SUBTITLES_FETCH_FAILED в задаче) — и печатает порядковый номер
 * запроса, на котором это случилось (exec.scenario.iterationInTest).
 *
 * ПРЕДУСЛОВИЯ (иначе меряется не то):
 *  1. llm-worker замокан:  LLM_EXTRACT_PATH=/extract-mock  +  LLM_MOCK_DELAY_MS=4000
 *     -> на проде включается оверлеем docker-compose.loadtest.yml.
 *  2. Мок llm не пишет в recipeStore, поэтому каждый POST реально прогоняет
 *     metadata + subtitles + pdf. Корпус videos.json — редкие ролики, в проде
 *     их обычно нет в кэше (проверяй панель Cache Hit Rate).
 *  3. Мониторинг работает — CPU/RAM в Grafana (1860) параллельно с прогоном.
 *
 * ЗАПУСК:
 *   k6 run -e BASE_URL=https://cooklink.ru -e MAX_RPS=25 \
 *          --out json=load-test/results-test1.json load-test/test1-breakpoint.js
 */

// ── корпус URL (videos.json генерится из recipes-ru-en.json) ──────────────────
const VIDEOS = JSON.parse(open('./videos.json'));
const ALL = VIDEOS.map((v) => v.url);
const nth = (arr, i) => arr[i % arr.length]; // детерминированный обход по кругу

const BASE_URL        = __ENV.BASE_URL || 'http://localhost:8000';
const MAX_RPS         = parseInt(__ENV.MAX_RPS || '25', 10);   // потолок рампы, запр/сек
const STAGE_MIN       = parseInt(__ENV.STAGE_MIN || '2', 10);  // длина одной ступени, мин
const POLL_INTERVAL_S = parseInt(__ENV.POLL_INTERVAL_S || '3', 10);
const JOB_TIMEOUT_S   = parseInt(__ENV.JOB_TIMEOUT_S || '240', 10);

const createLatency   = new Trend('create_latency_ms', true);
const jobDuration     = new Trend('job_duration_ms', true);
const jobSuccessRate  = new Rate('job_success_rate');
const jobsCompleted   = new Counter('jobs_completed');
const jobsFailed      = new Counter('jobs_failed');
const jobsTimedOut    = new Counter('jobs_timed_out');
const failByStage     = {
  metadata:  new Counter('fail_stage_metadata'),
  subtitles: new Counter('fail_stage_subtitles'),
  llm:       new Counter('fail_stage_llm'),
  pdf:       new Counter('fail_stage_pdf'),
  unknown:   new Counter('fail_stage_unknown'),
};
const subtitles429    = new Counter('subtitles_429_total');
const firstSub429Iter = new Trend('first_subtitles_429_iteration'); // мин = порядковый номер первого 429

// ── рампа интенсивности: плоские ступени 1 -> MAX_RPS, потом сброс ──
// Каждая ступень = быстрый доезд за 15s + удержание STAGE_MIN минут на плато,
// чтобы на графике были читаемые «полки» и было ясно, на какой rps всё поехало.
function buildStages() {
  const targets = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50].filter((t) => t <= MAX_RPS);
  if (targets[targets.length - 1] !== MAX_RPS) targets.push(MAX_RPS);
  const stages = [];
  for (const t of targets) {
    stages.push({ duration: '15s', target: t });
    stages.push({ duration: `${STAGE_MIN}m`, target: t });
  }
  stages.push({ duration: '1m', target: 0 });
  return stages;
}

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000,            // поллинг держит VU занятыми ~весь пайплайн — нужен запас.
                              // если в итоге ненулевой dropped_iterations — упёрлись в этот
                              // лимит ИЛИ система так затормозила, что VU не освобождаются.
      gracefulStop: '5m',     // дать доездить уже созданным задачам после конца рампы
                              // (иначе k6 через 30s (default) обрывает in-flight поллинг
                              // и хвост прогона выглядит как волна фейлов, которой не было)
      stages: buildStages(),
    },
  },
  thresholds: {
    // это не «pass/fail» проекта, а маркеры где система поехала:
    'create_latency_ms': ['p(95)<2000'],
    'job_success_rate': ['rate>0.90'],
    'http_req_failed{step:create}': [
      'rate<0.02',
      // ПРЕДОХРАНИТЕЛЬ: если >35% запросов на создание задачи не проходят
      // (сервер отвергает/таймаутит) — прекратить прогон, а не долбить лежащий
      // сервер до конца рампы (в прошлый раз это уронило docker-демон).
      { threshold: 'rate<0.35', abortOnFail: true, delayAbortEval: '30s' },
    ],
  },
};

function classifyStage(errCode) {
  if (!errCode) return 'unknown';
  if (errCode === 'SUBTITLES_FETCH_FAILED' || errCode === 'NO_SUBTITLES') return 'subtitles';
  if (errCode === 'AI_EXTRACTION_FAILED' || errCode === 'INVALID_JSON_SCHEMA' || errCode === 'LLM_RATE_LIMITED') return 'llm';
  if (errCode === 'PDF_GENERATION_FAILED') return 'pdf';
  if (errCode === 'VIDEO_UNAVAILABLE' || errCode === 'VIDEO_TOO_LONG' || errCode === 'VIDEO_NO_AUDIO') return 'metadata';
  return 'unknown';
}

export default function () {
  const iterNo = exec.scenario.iterationInTest;       // сквозной номер запроса в тесте
  const sourceUrl = nth(ALL, iterNo);                 // каждый запрос — новое видео (по кругу)

  const createRes = http.post(
    `${BASE_URL}/v1/recipes`,
    JSON.stringify({ source_url: sourceUrl }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '20s', tags: { step: 'create' } }
  );
  createLatency.add(createRes.timings.duration);

  const createOk = check(createRes, {
    'create 202': (r) => r.status === 202,
    'has job_id': (r) => { try { return !!JSON.parse(r.body).job_id; } catch { return false; } },
  });
  if (!createOk) {
    jobsFailed.add(1);
    jobSuccessRate.add(false);
    console.error(`[create] iter=${iterNo} status=${createRes.status} ${String(createRes.body).slice(0, 160)}`);
    return;
  }

  const { job_id } = JSON.parse(createRes.body);
  const startMs = Date.now();
  const deadline = startMs + JOB_TIMEOUT_S * 1000;
  let finalStatus = null;
  let errCode = null;

  while (Date.now() < deadline) {
    sleep(POLL_INTERVAL_S);
    const pollRes = http.get(`${BASE_URL}/v1/recipes/${job_id}`, { timeout: '15s', tags: { step: 'poll' } });
    if (pollRes.status !== 200) continue;
    let body;
    try { body = JSON.parse(pollRes.body); } catch { continue; }
    if (body.status === 'completed') { finalStatus = 'completed'; break; }
    if (body.status === 'failed') {
      finalStatus = 'failed';
      errCode = body.error?.code || body.error_code;
      break;
    }
  }

  const durationMs = Date.now() - startMs;

  if (finalStatus === 'completed') {
    jobDuration.add(durationMs);
    jobsCompleted.add(1);
    jobSuccessRate.add(true);
    return;
  }

  jobsFailed.add(1);
  jobSuccessRate.add(false);

  if (!finalStatus) {
    jobsTimedOut.add(1);
    console.error(`[timeout] iter=${iterNo} job=${job_id} > ${JOB_TIMEOUT_S}s`);
    return;
  }

  const stage = classifyStage(errCode);
  failByStage[stage].add(1);

  if (errCode === 'SUBTITLES_FETCH_FAILED') {
    subtitles429.add(1);
    firstSub429Iter.add(iterNo);
    console.warn(`[SUB-429] iter=${iterNo} job=${job_id} — yt-dlp получил 429 от YouTube (после ретраев)`);
  } else {
    console.warn(`[failed] iter=${iterNo} job=${job_id} stage=${stage} code=${errCode}`);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const g = (name, key = 'count') => m[name]?.values?.[key] ?? 0;

  const completed = g('jobs_completed');
  const failed    = g('jobs_failed');
  const total     = completed + failed;
  const sub429    = g('subtitles_429_total');
  const firstSub429 = m.first_subtitles_429_iteration?.values?.min ?? null;

  const summary = `
========== ТЕСТ 1: ТОЧКА ОТКАЗА СИСТЕМЫ ==========
Потолок рампы:         ${MAX_RPS} запр/сек
Задач создано:          ${total}
  завершено:            ${completed}
  провалено:            ${failed}
  из них timeout:       ${g('jobs_timed_out')}
Success rate:            ${total > 0 ? ((completed / total) * 100).toFixed(1) : 'n/a'}%

Латентность POST /v1/recipes:
  p50:  ${(m.create_latency_ms?.values?.['p(50)'] ?? 0).toFixed(0)} ms
  p95:  ${(m.create_latency_ms?.values?.['p(95)'] ?? 0).toFixed(0)} ms
  max:  ${(m.create_latency_ms?.values?.max ?? 0).toFixed(0)} ms

Время полного пайплайна (успешные):
  p50:  ${((m.job_duration_ms?.values?.['p(50)'] ?? 0) / 1000).toFixed(1)} s
  p95:  ${((m.job_duration_ms?.values?.['p(95)'] ?? 0) / 1000).toFixed(1)} s
  max:  ${((m.job_duration_ms?.values?.max ?? 0) / 1000).toFixed(1)} s

Отказы по стадиям:
  metadata:   ${g('fail_stage_metadata')}
  subtitles:  ${g('fail_stage_subtitles')}
  llm(mock):  ${g('fail_stage_llm')}
  pdf:        ${g('fail_stage_pdf')}
  unknown:    ${g('fail_stage_unknown')}

--- 429 от библиотеки субтитров ---
Всего задач упало с SUBTITLES_FETCH_FAILED: ${sub429}
Первый 429 — на запросе №: ${firstSub429 ?? 'не пойман'}
(точный порядок сверь по --out json, поле first_subtitles_429_iteration)
==================================================
Точку отказа ищи там, где p95 create_latency и график ошибок
уходят вверх — сопоставь по времени с Grafana (CPU/RAM).
`;

  console.log(summary);
  return {
    stdout: summary,
    'load-test/results-test1.txt': summary,
  };
}
