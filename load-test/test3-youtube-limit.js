'use strict';

/**
 * ТЕСТ 3 — когда YouTube отдаёт 429
 * ─────────────────────────────────
 * Шлёт N запросов в минуту к yt-dlp (тот же вызов, что в сервисе:
 * dumpSingleJson + skipDownload + куки) и печатает, на каком по счёту
 * запросе / на какой минуте появился первый 429.
 *
 * ⚠️  Запускать на ПРОД-сервере (нужен датацентр-IP сервиса), внутри
 *     контейнера воркера — там есть yt-dlp и файл кук:
 *
 *   docker compose run --rm --no-deps -v "$(pwd)/load-test:/lt" \
 *     --entrypoint node metadata-worker /lt/test3-youtube-limit.js
 *
 * Ключи (все необязательные):
 *   --rpm=100        запросов в минуту (по умолчанию 100)
 *   --minutes=20     сколько минут гонять (по умолчанию 20)
 *   --cookies=PATH   файл кук (по умолчанию /app/youtube_cookies.txt)
 *   --urls=PATH      JSON [{url}] (по умолчанию /lt/videos.json, затем ./videos.json)
 *   --ytdlp=PATH     путь к модулю yt-dlp-exec (по умолчанию /app/backend/node_modules/yt-dlp-exec)
 *
 * NB: прод делает 2 вызова yt-dlp на рецепт (до дедупа). Значит "100 рецептов/мин"
 *     это --rpm=200. Поставь то число, которое хочешь проверить.
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (name, def) => {
    const h = argv.find((a) => a.startsWith(`--${name}=`));
    return h ? h.slice(name.length + 3) : def;
};

const RPM = Number(opt('rpm', 100));
const MINUTES = Number(opt('minutes', 20));
const COOKIES = opt('cookies', '/app/youtube_cookies.txt');
const YTDLP =
    opt('ytdlp', null) ||
    ['/app/backend/node_modules/yt-dlp-exec', path.join(__dirname, '..', 'backend', 'node_modules', 'yt-dlp-exec'), 'yt-dlp-exec'].find(
        (p) => {
            try {
                require.resolve(p);
                return true;
            } catch {
                return false;
            }
        }
    );
const URLS_FILE = opt('urls', ['/lt/videos.json', path.join(__dirname, 'videos.json')].find((p) => fs.existsSync(p)));

const ytDlp = require(YTDLP);
const urls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf-8')).map((x) => x.url || x);
const cookiesOpt = COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0 ? { cookies: COOKIES } : {};

const YTDLP_OPTS = { dumpSingleJson: true, skipDownload: true, noWarnings: true, noCheckCertificates: true, ...cookiesOpt };
const is429 = (e) => /429|Too Many Requests|not a bot|confirm you/i.test(String(e && (e.stderr || e.message || e)));

let sent = 0;
let ok = 0;
let rl = 0;
let errs = 0;
let first429 = null;
const t0 = Date.now();
const mmss = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

console.log(`\ncookies: ${cookiesOpt.cookies || 'НЕТ'} | yt-dlp: ${YTDLP}`);
console.log(`${urls.length} url, ${RPM} запросов/мин, ${MINUTES} мин\n`);

async function call(url) {
    const n = ++sent;
    const start = Date.now();
    try {
        await ytDlp(url, YTDLP_OPTS);
        ok++;
        console.log(`#${n}  ok    ${Date.now() - start}ms`);
    } catch (e) {
        if (is429(e)) {
            rl++;
            if (!first429) {
                first429 = { n, at: mmss(), okBefore: ok };
                console.log(`\n🛑 ПЕРВЫЙ 429 — запрос #${n}, время ${first429.at}, успешных до этого: ${ok}\n`);
            } else {
                console.log(`#${n}  429`);
            }
        } else {
            errs++;
            console.log(`#${n}  err   ${String(e.stderr || e.message || e).split('\n')[0].slice(0, 80)}`);
        }
    }
}

function summary() {
    console.log('\n──────── ИТОГ ────────');
    console.log(`время         : ${mmss()}`);
    console.log(`запросов      : ${sent}`);
    console.log(`ok / 429 / err: ${ok} / ${rl} / ${errs}`);
    console.log(`доля 429      : ${sent ? ((rl / sent) * 100).toFixed(1) : 0}%`);
    if (first429) {
        console.log(`первый 429    : запрос #${first429.n}, время ${first429.at}`);
        console.log(`менять куки   : примерно раз в ${Math.round(sent / rl)} запросов`);
    } else {
        console.log(`первый 429    : не было`);
    }
    console.log('──────────────────────\n');
}

process.on('SIGINT', () => {
    summary();
    process.exit(0);
});

(async () => {
    const gap = 60000 / RPM;
    const until = t0 + MINUTES * 60000;
    let i = 0;
    while (Date.now() < until) {
        call(urls[i++ % urls.length]); // не ждём — параллелятся сами
        await new Promise((r) => setTimeout(r, gap));
    }
    await new Promise((r) => setTimeout(r, 15000)); // добить хвост
    summary();
    process.exit(0);
})();
