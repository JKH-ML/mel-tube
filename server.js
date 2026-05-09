require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;
const r2 = require('./r2');

const ytDlp = new YTDlpWrap(path.join(__dirname, 'yt-dlp.exe'));

const app = express();
app.use(express.static(path.join(__dirname)));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.melon.com',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
};

// ── 차트 캐시 ──
let chartCache = null;
let chartCachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function fetchMelon() {
  const r = await axios.get('https://www.melon.com/chart/index.htm', {
    headers: HEADERS,
    timeout: 12000,
  });
  const $ = cheerio.load(r.data);
  const songs = [];

  $('tr.lst50, tr.lst100').each((i, el) => {
    const row = $(el);
    const rank = parseInt(row.find('td .rank').first().text().trim(), 10);

    const rankWrap = row.find('.rank_wrap');
    let prevRank = rank;
    if (rankWrap.find('.rank_up').length) {
      prevRank = rank + (parseInt(rankWrap.find('.none').last().text().trim(), 10) || 0);
    } else if (rankWrap.find('.rank_down').length) {
      prevRank = rank - (parseInt(rankWrap.find('.none').last().text().trim(), 10) || 0);
    } else if (rankWrap.find('.rank_new').length) {
      prevRank = null;
    }

    const title  = row.find('.rank01 a').text().trim();
    const artist = row.find('.rank02 a').first().text().replace(/ /g, ' ').trim();
    const album  = row.find('.rank03 a').text().trim();
    const cover  = row.find('td img').first().attr('src') || '';
    const songId = row.find('input[name="input_check"]').attr('value') || '';

    if (rank && title) {
      songs.push({ rank, prevRank, title, artist, album, cover, songId, isNew: prevRank === null });
    }
  });

  return songs;
}

// ── 오디오 캐시 ──
const audioCache = {};
const AUDIO_TTL = 50 * 60 * 1000;

// ── 백그라운드 YT 매칭 큐 ──
const matchQueue = [];
let matchRunning = false;

async function runMatchQueue() {
  if (matchRunning) return;
  matchRunning = true;
  while (matchQueue.length > 0) {
    const { title, artist } = matchQueue.shift();
    const key = `${title}|${artist}`;
    if (audioCache[key]) continue;
    try {
      const info = await searchMeta(title, artist);
      audioCache[key] = { ...info, audioUrl: null, fetchedAt: Date.now() };
      r2.saveYtMatch(title, artist, info).catch(e => console.error('[R2 bgMatch]', e.message));
      console.log(`[bgMatch] ${title} - ${artist} → ${info.videoId}`);
    } catch (e) {
      console.warn(`[bgMatch] skip "${title}": ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  matchRunning = false;
}

function enqueueMatch(songs, limit = 20) {
  for (const s of songs.slice(0, limit)) {
    const key = `${s.title}|${s.artist}`;
    if (!audioCache[key] && !matchQueue.find(q => q.title === s.title && q.artist === s.artist)) {
      matchQueue.push({ title: s.title, artist: s.artist });
    }
  }
  runMatchQueue();
}

async function searchMeta(title, artist) {
  const out = await ytDlp.execPromise([
    `ytsearch1:${title} ${artist} official audio`,
    '--dump-json', '--no-playlist', '--skip-download',
  ]);
  const line = out.trim().split('\n').find(l => l.startsWith('{'));
  if (!line) throw new Error('검색 결과 없음');
  const info = JSON.parse(line);
  return {
    videoId:     info.id,
    ytTitle:     info.title,
    ytChannel:   info.channel || info.uploader,
    ytThumbnail: info.thumbnail,
    duration:    info.duration || 0,
  };
}

async function searchAndExtract(title, artist) {
  const out = await ytDlp.execPromise([
    `ytsearch1:${title} ${artist} official audio`,
    '--dump-json', '--no-playlist',
    '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
  ]);
  const line = out.trim().split('\n').find(l => l.startsWith('{'));
  if (!line) throw new Error('검색 결과 없음');
  const info = JSON.parse(line);
  const audioUrl = info.requested_formats?.[0]?.url || info.url;
  if (!audioUrl) throw new Error('오디오 URL 추출 실패');
  return {
    videoId:     info.id,
    audioUrl,
    ytTitle:     info.title,
    ytChannel:   info.channel || info.uploader,
    ytThumbnail: info.thumbnail,
    duration:    info.duration || 0,
  };
}

// ── Routes ──

app.get('/api/chart', async (req, res) => {
  if (chartCache && Date.now() - chartCachedAt < CACHE_TTL) {
    return res.json({ source: 'cache', data: chartCache });
  }
  try {
    const data = await fetchMelon();
    chartCache = data;
    chartCachedAt = Date.now();
    r2.saveChart('melon', data).catch(e => console.error('[R2 saveChart]', e.message));
    enqueueMatch(data, 20);
    res.json({ source: 'live', data });
  } catch (e) {
    console.error('[chart]', e.message);
    if (chartCache) return res.json({ source: 'cache-fallback', data: chartCache });
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/info', async (req, res) => {
  const { title, artist } = req.query;
  if (!title || !artist) return res.status(400).json({ error: 'title, artist 필요' });

  const key = `${title}|${artist}`;
  const cached = audioCache[key];
  if (cached && Date.now() - cached.fetchedAt < AUDIO_TTL) {
    const { videoId, ytTitle, ytChannel, ytThumbnail, duration } = cached;
    return res.json({ videoId, ytTitle, ytChannel, ytThumbnail, duration });
  }

  try {
    const info = await searchAndExtract(title, artist);
    audioCache[key] = { ...info, fetchedAt: Date.now() };
    const { videoId, ytTitle, ytChannel, ytThumbnail, duration } = info;
    r2.saveYtMatch(title, artist, { videoId, ytTitle, ytChannel, ytThumbnail, duration })
      .catch(e => console.error('[R2 saveYtMatch]', e.message));
    res.json({ videoId, ytTitle, ytChannel, ytThumbnail, duration });
  } catch (e) {
    console.error('[info]', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/stream', async (req, res) => {
  const { title, artist } = req.query;
  if (!title || !artist) return res.status(400).json({ error: 'title, artist 필요' });

  const key = `${title}|${artist}`;
  let entry = audioCache[key];

  if (!entry || !entry.audioUrl || Date.now() - entry.fetchedAt >= AUDIO_TTL) {
    try {
      entry = { ...(await searchAndExtract(title, artist)), fetchedAt: Date.now() };
      audioCache[key] = entry;
    } catch (e) {
      console.error('[stream]', e.message);
      return res.status(502).json({ error: e.message });
    }
  }

  const { audioUrl, videoId, ytTitle, ytChannel, ytThumbnail, duration } = entry;

  try {
    const upstream = await axios.get(audioUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
      timeout: 10000,
    });

    res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/webm');
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    if (upstream.headers['content-range'])  res.setHeader('Content-Range',  upstream.headers['content-range']);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Video-Id',    videoId);
    res.setHeader('X-YT-Title',    encodeURIComponent(ytTitle     || ''));
    res.setHeader('X-YT-Channel',  encodeURIComponent(ytChannel   || ''));
    res.setHeader('X-YT-Thumbnail',encodeURIComponent(ytThumbnail || ''));
    res.setHeader('X-YT-Duration', String(duration || 0));
    res.setHeader('Access-Control-Expose-Headers',
      'X-Video-Id,X-YT-Title,X-YT-Channel,X-YT-Thumbnail,X-YT-Duration');
    res.status(upstream.status);
    upstream.data.pipe(res);
  } catch (e) {
    console.error('[stream proxy]', e.message);
    if (!res.headersSent) res.status(502).json({ error: e.message });
  }
});

app.get('/api/match-status', (req, res) => {
  res.json({
    queueLength: matchQueue.length,
    running: matchRunning,
    matched: Object.keys(audioCache).length,
    next: matchQueue[0] || null,
  });
});

app.get('/api/history', async (req, res) => {
  try {
    res.json({ dates: await r2.listDates('melon') });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/history/:date', async (req, res) => {
  try {
    const [chart, ytMatches] = await Promise.all([
      r2.getChart(req.params.date, 'melon'),
      r2.getYtMatches(req.params.date),
    ]);
    if (!chart) return res.status(404).json({ error: '해당 날짜 데이터 없음' });
    res.json({ date: req.params.date, chart, ytMatches });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`K-Chart server → http://localhost:${PORT}`);
});
