import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const CACHED_URLS = [
  'https://youtu.be/tKBaalq3ln4?si=uCUbXUzWgGAdwLHk',
  'https://youtu.be/NR4jeYUhg4E?si=1W41efyBh1wkuzVf',
];

const BASE_URL = __ENV.BASE_URL || 'https://cooklink.ru';
const POLL_INTERVAL_S = 2;
const JOB_TIMEOUT_S = 120;

const jobDuration   = new Trend('job_duration_ms', true);
const jobsCompleted = new Counter('jobs_completed');
const jobsFailed    = new Counter('jobs_failed');
const pdfDownloaded = new Counter('pdf_downloaded');
const jobSuccessRate = new Rate('job_success_rate');


export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 5  },
        { duration: '2m', target: 10 },
        { duration: '2m', target: 20 },
        { duration: '2m', target: 35 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0  },
      ],
    },
  },
  thresholds: {
    job_success_rate: ['rate>0.95'],
    'job_duration_ms{scenario:ramp}': ['p(95)<60000'],
    'http_req_failed{step:create}': ['rate<0.01'],
  },
};

function pickUrl() {
  return CACHED_URLS[Math.floor(Math.random() * CACHED_URLS.length)];
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
    if (body.status === 'failed')    { finalStatus = 'failed';    break; }
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
      console.error(`[failed] ${job_id}`);
    }
  }
}

export function handleSummary(data) {
  const completed   = data.metrics.jobs_completed?.values?.count   ?? 0;
  const failed      = data.metrics.jobs_failed?.values?.count      ?? 0;
  const pdfs        = data.metrics.pdf_downloaded?.values?.count   ?? 0;
  const p50 = data.metrics.job_duration_ms?.values?.['p(50)'] ?? 0;
  const p95 = data.metrics.job_duration_ms?.values?.['p(95)'] ?? 0;
  const max = data.metrics.job_duration_ms?.values?.max       ?? 0;

  const summary = `
========== ТЕСТ 1: СЕРВЕРНЫЕ РЕСУРСЫ ==========
Jobs завершено:    ${completed}
Jobs с ошибкой:   ${failed}
PDF скачано:       ${pdfs}
Успешность:        ${completed + failed > 0 ? ((completed / (completed + failed)) * 100).toFixed(1) : 'n/a'}%

Время пайплайна (cache hit):
  медиана (p50):   ${(p50 / 1000).toFixed(1)}s
  хвост   (p95):   ${(p95 / 1000).toFixed(1)}s
  максимум:        ${(max / 1000).toFixed(1)}s
================================================
Смотри CPU/RAM/Disk в Grafana во время теста.
`;

  console.log(summary);
  return {
    stdout: summary,
    'load-test/results-test1.txt': summary,
  };
}
