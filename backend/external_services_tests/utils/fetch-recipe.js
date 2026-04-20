require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const path = require('path');

const URLS_FILE = path.join(__dirname, '../results', 'urls.js');

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

const TARGET_RU = 50;
const TARGET_EN = 50;
const MAX_DURATION_MIN = 15;

const RU_QUERIES = [
    'рецепт',
    'быстрый рецепт',
    'как готовить',
    'ужин рецепт',
];

const EN_QUERIES = [
    'recipe',
    'easy recipe',
    'quick recipe',
    'cooking tutorial',
];


async function searchVideos(query, pageToken = null, lang = null) {
    const res = await axios.get(`${BASE_URL}/search`, {
        params: {
            key: API_KEY,
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults: 50,
            pageToken,
            relevanceLanguage: lang,
        },
    });

    return res.data;
}

async function getVideoDetails(videoIds) {
    const res = await axios.get(`${BASE_URL}/videos`, {
        params: {
            key: API_KEY,
            part: 'contentDetails,snippet',
            id: videoIds.join(','),
        },
    });

    return res.data.items;
}

function parseDurationISO8601(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    const hours = parseInt(match?.[1] || 0, 10);
    const mins  = parseInt(match?.[2] || 0, 10);
    const secs  = parseInt(match?.[3] || 0, 10);

    return hours * 60 + mins + secs / 60;
}

function isRussian(text) {
    return /[а-яё]/i.test(text);
}

function isEnglish(text) {
    return /^[\x00-\x7F\s.,!?'"()-]+$/.test(text);
}

let ALL_URLS = [];

async function collectVideos(queries, target, langCode, langCheckFn) {
    let results = [];
    let pageToken = null;
    let queryIndex = 0;

    while (results.length < target) {
        const query = queries[queryIndex % queries.length];
        console.log(`🔍 ${langCode.toUpperCase()} search: ${query}`);

        const data = await searchVideos(query, pageToken, langCode);

        const videoIds = data.items.map(i => i.id.videoId);
        const details = await getVideoDetails(videoIds);

        for (const v of details) {
            const title = v.snippet.title;
            const durationISO = v.contentDetails.duration;

            if (!durationISO.includes('T')) continue;

            const durationMin = parseDurationISO8601(durationISO);

            if (durationMin > MAX_DURATION_MIN) continue;
            if (!durationMin || isNaN(durationMin))

            if (!langCheckFn(title)) continue;


            results.push({
                id: v.id,
                title,
                channel: v.snippet.channelTitle,
                duration: durationISO,
                duration_min: durationMin.toFixed(2),
                url: `https://www.youtube.com/watch?v=${v.id}`,
                language: langCode,
            });

            ALL_URLS.push(`https://www.youtube.com/watch?v=${v.id}`);

            if (results.length >= target) break;
        }

        pageToken = data.nextPageToken || null;
        queryIndex++;

        if (!pageToken && queryIndex > queries.length) break;
    }

    return results.slice(0, target);
}

async function main() {
    console.log('═══════════════════════════════');
    console.log(' Fetching RU + EN recipe videos');
    console.log('═══════════════════════════════\n');

    const ruVideos = await collectVideos(
        RU_QUERIES,
        TARGET_RU,
        'ru',
        isRussian
    );

    const enVideos = await collectVideos(
        EN_QUERIES,
        TARGET_EN,
        'en',
        isEnglish
    );

    const all = [...ruVideos, ...enVideos];

    const unique = Array.from(
        new Map(all.map(v => [v.id, v])).values()
    );

    const jsonPath = path.join(__dirname, '../results/recipes-ru-en.json');
    const jsPath = path.join(__dirname, '../results/test-urls-auto.js');

    fs.writeFileSync(
        jsonPath,
        JSON.stringify(unique, null, 2)
    );

    fs.writeFileSync(
        jsPath,
        `'use strict';
const TEST_URLS = ${JSON.stringify([...new Set(ALL_URLS)], null, 2)};
module.exports = TEST_URLS;`
    );

    console.log('\n──────── RESULT ────────');
    console.log(`RU: ${ruVideos.length}`);
    console.log(`EN: ${enVideos.length}`);
    console.log(`TOTAL: ${unique.length}`);
    console.log('Saved → recipes-ru-en.json\n');
}

main().catch(err => {
    console.error('❌ Error:', err.response?.data || err.message);
});