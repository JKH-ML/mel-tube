# 🎵 K-Chart

![K-Chart 스크린샷](screenshot.png)

멜론 TOP 100 실시간 차트를 보고, 유튜브 오디오로 바로 재생하는 로컬 웹앱입니다.

## 기능

- **실시간 차트** — 멜론 TOP 100 크롤링 (5분 캐시)
- **유튜브 재생** — 곡 클릭 시 유튜브에서 오디오만 스트리밍
- **재생 모드** — 1곡 반복 / 전체 재생 / 전체 랜덤 토글
- **좋아요** — 좋아요한 곡 모아보기, 전체 재생
- **날짜별 히스토리** — 차트 스냅샷을 Cloudflare R2에 날짜별 저장
- **백그라운드 YT 매칭** — 차트 로드 시 상위 20곡 자동 유튜브 매칭 (3초 간격)
- **다크 / 라이트 모드** — 설정 기억
- **볼륨 기억** — 새로고침해도 유지

## 기술 스택

| 역할 | 사용 기술 |
|------|-----------|
| 차트 데이터 | 멜론 HTML 크롤링 (cheerio) |
| 오디오 검색/추출 | yt-dlp |
| 오디오 스트리밍 | Node.js → 브라우저 프록시 |
| 히스토리 저장 | Cloudflare R2 (S3 호환) |
| 프론트엔드 | 바닐라 HTML / CSS / JS |
| 백엔드 | Node.js + Express |

## 시작하기

### 요구사항

- Node.js 18+
- (선택) Cloudflare R2 계정 — 없으면 히스토리 저장 기능만 비활성화

### 설치

```bash
git clone <repo>
cd kpop-chart
npm install
```

### 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 본인 R2 정보 입력:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=kpop-chart
R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
```

> R2 없이 실행해도 차트 조회와 재생은 정상 동작합니다. 히스토리 저장만 스킵됩니다.

### R2 세팅 방법

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket**
2. 버킷 이름 입력 (예: `kpop-chart`)
3. R2 메인 페이지 우상단 → **Manage R2 API tokens** → **Create API token**
4. 권한: **Object Read & Write**, 대상 버킷 선택
5. 발급된 **Account ID / Access Key ID / Secret Access Key** 를 `.env`에 입력

### 실행

```bash
node server.js
```

브라우저에서 http://localhost:3000 접속

첫 실행 시 `yt-dlp.exe`를 자동으로 다운로드합니다 (약 30초 소요).

## R2 저장 구조

```
kpop-chart (버킷)
├── charts/
│   ├── 2026-05-09/
│   │   └── melon.json      # 100곡 전체 스냅샷
│   └── 2026-05-10/
│       └── melon.json
└── yt-matches/
    ├── 2026-05-09.json     # 그날 매칭된 유튜브 정보
    └── 2026-05-10.json
```

## 주의사항

- 멜론 크롤링은 개인 학습 목적으로만 사용하세요
- yt-dlp를 통한 유튜브 오디오 스트리밍은 개인 감상 목적으로만 사용하세요
- `.env` 파일을 절대 공유하거나 git에 커밋하지 마세요 (`.gitignore`에 포함되어 있음)
