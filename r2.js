require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;

function today() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// 차트 스냅샷 저장: charts/YYYY-MM-DD/melon.json
async function saveChart(chartId, songs) {
  const key  = `charts/${today()}/${chartId}.json`;
  const body = JSON.stringify({ savedAt: new Date().toISOString(), songs }, null, 2);
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: 'application/json',
  }));
  console.log(`[R2] saved ${key}`);
}

// 유튜브 매칭 정보 저장/업데이트: yt-matches/YYYY-MM-DD.json
// 하루치를 한 파일에 모아서 저장 (key: "title|artist")
async function saveYtMatch(title, artist, info) {
  const key = `yt-matches/${today()}.json`;
  let existing = {};

  // 기존 파일 읽기
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = await streamToString(res.Body);
    existing = JSON.parse(text);
  } catch (e) {
    if (e.name !== 'NoSuchKey') console.warn('[R2] getYtMatch warn:', e.message);
  }

  existing[`${title}|${artist}`] = { ...info, savedAt: new Date().toISOString() };

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        JSON.stringify(existing, null, 2),
    ContentType: 'application/json',
  }));
}

// 특정 날짜 차트 조회
async function getChart(date, chartId) {
  const key = `charts/${date}/${chartId}.json`;
  try {
    const res  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = await streamToString(res.Body);
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'NoSuchKey') return null;
    throw e;
  }
}

// 저장된 날짜 목록 조회 (차트 기준)
async function listDates(chartId) {
  const res = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: `charts/`,
    Delimiter: '/',
  }));
  // CommonPrefixes: [ { Prefix: 'charts/2026-05-09/' }, ... ]
  const dates = (res.CommonPrefixes || [])
    .map(p => p.Prefix.replace('charts/', '').replace('/', ''))
    .sort((a, b) => b.localeCompare(a)); // 최신순

  // chartId 파일이 실제로 존재하는 날짜만 필터
  const checked = await Promise.all(dates.map(async date => {
    try {
      await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `charts/${date}/${chartId}.json` }));
      return date;
    } catch { return null; }
  }));
  return checked.filter(Boolean);
}

// 특정 날짜 YT 매칭 조회
async function getYtMatches(date) {
  const key = `yt-matches/${date}.json`;
  try {
    const res  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = await streamToString(res.Body);
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'NoSuchKey') return {};
    throw e;
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

module.exports = { saveChart, saveYtMatch, getChart, listDates, getYtMatches, today };
