# 🎵 MelTube

![MelTube 스크린샷](screenshot.png)

벅스 주간 TOP 100 차트를 보고, 곡을 검색하고, 유튜브 오디오로 바로 재생하는 로컬 웹앱입니다.

## 기능

- **주간 차트** — 벅스 뮤직 주간 TOP 100 크롤링 (5분 캐시)
- **검색** — 벅스 뮤직 곡 검색 (앨범아트 포함)
- **유튜브 재생** — 곡 클릭 시 유튜브에서 오디오만 스트리밍
- **재생 모드** — 전체 반복 / 랜덤 재생 / 한 곡 반복 토글
- **좋아요** — 좋아요한 곡 모아보기, 전체 재생
- **가사** — 슬라이드업 패널 (멜론에서 자동 매칭)
- **MP3 다운로드** — 앨범아트 + 가사(USLT 프레임) + 태그 포함
- **백그라운드 YT 매칭** — 차트 로드 시 100곡 자동 유튜브 매칭 (5곡 병렬)
- **R2 캐시 프리로드** — 서버 시작 시 오늘 매칭 데이터 자동 로드로 재생 속도 향상
- **다크 / 라이트 모드** — 설정 기억
- **볼륨 기억** — 새로고침해도 유지

## 기술 스택

| 역할 | 사용 기술 |
|------|-----------|
| 차트 / 검색 데이터 | 벅스 뮤직 HTML 크롤링 (cheerio) |
| 가사 | 멜론 검색 자동 매칭 |
| 오디오 검색 / 추출 | yt-dlp |
| 오디오 스트리밍 | Node.js → 브라우저 프록시 |
| MP3 변환 | ffmpeg + node-id3 (앨범아트 · USLT 가사 태그) |
| YT 매칭 캐시 | Cloudflare R2 (S3 호환) |
| 프론트엔드 | 바닐라 HTML / CSS / JS |
| 백엔드 | Node.js + Express |

## 시작하기

### 요구사항

- Node.js 18+
- ffmpeg — [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) 또는 `winget install Gyan.FFmpeg`
- Cloudflare R2 계정 — YT 매칭 캐시 저장용 (없으면 서버 재시작마다 재검색)

### 설치

```bash
git clone https://github.com/JKH-ML/mel-tube.git
cd mel-tube
npm install
```

### 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 R2 정보 입력:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=your_bucket_name
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

### R2 세팅 방법

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket**
2. 버킷 이름 입력
3. R2 메인 페이지 우상단 → **Manage R2 API tokens** → **Create API token**
4. 권한: **Object Read & Write**, 대상 버킷 선택
5. 발급된 **Account ID / Access Key ID / Secret Access Key** 를 `.env`에 입력

### 실행

```bash
npm start
```

브라우저에서 http://localhost:3000 접속

종료는 터미널 창을 닫거나 `Ctrl+C`로 합니다.

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/chart` | 벅스 주간 TOP 100 차트 |
| GET | `/api/chart?bust=1` | 캐시 무시하고 새로 크롤링 |
| GET | `/api/bugs-search?q=` | 벅스 뮤직 곡 검색 |
| GET | `/api/stream?title=&artist=` | 오디오 스트리밍 프록시 |
| GET | `/api/download?title=&artist=&cover=` | MP3 다운로드 (앨범아트 · 가사 포함) |
| GET | `/api/lyrics?title=&artist=` | 가사 조회 (멜론 자동 매칭) |
| GET | `/api/info?title=&artist=` | 유튜브 영상 메타 정보 |
| GET | `/api/match-status` | 백그라운드 매칭 큐 상태 |

## R2 저장 구조

```
bucket
└── yt-matches/
    ├── 2026-05-09.json
    └── 2026-05-10.json
```

## 주의사항

- 크롤링 및 유튜브 오디오 스트리밍은 개인 학습 목적으로만 사용하세요
- `.env` 파일을 절대 공유하거나 git에 커밋하지 마세요 (`.gitignore`에 포함되어 있음)
