(() => {
  // ── State ──
  let currentData  = [];
  let filteredData = [];
  let currentIndex = -1;
  let currentSongKey = null; // "title|artist" — 탭/검색어 변경 후에도 현재 곡 식별
  let isPlaying    = false;
  // playMode: 'one' | 'all' | 'shuffle'
  let playMode     = localStorage.getItem('kc_playmode') || 'all';
  let shuffleQueue = [];

  const HEART_EMPTY  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  const HEART_FILLED = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

  const MODE_TITLES = { one: '한 곡 반복', all: '전체 반복', shuffle: '랜덤 재생' };
  // repeat-1, repeat, shuffle (lucide SVG)
  const PLAY_MODE_SVG = {
    one:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/></svg>`,
    all:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    shuffle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>`,
  };
  let activeTab    = 'chart'; // 'chart' | 'liked' | 'bugs'
  let bugsData     = [];

  // likedSongs: Map<"title|artist", { title, artist, cover, album }>
  let likedSongs = new Map(JSON.parse(localStorage.getItem('kc_liked2') || '[]'));

  // ── Audio ──
  const audio = new Audio();
  audio.preload = 'none';

  // ── Elements ──
  const chartList      = document.getElementById('chartList');
  const likedListEl    = document.getElementById('likedList');
  const chartUpdated   = document.getElementById('chartUpdated');
  const likedUpdated   = document.getElementById('likedUpdated');
  const searchBox      = document.getElementById('searchBox');
  const likedSearchBox = document.getElementById('likedSearchBox');
  const refreshBtn     = document.getElementById('refreshBtn');
  const playBtn        = document.getElementById('playBtn');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const playModeBtn    = document.getElementById('playModeBtn');
  const playerThumb    = document.getElementById('playerThumb');
  const playerTitle    = document.getElementById('playerTitle');
  const playerArtist   = document.getElementById('playerArtist');
  const playerYtInfo   = document.getElementById('playerYtInfo');
  const progressBar    = document.getElementById('progressBar');
  const progressFill   = document.getElementById('progressFill');
  const currentTime    = document.getElementById('currentTime');
  const totalTime      = document.getElementById('totalTime');
  const likeBtn        = document.getElementById('likeBtn');
  const loadingBar     = document.getElementById('loadingBar');
  const likedPlayAll   = document.getElementById('likedPlayAll');
  const likedClear     = document.getElementById('likedClear');
  const likedCount     = document.getElementById('likedCount');
  const volumeSlider   = document.getElementById('volumeSlider');
  const themeBtn       = document.getElementById('themeBtn');
  const tabChart          = document.getElementById('tabChart');
  const tabLiked          = document.getElementById('tabLiked');
  const tabBugs           = document.getElementById('tabBugs');
  const bugsSearchBox     = document.getElementById('bugsSearchBox');
  const bugsSearchBtn     = document.getElementById('bugsSearchBtn');
  const bugsList          = document.getElementById('bugsList');
  const bugsSearchUpdated = document.getElementById('bugsSearchUpdated');
  const downloadBtn    = document.getElementById('downloadBtn');
  const lyricsBtn      = document.getElementById('lyricsBtn');
  const lyricsPanel    = document.getElementById('lyricsPanel');
  const lyricsClose    = document.getElementById('lyricsClose');
  const lyricsBody     = document.getElementById('lyricsBody');
  const lyricsSongTitle = document.getElementById('lyricsSongTitle');

  let lyricsOpen = false;
  let lyricsSongId = null;

  // ── Theme ──
  const MOON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>`;
  const SUN  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

  function applyTheme(light) {
    document.documentElement.classList.toggle('light', light);
    themeBtn.innerHTML = light ? MOON : SUN;
    themeBtn.title = light ? '다크 모드로 전환' : '라이트 모드로 전환';
  }
  applyTheme(localStorage.getItem('kc_theme') === 'light');
  themeBtn.addEventListener('click', () => {
    const next = !document.documentElement.classList.contains('light');
    applyTheme(next);
    localStorage.setItem('kc_theme', next ? 'light' : 'dark');
  });

  // ── Volume ──
  const initVol = parseFloat(localStorage.getItem('kc_volume') ?? '70');
  volumeSlider.value = initVol;
  audio.volume = initVol / 100;
  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
    localStorage.setItem('kc_volume', volumeSlider.value);
  });

  // ── Audio events ──
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    progressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    currentTime.textContent  = formatTime(Math.floor(audio.currentTime));
  });
  audio.addEventListener('loadedmetadata', () => {
    totalTime.textContent = formatTime(Math.floor(audio.duration));
  });
  audio.addEventListener('ended', () => {
    isPlaying = false; playBtn.textContent = '▶';
    updateActiveItem();
    setTimeout(playNext, 800);
  });
  audio.addEventListener('waiting', () => loadingBar.classList.add('active'));
  audio.addEventListener('playing', () => loadingBar.classList.remove('active'));
  audio.addEventListener('canplay', () => loadingBar.classList.remove('active'));
  audio.addEventListener('error',   () => {
    loadingBar.classList.remove('active');
    playerYtInfo.textContent = '오디오 로드 실패';
  });

  progressBar.addEventListener('click', e => {
    if (!audio.duration) return;
    audio.currentTime = ((e.clientX - progressBar.getBoundingClientRect().left) / progressBar.offsetWidth) * audio.duration;
  });

  // ── Tab 전환 ──
  document.querySelectorAll('.main-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      tabChart.style.display = activeTab === 'chart' ? '' : 'none';
      tabLiked.style.display = activeTab === 'liked' ? '' : 'none';
      tabBugs.style.display  = activeTab === 'bugs'  ? '' : 'none';
      if (activeTab === 'chart') applyFilter();
      if (activeTab === 'liked') renderLikedTab();
      if (activeTab === 'bugs')  bugsSearchBox.focus();
    });
  });

  // ── Bugs tab buttons ──
  bugsSearchBtn.addEventListener('click', runBugsSearch);
  bugsSearchBox.addEventListener('keydown', e => { if (e.key === 'Enter') runBugsSearch(); });

  // ── Chart tab buttons ──
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    setTimeout(() => refreshBtn.classList.remove('spinning'), 700);
    loadChart(true);
  });
  searchBox.addEventListener('input', applyFilter);

  // ── Liked tab buttons ──
  likedSearchBox.addEventListener('input', renderLikedTab);
  likedPlayAll.addEventListener('click', playAllLiked);
  likedClear.addEventListener('click', () => {
    if (!confirm('좋아요 목록을 모두 삭제할까요?')) return;
    likedSongs.clear();
    saveLiked();
    renderLikedTab();
    renderCurrentList();
  });

  // ── Player buttons ──
  playBtn.addEventListener('click', togglePlay);
  prevBtn.addEventListener('click', playPrev);
  nextBtn.addEventListener('click', playNext);
  likeBtn.addEventListener('click', () => { if (currentIndex >= 0) toggleLike(currentIndex); });
  downloadBtn.addEventListener('click', () => {
    if (currentIndex < 0) return;
    const song = filteredData[currentIndex];
    const params = new URLSearchParams({ title: song.title, artist: song.artist });
    if (song.cover) params.set('cover', song.cover);
    const a = document.createElement('a');
    a.href = `/api/download?${params}`;
    a.download = `${song.artist} - ${song.title}.mp3`;
    const origHTML = downloadBtn.innerHTML;
    downloadBtn.classList.add('loading');
    fetch(a.href)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const tmp = document.createElement('a');
        tmp.href = url;
        tmp.download = a.download;
        tmp.click();
        URL.revokeObjectURL(url);
        downloadBtn.classList.remove('loading');
        downloadBtn.classList.add('done');
        downloadBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          downloadBtn.classList.remove('done');
          downloadBtn.innerHTML = origHTML;
        }, 1500);
      })
      .catch(() => {
        downloadBtn.classList.remove('loading');
        downloadBtn.innerHTML = origHTML;
      });
  });

  lyricsBtn.addEventListener('click', () => {
    if (currentIndex < 0) return;
    lyricsOpen ? closeLyrics() : openLyrics(filteredData[currentIndex]);
  });
  lyricsClose.addEventListener('click', closeLyrics);

  playModeBtn.addEventListener('click', () => {
    playMode = playMode === 'one' ? 'all' : playMode === 'all' ? 'shuffle' : 'one';
    localStorage.setItem('kc_playmode', playMode);
    applyPlayMode();
  });

  // ── Lyrics ──
  function openLyrics(song) {
    lyricsOpen = true;
    lyricsPanel.classList.add('open');
    lyricsBtn.classList.add('active');
    const cacheKey = `${song.title}|${song.artist}`;
    if (lyricsSongId === cacheKey && lyricsBody.textContent) return;
    lyricsSongTitle.textContent = `${song.title} — ${song.artist}`;
    lyricsBody.className = 'lyrics-body muted';
    lyricsBody.textContent = '가사 불러오는 중...';
    lyricsSongId = cacheKey;
    const url = `/api/lyrics?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (lyricsSongId !== cacheKey) return;
        if (data.lyric) {
          lyricsBody.className = 'lyrics-body';
          lyricsBody.innerHTML = data.lyric.replace(/<BR>/gi, '\n');
        } else {
          lyricsBody.className = 'lyrics-body muted';
          lyricsBody.textContent = '등록된 가사가 없습니다.';
        }
      })
      .catch(() => {
        if (lyricsSongId !== cacheKey) return;
        lyricsBody.className = 'lyrics-body muted';
        lyricsBody.textContent = '가사를 불러오지 못했습니다.';
      });
  }

  function closeLyrics() {
    lyricsOpen = false;
    lyricsPanel.classList.remove('open');
    lyricsBtn.classList.remove('active');
  }

  // ── Init ──
  updateLikedCount();
  applyPlayMode();
  loadChart();

  // ════════════════════════════════════
  // Chart tab
  // ════════════════════════════════════

  async function loadChart(bust = false) {
    chartUpdated.textContent = '불러오는 중...';
    showLoading(chartList);
    try {
      const res  = await fetch(bust ? '/api/chart?bust=1' : '/api/chart');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      currentData  = json.data;
      const now = new Date();
      chartUpdated.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 주간 기준`;
      applyFilter();
    } catch (e) {
      showError(chartList, e.message);
      chartUpdated.textContent = '오류';
    }
  }

  function applyFilter() {
    const q = searchBox.value.trim().toLowerCase();
    filteredData = currentData.filter(s =>
      !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
    renderChartList();
  }

  function renderChartList() {
    chartList.innerHTML = '';
    if (filteredData.length === 0) {
      chartList.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>검색 결과가 없습니다.</p></div>`;
      return;
    }
    filteredData.forEach((song, idx) => chartList.appendChild(createChartItem(song, idx)));
  }

  function createChartItem(song, idx) {
    const div = document.createElement('div');
    const isCurrentSong = currentIndex >= 0 && activeTab === 'chart' &&
      filteredData[currentIndex]?.title === song.title &&
      filteredData[currentIndex]?.artist === song.artist;
    div.className = 'chart-item' + (isCurrentSong ? ' active' : '');
    div.style.animationDelay = `${Math.min(idx * 25, 500)}ms`;

    const rankClass = song.rank === 1 ? 'gold' : song.rank === 2 ? 'silver' : song.rank === 3 ? 'bronze' : '';
    let changeHtml;
    if (song.isNew || song.prevRank == null) {
      changeHtml = `<div class="rank-change new-entry">NEW</div>`;
    } else {
      const diff = song.prevRank - song.rank;
      changeHtml = diff > 0 ? `<div class="rank-change up">▲${diff}</div>`
                 : diff < 0 ? `<div class="rank-change down">▼${Math.abs(diff)}</div>`
                 : `<div class="rank-change same">—</div>`;
    }

    const liked    = likedSongs.has(`${song.title}|${song.artist}`);
    const coverSrc = song.cover || `https://picsum.photos/seed/${song.rank}/80/80`;

    div.innerHTML = `
      <div class="rank-wrap">
        <div class="rank-num ${rankClass}">${song.rank}</div>
        ${changeHtml}
      </div>
      <div class="cover-wrap">
        <img class="cover-img" src="${coverSrc}" alt="${escHtml(song.title)}" loading="lazy"
             onerror="this.src='https://picsum.photos/seed/x${song.rank}/80/80'" />
        <div class="play-overlay">${isCurrentSong && isPlaying ? '⏸' : '▶'}</div>
      </div>
      <div class="song-info">
        <div class="song-title">${escHtml(song.title)}</div>
        <div class="song-artist">${escHtml(song.artist)}</div>
        <div class="song-meta"><span class="album-name">${escHtml(song.album)}</span></div>
      </div>
      <div class="song-actions">
        <button class="like-icon${liked ? ' liked' : ''}" title="좋아요">${liked ? HEART_FILLED : HEART_EMPTY}</button>
        ${song.songId ? `<a class="melon-link" href="https://music.bugs.co.kr/track/${song.songId}" target="_blank">🔗</a>` : ''}
      </div>`;

    div.querySelector('.like-icon').addEventListener('click', e => { e.stopPropagation(); toggleLike(idx); });
    div.addEventListener('click', e => {
      if (e.target.closest('.melon-link')) return;
      const isCurrentSong = currentSongKey === `${song.title}|${song.artist}`;
      isCurrentSong ? togglePlay() : playChartAt(idx);
    });
    return div;
  }

  // ════════════════════════════════════
  // Liked tab
  // ════════════════════════════════════

  function renderLikedTab() {
    const q     = likedSearchBox.value.trim().toLowerCase();
    const songs = [...likedSongs.values()].filter(s =>
      !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );

    likedUpdated.textContent = likedSongs.size > 0 ? `${likedSongs.size}곡` : '';

    likedListEl.innerHTML = '';
    if (songs.length === 0) {
      likedListEl.innerHTML = `<div class="empty"><div class="empty-icon">${likedSongs.size === 0 ? '🫶' : '🔍'}</div>
        <p>${likedSongs.size === 0 ? '아직 좋아요한 곡이 없습니다.<br>차트에서 하트를 눌러보세요.' : '검색 결과가 없습니다.'}</p></div>`;
      return;
    }

    songs.forEach((song, i) => {
      const key      = `${song.title}|${song.artist}`;
      const isActive = currentIndex >= 0 && filteredData[currentIndex] &&
        `${filteredData[currentIndex].title}|${filteredData[currentIndex].artist}` === key;

      const div = document.createElement('div');
      div.className = 'chart-item liked-tab-item' + (isActive ? ' active' : '');
      div.style.animationDelay = `${Math.min(i * 25, 400)}ms`;
      div.innerHTML = `
        <div class="rank-wrap"><div class="rank-num" style="font-size:1rem;color:var(--text-muted)">${i + 1}</div></div>
        <div class="cover-wrap">
          <img class="cover-img" src="${escHtml(song.cover || '')}"
               onerror="this.src='https://picsum.photos/seed/lk${i}/80/80'" alt="" />
          <div class="play-overlay">${isActive && isPlaying ? '⏸' : '▶'}</div>
        </div>
        <div class="song-info">
          <div class="song-title">${escHtml(song.title)}</div>
          <div class="song-artist">${escHtml(song.artist)}</div>
          <div class="song-meta"><span class="album-name">${escHtml(song.album || '')}</span></div>
        </div>
        <div class="song-actions">
          <button class="like-icon liked liked-remove" title="좋아요 취소">${HEART_FILLED}</button>
        </div>`;

      div.querySelector('.liked-remove').addEventListener('click', e => {
        e.stopPropagation();
        likedSongs.delete(key);
        saveLiked();
        renderLikedTab();
        renderChartList();
        renderBugsList();
        if (currentIndex >= 0 &&
            `${filteredData[currentIndex]?.title}|${filteredData[currentIndex]?.artist}` === key) {
          likeBtn.innerHTML = HEART_EMPTY;
          likeBtn.classList.remove('liked');
        }
      });

      div.addEventListener('click', () => {
        playLikedAt(songs, i);
      });

      likedListEl.appendChild(div);
    });
  }

  function playAllLiked() {
    const songs = [...likedSongs.values()];
    if (songs.length === 0) return;
    playLikedAt(songs, 0);
  }

  function playLikedAt(songs, startIdx) {
    filteredData = songs.map(s => ({ ...s, rank: 0, prevRank: 0, isNew: false }));
    if (playMode === 'shuffle') buildShuffleQueue();
    playChartAt(startIdx);
  }

  // ════════════════════════════════════
  // Shared play logic
  // ════════════════════════════════════

  function renderCurrentList() {
    if (activeTab === 'chart')     renderChartList();
    else if (activeTab === 'liked') renderLikedTab();
    else if (activeTab === 'bugs')  renderBugsList();
  }

  function updateActiveItem() {
    const list = activeTab === 'chart' ? chartList
               : activeTab === 'bugs'  ? bugsList
               : likedListEl;
    list.querySelectorAll('.chart-item').forEach(el => {
      const titleEl  = el.querySelector('.song-title');
      const artistEl = el.querySelector('.song-artist');
      if (!titleEl || !artistEl) return;
      const isCurrent = currentSongKey === `${titleEl.textContent}|${artistEl.textContent}`;
      el.classList.toggle('active', isCurrent);
      const overlay = el.querySelector('.play-overlay');
      if (overlay) overlay.textContent = isCurrent && isPlaying ? '⏸' : '▶';
    });
  }

  async function playChartAt(idx) {
    if (idx < 0 || idx >= filteredData.length) return;
    audio.pause();
    currentIndex = idx;
    currentSongKey = `${filteredData[idx].title}|${filteredData[idx].artist}`;
    if (playMode === 'shuffle') buildShuffleQueue();
    isPlaying    = true;

    const song = filteredData[idx];
    playerThumb.src = song.cover || '';
    playerThumb.alt          = song.title;
    playerTitle.textContent  = song.title;
    playerArtist.textContent = song.artist;
    playerYtInfo.textContent = '';
    playBtn.textContent      = '⏸';
    currentTime.textContent  = '0:00';
    totalTime.textContent    = '--:--';
    progressFill.style.width = '0%';
    const isLiked = likedSongs.has(`${song.title}|${song.artist}`);
    likeBtn.innerHTML = isLiked ? HEART_FILLED : HEART_EMPTY;
    likeBtn.classList.toggle('liked', isLiked);
    loadingBar.classList.add('active');
    updateActiveItem();

    if (lyricsOpen) openLyrics(song);

    const params = new URLSearchParams({ title: song.title, artist: song.artist });
    fetch(`/api/info?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(info => { if (info && currentSongKey === `${filteredData[idx]?.title}|${filteredData[idx]?.artist}` && info.ytTitle) playerYtInfo.textContent = `▶ ${info.ytTitle}`; })
      .catch(() => {});

    try {
      audio.src = `/api/stream?${params}`;
      audio.load();
      await audio.play();
    } catch {
      loadingBar.classList.remove('active');
      isPlaying = false; playBtn.textContent = '▶';
      playerYtInfo.textContent = '재생 실패';
      renderCurrentList();
    }
  }


  function applyPlayMode() {
    playModeBtn.classList.toggle('active', true);
    playModeBtn.dataset.mode = playMode;
    playModeBtn.title = MODE_TITLES[playMode];
    playModeBtn.innerHTML = PLAY_MODE_SVG[playMode];
    if (playMode === 'shuffle') buildShuffleQueue();
  }

  function buildShuffleQueue() {
    const indices = filteredData.map((_, i) => i).filter(i => i !== currentIndex);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    shuffleQueue = indices;
  }

  function playNext() {
    if (!filteredData.length) return;
    if (playMode === 'one') {
      audio.currentTime = 0; audio.play().catch(() => {}); return;
    }
    if (playMode === 'shuffle') {
      if (!shuffleQueue.length) buildShuffleQueue();
      playChartAt(shuffleQueue.shift());
    } else {
      playChartAt((currentIndex + 1) % filteredData.length);
    }
  }

  function playPrev() {
    if (!filteredData.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (playMode === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    playChartAt(playMode === 'shuffle'
      ? Math.floor(Math.random() * filteredData.length)
      : (currentIndex - 1 + filteredData.length) % filteredData.length);
  }

  function togglePlay() {
    if (currentIndex < 0) { if (filteredData.length) playChartAt(0); return; }
    if (isPlaying) {
      audio.pause(); isPlaying = false; playBtn.textContent = '▶';
    } else {
      audio.play().catch(() => {}); isPlaying = true; playBtn.textContent = '⏸';
    }
    updateActiveItem();
  }

  // ════════════════════════════════════
  // Liked helpers
  // ════════════════════════════════════

  function saveLiked() {
    localStorage.setItem('kc_liked2', JSON.stringify([...likedSongs]));
    updateLikedCount();
  }

  function updateLikedCount() {
    const n = likedSongs.size;
    likedCount.textContent = n;
    likedCount.classList.toggle('visible', n > 0);
  }

  function toggleLike(idx) {
    const song = filteredData[idx];
    const key  = `${song.title}|${song.artist}`;
    if (likedSongs.has(key)) likedSongs.delete(key);
    else likedSongs.set(key, { title: song.title, artist: song.artist, cover: song.cover, album: song.album, songId: song.songId });
    saveLiked();
    const liked = likedSongs.has(key);
    if (idx === currentIndex) {
      likeBtn.innerHTML = liked ? HEART_FILLED : HEART_EMPTY;
      likeBtn.classList.toggle('liked', liked);
    }
    // 해당 아이템의 하트만 교체 — 전체 리스트 재렌더 없이
    const items = (activeTab === 'chart' ? chartList : activeTab === 'bugs' ? bugsList : likedListEl).querySelectorAll('.chart-item');
    const item = items[idx];
    if (item) {
      const icon = item.querySelector('.like-icon');
      if (icon) {
        icon.innerHTML = liked ? HEART_FILLED : HEART_EMPTY;
        icon.classList.toggle('liked', liked);
      }
    }
    updateLikedCount();
  }

  // ════════════════════════════════════
  // Bugs Search tab
  // ════════════════════════════════════

  async function runBugsSearch() {
    const q = bugsSearchBox.value.trim();
    if (!q) return;
    showLoading(bugsList);
    bugsSearchUpdated.textContent = `"${q}" 검색 중...`;
    try {
      const res  = await fetch(`/api/bugs-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      bugsData = json.data || [];
      bugsSearchUpdated.textContent = bugsData.length > 0 ? `${bugsData.length}곡 검색됨` : '결과 없음';
      filteredData = bugsData;
      renderBugsList();
    } catch (e) {
      showError(bugsList, e.message);
      bugsSearchUpdated.textContent = '오류';
    }
  }

  function renderBugsList() {
    bugsList.innerHTML = '';
    if (bugsData.length === 0) {
      bugsList.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>검색어를 입력하세요.</p></div>`;
      return;
    }
    bugsData.forEach((song, idx) => bugsList.appendChild(createBugsItem(song, idx)));
  }

  function createBugsItem(song, idx) {
    const div = document.createElement('div');
    const isCurrentSong = currentIndex >= 0 && activeTab === 'bugs' &&
      filteredData[currentIndex]?.title === song.title &&
      filteredData[currentIndex]?.artist === song.artist;
    div.className = 'chart-item' + (isCurrentSong ? ' active' : '');
    div.style.animationDelay = `${Math.min(idx * 20, 400)}ms`;

    const liked    = likedSongs.has(`${song.title}|${song.artist}`);
    const coverSrc = song.cover || `https://picsum.photos/seed/b${idx}/80/80`;

    div.innerHTML = `
      <div class="rank-wrap">
        <div class="rank-num" style="font-size:0.9rem;color:var(--text-muted)">${idx + 1}</div>
      </div>
      <div class="cover-wrap">
        <img class="cover-img" src="${coverSrc}" alt="${escHtml(song.title)}" loading="lazy"
             onerror="this.src='https://picsum.photos/seed/bx${idx}/80/80'" />
        <div class="play-overlay">${isCurrentSong && isPlaying ? '⏸' : '▶'}</div>
      </div>
      <div class="song-info">
        <div class="song-title">${escHtml(song.title)}</div>
        <div class="song-artist">${escHtml(song.artist)}</div>
        <div class="song-meta"><span class="album-name">${escHtml(song.album)}</span></div>
      </div>
      <div class="song-actions">
        <button class="like-icon${liked ? ' liked' : ''}" title="좋아요">${liked ? HEART_FILLED : HEART_EMPTY}</button>
        ${song.songId ? `<a class="melon-link" href="https://music.bugs.co.kr/track/${song.songId}" target="_blank">🔗</a>` : ''}
      </div>`;

    div.querySelector('.like-icon').addEventListener('click', e => { e.stopPropagation(); filteredData = bugsData; toggleLike(idx); });
    div.addEventListener('click', e => {
      if (e.target.closest('.melon-link')) return;
      filteredData = bugsData;
      const isCurrent = currentSongKey === `${song.title}|${song.artist}`;
      isCurrent ? togglePlay() : playChartAt(idx);
    });
    return div;
  }

  // ── Helpers ──
  function showLoading(el) {
    el.innerHTML = `<div class="loading"><div class="spinner"></div><p>불러오는 중...</p></div>`;
  }

  function showError(el, msg) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div>
      <p>데이터를 가져오지 못했습니다.</p>
      <p class="error-msg">${escHtml(msg)}</p>
      <p style="margin-top:8px;font-size:0.8rem;color:#7a7a9a">서버 실행: <code>node server.js</code></p></div>`;
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
