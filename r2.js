require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

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

// 유튜브 매칭 정보 저장/업데이트: yt-matches/YYYY-MM-DD.json
// 배치 저장 큐 — 동시 write 충돌 방지
let ytMatchQueue = {};
let ytMatchFlushTimer = null;

async function flushYtMatches() {
  ytMatchFlushTimer = null;
  const batch = ytMatchQueue;
  ytMatchQueue = {};

  const key = `yt-matches/${today()}.json`;
  let existing = {};
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    existing = JSON.parse(await streamToString(res.Body));
  } catch (e) {
    if (e.name !== 'NoSuchKey') console.warn('[R2] getYtMatch warn:', e.message);
  }

  Object.assign(existing, batch);

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        JSON.stringify(existing, null, 2),
    ContentType: 'application/json',
  }));
  console.log(`[R2] yt-matches ${Object.keys(batch).length}곡 저장`);
}

async function saveYtMatch(title, artist, info) {
  ytMatchQueue[`${title}|${artist}`] = { ...info, savedAt: new Date().toISOString() };
  if (!ytMatchFlushTimer) {
    ytMatchFlushTimer = setTimeout(flushYtMatches, 2000);
  }
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

module.exports = { saveYtMatch, getYtMatches, today };
