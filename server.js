require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const YTDlpWrap = require('yt-dlp-wrap').default;
const r2 = require('./r2');

const ytDlp = new YTDlpWrap(path.join(__dirname, 'yt-dlp.exe'));
const FFMPEG_PATH = 'ffmpeg';

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

const MATCH_CONCURRENCY = 5;

async function runMatchQueue() {
  if (matchRunning) return;
  matchRunning = true;

  const failed = [];

  async function worker() {
    while (matchQueue.length > 0) {
      const { title, artist, retry = 0 } = matchQueue.shift();
      const key = `${title}|${artist}`;
      if (audioCache[key]?.videoId) continue;
      try {
        const info = await searchMeta(title, artist);
        audioCache[key] = { ...info, audioUrl: null, fetchedAt: Date.now() };
        r2.saveYtMatch(title, artist, info).catch(e => console.error('[R2 bgMatch]', e.message));
        console.log(`[bgMatch] ${title} - ${artist} → ${info.videoId}`);
      } catch (e) {
        if (retry < 2) {
          await new Promise(r => setTimeout(r, 2000));
          matchQueue.push({ title, artist, retry: retry + 1 });
        } else {
          console.warn(`[bgMatch] 최종 실패 "${title}": ${e.message}`);
          failed.push({ title, artist });
        }
      }
    }
  }

  const workers = Array.from({ length: MATCH_CONCURRENCY }, () => worker());
  await Promise.all(workers);

  if (failed.length > 0) console.warn(`[bgMatch] 미매칭 ${failed.length}곡 — 재시도 예약`);
  matchRunning = false;

  // 실패곡 1분 후 재시도
  if (failed.length > 0) {
    setTimeout(() => {
      for (const s of failed) matchQueue.push(s);
      runMatchQueue();
    }, 60 * 1000);
  }
}

function enqueueMatch(songs) {
  for (const s of songs) {
    const key = `${s.title}|${s.artist}`;
    if (!audioCache[key]?.videoId && !matchQueue.find(q => q.title === s.title && q.artist === s.artist)) {
      matchQueue.push({ title: s.title, artist: s.artist });
    }
  }
  runMatchQueue();
}

function cleanQuery(str) {
  return str.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
}

async function searchMeta(title, artist) {
  const query = `${cleanQuery(title)} ${cleanQuery(artist)} official audio`;
  const out = await ytDlp.execPromise([
    `ytsearch1:${query}`,
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
  const query = `${cleanQuery(title)} ${cleanQuery(artist)} official audio`;
  const out = await ytDlp.execPromise([
    `ytsearch1:${query}`,
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

async function extractByVideoId(videoId, meta) {
  const out = await ytDlp.execPromise([
    `https://www.youtube.com/watch?v=${videoId}`,
    '--dump-json', '--no-playlist',
    '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
  ]);
  const line = out.trim().split('\n').find(l => l.startsWith('{'));
  if (!line) throw new Error('URL 추출 실패');
  const info = JSON.parse(line);
  const audioUrl = info.requested_formats?.[0]?.url || info.url;
  if (!audioUrl) throw new Error('오디오 URL 없음');
  return {
    videoId,
    audioUrl,
    ytTitle:     meta?.ytTitle     || info.title,
    ytChannel:   meta?.ytChannel   || info.channel || info.uploader,
    ytThumbnail: meta?.ytThumbnail || info.thumbnail,
    duration:    meta?.duration     || info.duration || 0,
  };
}

// 서버 시작 시 오늘 R2 매칭 데이터를 audioCache에 프리로드
async function preloadFromR2() {
  try {
    const matches = await r2.getYtMatches(r2.today());
    for (const [key, val] of Object.entries(matches)) {
      if (val.videoId && !audioCache[key]?.videoId) {
        audioCache[key] = { ...val, audioUrl: null, fetchedAt: 0 };
      }
    }
    const total = Object.keys(audioCache).length;
    if (total > 0) console.log(`[R2 preload] ${total}곡 캐시 로드 완료`);
  } catch (e) {
    console.warn('[R2 preload] 스킵:', e.message);
  }
}

// ── Routes ──

app.get('/api/download', async (req, res) => {
  const { title, artist, songId } = req.query;
  if (!title || !artist) return res.status(400).json({ error: 'title, artist 필요' });

  const key = `${title}|${artist}`;
  const cached = audioCache[key];

  // 오디오 URL + 썸네일 병렬로 준비
  let audioUrl, coverUrl, lyric;
  try {
    if (cached?.videoId) {
      const info = await extractByVideoId(cached.videoId, cached);
      audioUrl = info.audioUrl;
      coverUrl = cached.ytThumbnail || info.ytThumbnail;
    } else {
      const info = await searchAndExtract(title, artist);
      audioUrl = info.audioUrl;
      coverUrl = info.ytThumbnail;
      audioCache[key] = { ...info, fetchedAt: Date.now() };
    }
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  // 멜론 썸네일 / 가사 병렬 fetch
  const [melonCover, melonLyric] = await Promise.allSettled([
    songId ? axios.get(`https://www.melon.com/song/detail.htm?songId=${songId}`, { headers: HEADERS, timeout: 5000 })
      .then(r => {
        const match = r.data.match(/cdnimg[^"']*_500\.jpg/);
        return match ? `https://${match[0]}` : null;
      }) : Promise.resolve(null),
    songId ? axios.get('https://www.melon.com/song/lyricInfo.json', {
      params: { songId },
      headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest', 'Referer': `https://www.melon.com/song/detail.htm?songId=${songId}` },
      timeout: 5000,
    }).then(r => r.data?.lyric?.replace(/<BR>/gi, '\n') || null) : Promise.resolve(null),
  ]);

  const thumbUrl = melonCover.value || coverUrl;
  lyric = melonLyric.value || '';

  // 썸네일을 임시 파일로 저장
  let thumbPath = null;
  if (thumbUrl) {
    try {
      const r = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
      thumbPath = path.join(os.tmpdir(), `meltube_thumb_${Date.now()}.jpg`);
      fs.writeFileSync(thumbPath, Buffer.from(r.data));
      console.log(`[download] 썸네일 저장: ${thumbPath} (${r.data.byteLength}bytes)`);
    } catch (e) {
      console.warn('[download] 썸네일 다운 실패:', e.message);
    }
  } else {
    console.warn('[download] 썸네일 URL 없음');
  }

  const filename = `${artist} - ${title}.mp3`.replace(/[\\/:*?"<>|]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Type', 'audio/mpeg');

  const outPath = path.join(os.tmpdir(), `meltube_out_${Date.now()}.mp3`);

  const ffArgs = ['-y', '-i', audioUrl];
  if (thumbPath) ffArgs.push('-i', thumbPath);
  ffArgs.push('-map', '0:a');
  if (thumbPath) ffArgs.push('-map', '1:v', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic');
  ffArgs.push(
    '-acodec', 'libmp3lame', '-q:a', '2',
    '-id3v2_version', '3',
    '-metadata', `title=${title}`,
    '-metadata', `artist=${artist}`,
    '-metadata', `USLT=${lyric}`,
    outPath,
  );

  const ff = spawn(FFMPEG_PATH, ffArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', d => ffErr += d.toString());
  ff.on('error', e => { console.error('[download ffmpeg]', e.message); if (!res.headersSent) res.status(500).end(); });
  ff.on('close', code => {
    if (thumbPath) fs.unlink(thumbPath, () => {});
    if (code !== 0) {
      console.error('[download ffmpeg 실패]', ffErr.slice(-300));
      if (!res.headersSent) res.status(500).end();
      return;
    }
    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    stream.on('close', () => fs.unlink(outPath, () => {}));
  });
  req.on('close', () => ff.kill());
});

app.get('/api/lyrics', async (req, res) => {
  const { songId } = req.query;
  if (!songId) return res.status(400).json({ error: 'songId 필요' });
  try {
    const r = await axios.get('https://www.melon.com/song/lyricInfo.json', {
      params: { songId },
      headers: {
        ...HEADERS,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `https://www.melon.com/song/detail.htm?songId=${songId}`,
      },
      timeout: 8000,
    });
    const lyric = r.data?.lyric || null;
    res.json({ lyric });
  } catch (e) {
    console.error('[lyrics]', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/chart', async (req, res) => {
  if (chartCache && Date.now() - chartCachedAt < CACHE_TTL) {
    return res.json({ source: 'cache', data: chartCache });
  }
  try {
    const data = await fetchMelon();
    chartCache = data;
    chartCachedAt = Date.now();
    r2.saveChart('melon', data).catch(e => console.error('[R2 saveChart]', e.message));
    enqueueMatch(data);
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
      if (entry?.videoId) {
        // videoId 알고 있으면 검색 스킵, URL 추출만
        console.log(`[stream] videoId 캐시 히트 → 추출만: ${entry.videoId}`);
        entry = { ...(await extractByVideoId(entry.videoId, entry)), fetchedAt: Date.now() };
      } else {
        entry = { ...(await searchAndExtract(title, artist)), fetchedAt: Date.now() };
      }
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
  preloadFromR2();
});
