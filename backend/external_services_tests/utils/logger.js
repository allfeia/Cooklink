'use strict';

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Saves test results to a timestamped JSON file.
 * @param {string} testName  e.g. 'test-1-metadata'
 * @param {object} data      any serializable object
 * @returns {string}         absolute path to saved file
 */
function saveResults(testName, data) {
  ensureDir(RESULTS_DIR);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(RESULTS_DIR, `${testName}_${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n💾  Results saved → ${file}`);
  return file;
}

/**
 * Prints a summary table for an array of per-URL result objects.
 * Each object must have: { url, status: 'ok'|'error', duration_ms, error? }
 */
function printSummary(results) {
  const ok   = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'error').length;
  const times = results.filter(r => typeof r.duration_ms === 'number').map(r => r.duration_ms);
  const avg  = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const max  = times.length ? Math.max(...times) : 0;

  console.log('\n──────────────── SUMMARY ────────────────');
  console.log(`  Total   : ${results.length}`);
  console.log(`  ✅ OK   : ${ok}`);
  console.log(`  ❌ Error: ${fail}`);
  console.log(`  ⏱  Avg  : ${avg} ms`);
  console.log(`  ⏱  Max  : ${max} ms`);

  if (fail > 0) {
    console.log('\n  Errors:');
    results
      .filter(r => r.status === 'error')
      .forEach(r => console.log(`    • ${r.url}\n      → ${r.error}`));
  }
  console.log('─────────────────────────────────────────\n');
}

module.exports = { saveResults, printSummary };
