import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const TEST_URLS = [
  'https://youtu.be/7oUqRIysbag?si=Dadx1SLSA0DEugGl',
  'https://youtu.be/IH5LXD0_K0o?si=QotjmkrptT6C4HMU',
  'https://youtu.be/MhLiVo3EqkE?si=uLrH5TIWz4q3gFgw',
  'https://youtu.be/4TAsSXhuTow?si=nlo-c6zctqFmM93L',
];

const BASE_URL = __ENV.BASE_URL || 'https://cooklink.ru';
const POLL_INTERVAL_S = 3;
const JOB_TIMEOUT_S = 180;

const jobDuration    = new Trend('job_duration_ms', true);
const jobsCompleted  = new Counter('jobs_completed');
const jobsFailed     = new Counter('jobs_failed');
const pdfDownloaded  = new Counter('pdf_downloaded');
const jobSuccessRate = new Rate('job_success_rate');

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 5  },
        { duration: '3m', target: 10 },
        { duration: '3m', target: 20 },
        { duration: '2m', target: 30 },
        { duration: '1m', target: 0  },
      ],
    },
  },
  thresholds: {
    job_success_rate: ['rate>0.90'],
    'http_req_failed{step:create}': ['rate<0.05'],
  },
};

function pickUrl() {
  return TEST_URLS[Math.floor(Math.random() * TEST_URLS.length)];
}

export default function () {
  const createRes = http.post(
    `${BASE_URL}/v1/recipes`,
    JSON.stringify({ source_url: pickUrl() }),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '15s',
      tags: { step: 'create' },
    }
  );

  const createOk = check(createRes, {
    'create 202': (r) => r.status === 202,
    'has job_id': (r) => {
      try { return !!JSON.parse(r.body).job_id; } catch { return false; }
    },
  });

  if (!createOk) {
    jobsFailed.add(1);
    jobSuccessRate.add(false);
    console.error(`[create] failed ${createRes.status}: ${String(createRes.body).slice(0, 200)}`);
    return;
  }

  const { job_id } = JSON.parse(createRes.body);
  const startMs = Date.now();
  const deadline = startMs + JOB_TIMEOUT_S * 1000;
  let finalStatus = null;
  let errorCode = null;

  while (Date.now() < deadline) {
    sleep(POLL_INTERVAL_S);

    const pollRes = http.get(`${BASE_URL}/v1/recipes/${job_id}`, {
      timeout: '10s',
      tags: { step: 'poll' },
    });

    if (pollRes.status !== 200) continue;

    let body;
    try { body = JSON.parse(pollRes.body); } catch { continue; }

    if (body.status === 'completed') { finalStatus = 'completed'; break; }
    if (body.status === 'failed') {
      finalStatus = 'failed';
      errorCode = body.error?.code;
      break;
    }
  }

  const durationMs = Date.now() - startMs;

  if (finalStatus === 'completed') {
    jobDuration.add(durationMs);
    jobsCompleted.add(1);
    jobSuccessRate.add(true);

    const pdfRes = http.get(`${BASE_URL}/v1/recipes/${job_id}/pdf`, {
      timeout: '30s',
      tags: { step: 'pdf' },
    });
    check(pdfRes, { 'pdf 200': (r) => r.status === 200 });
    if (pdfRes.status === 200) pdfDownloaded.add(1);

  } else {
    jobsFailed.add(1);
    jobSuccessRate.add(false);
    if (!finalStatus) {
      console.error(`[timeout] ${job_id} exceeded ${JOB_TIMEOUT_S}s`);
    } else {
      console.error(`[failed] ${job_id} — ${errorCode}`);
    }
  }
}

export function handleSummary(data) {
  const completed  = data.metrics.jobs_completed?.values?.count ?? 0;
  const failed     = data.metrics.jobs_failed?.values?.count    ?? 0;
  const pdfs       = data.metrics.pdf_downloaded?.values?.count ?? 0;
  const p95 = data.metrics.job_duration_ms?.values?.['p(95)'] ?? 0;
  const med = data.metrics.job_duration_ms?.values?.med        ?? 0;
  const max = data.metrics.job_duration_ms?.values?.max        ?? 0;

  const summary = `
========== ТЕСТ 2: ПОЛНЫЙ ПАЙПЛАЙН (MOCK LLM) ==========
Jobs завершено:    ${completed}
Jobs с ошибкой:   ${failed}
PDF скачано:       ${pdfs}
Успешность:        ${completed + failed > 0 ? ((completed / (completed + failed)) * 100).toFixed(1) : 'n/a'}%

Время пайплайна (metadata + subtitles + mock LLM + PDF):
  медиана:         ${(med / 1000).toFixed(1)}s
  хвост   (p95):   ${(p95 / 1000).toFixed(1)}s
  максимум:        ${(max / 1000).toFixed(1)}s
=========================================================
`;

  console.log(summary);
  return {
    stdout: summary,
    'load-test/results-test2.txt': summary,
  };
}
