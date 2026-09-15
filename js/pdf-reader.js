(function () {
  // 페이지 이미지가 들어있는 폴더와 장수. 파일명은 page-001.jpg ~ page-0NN.jpg 형식이어야 한다.
  // 다른 호로 교체할 때는 PAGE_FOLDER/PAGE_COUNT와 아래 CHAPTERS만 새 자료에 맞게 바꾸면 된다.
  var PAGE_FOLDER = 'pages';
  var PAGE_COUNT = 96;

  function pageUrl(pageNumber) {
    var padded = ('000' + pageNumber).slice(-3);
    return PAGE_FOLDER + '/page-' + padded + '.jpg';
  }

  // 목차 탭에 표시할 챕터 목록. 다른 자료로 교체할 때는 이 배열도 그 자료의 목차에 맞게 수정하세요.
  // page: 그 챕터가 시작하는 실제 이미지 페이지 번호(1부터 시작). color: 탭 배경(파스텔 톤), textColor: 탭 글자색.
  var CHAPTERS = [
    { title: "'영점소비' 시대", page: 10, color: '#cdd3f7', textColor: '#3d4a9e' },
    { title: '1. 마이-파이', page: 31, color: '#c9ead9', textColor: '#2f8a5b' },
    { title: '2. 언클리셰', page: 45, color: '#cdeaf3', textColor: '#1f7c9c' },
    { title: '3. BPM', page: 59, color: '#f6d3e2', textColor: '#b1447a' },
    { title: '4. 스탯 맥싱', page: 71, color: '#ddd6f7', textColor: '#6249c7' },
    { title: '영점 조준의 시대', page: 79, color: '#cdd3f7', textColor: '#3d4a9e' }
  ];

  // 모바일 브라우저(특히 카카오톡 등 인앱 브라우저)는 100dvh를 지원 안 하거나 주소창이
  // 나타날 때 실제 화면 높이가 바뀌는데, CSS만으로는 못 잡는 경우가 있어 JS로 실제
  // window.innerHeight를 --vh 변수로 계속 갱신해서 css의 calc(var(--vh)*100)이 쓰게 한다.
  (function setupViewportHeightVar() {
    function update() {
      document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update);
    }
  })();

  var stage = document.getElementById('pr-stage');
  var bookEl = document.getElementById('pr-book');
  var loadingEl = document.getElementById('pr-loading');
  var hintEl = document.getElementById('pr-hint');
  var prevBtn = document.getElementById('pr-prev');
  var nextBtn = document.getElementById('pr-next');
  var currentEl = document.querySelector('.pr-indicator__current');
  var totalEl = document.querySelector('.pr-indicator__total');
  var indexRail = document.getElementById('pr-index-rail');
  var bookCropEl = document.getElementById('pr-book-crop');
  var pageJumpBtn = document.getElementById('pr-page-jump-btn');
  var pageJumpInput = document.getElementById('pr-page-jump-input');

  // 테마 전환 (밝은 모드 / 다크 모드 / 일러스트 배경). 책 페이지 이미지 자체는 그대로 두고
  // 주변 화면 색상만 바뀐다. 선택한 테마는 localStorage에 저장해서 다음 방문에도 유지한다.
  (function initThemeSwitcher() {
    var THEME_KEY = 'pr-theme';
    var switcherEl = document.getElementById('pr-theme-switcher');
    if (!switcherEl) return;
    var buttons = switcherEl.querySelectorAll('.pr-theme-btn');

    function applyTheme(theme) {
      // body뿐 아니라 html에도 걸어둬야, html의 배경색(--color-bg)도 테마에 맞게
      // 바뀌어서 모바일에서 화면 위/아래에 이전 테마 색(주로 흰색) 줄이 안 비친다.
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
      buttons.forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.theme === theme);
      });
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 저장 불가 시 무시 */ }
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.dataset.theme);
      });
    });

    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* 무시 */ }
    applyTheme(saved || 'light');
  })();

  if (!stage || !bookEl || typeof St === 'undefined') {
    showError('이북을 불러오지 못했어요. 새로고침해 주세요.');
    return;
  }

  var pageFlip = null;

  function showError(message) {
    if (loadingEl) loadingEl.classList.add('is-hidden');
    var err = document.createElement('div');
    err.className = 'pr-error';
    err.textContent = message;
    stage.appendChild(err);
  }

  function sizeBookToStage(aspect) {
    var stageRect = stage.getBoundingClientRect();
    // 목차가 책 오른쪽 가장자리에 붙어서 따라다니므로, 책 너비를 계산할 때
    // 그 폭만큼 미리 비워둬서 화면 밖으로 넘치지 않게 한다.
    var railWidth = (indexRail && indexRail.offsetWidth) || 0;
    var availW = Math.max(200, stageRect.width - 32 - railWidth);
    var availH = Math.max(200, stageRect.height - 32);

    // 두 페이지가 나란히 펼쳐지는 스프레드 기준으로 한 페이지 폭을 계산
    var pageW = Math.min(availW / 2, availH * aspect);
    var pageH = pageW / aspect;

    // 계산된 페이지 폭(pageW)이 아니라 뷰포트 자체의 폭으로 모바일/PC를 가른다.
    // pageW는 화면비·스크롤바 폭 등 브라우저마다 미묘하게 다른 값들이 섞여 계산되기
    // 때문에, 경계값 근처에서는 크롬/엣지 등 브라우저에 따라 한 페이지 모드와
    // 두 페이지 모드가 다르게 나오는 문제가 있었다. 뷰포트 폭(모바일 CSS 분기와
    // 동일한 640px 기준)으로만 판단해야 PC에서는 항상 두 페이지로 통일된다.
    if (stageRect.width < 640) {
      // 화면이 좁으면 한 페이지만 보이는 모드에 맞춰 폭을 계산
      pageW = Math.min(availW, availH * aspect);
      pageH = pageW / aspect;
    }

    var width = Math.round(pageW);
    var height = Math.round(pageH);
    var isPortrait = stageRect.width < 640;

    return {
      width: width,
      height: height,
      // stretch 모드가 화면보다 커지지 않도록 상한을 실제 계산값으로 고정.
      // min은 max를 절대 넘으면 안 되므로(가로형처럼 height가 작은 경우 고정 하한을 쓰면
      // min > max가 되어 라이브러리가 박스를 이미지 비율과 다르게 키워 흰 여백이 생긴다)
      // 비율 기반으로만 계산한다. 한 페이지 모드에서는 min을 max와 같게 둔다 —
      // 라이브러리가 자체적으로 한 페이지/스프레드 여부를 판단할 때 min에 여유를
      // 주면(예: 0.6배) 그 여유 폭을 스프레드가 들어갈 공간으로 오판해 세로로 긴
      // 모바일 화면에서도 두 페이지짜리 스프레드로 렌더링해버리는 경우가 있었다.
      minWidth: isPortrait ? width : Math.round(width * 0.6),
      maxWidth: width,
      minHeight: isPortrait ? height : Math.round(height * 0.6),
      maxHeight: height
    };
  }

  // St.PageFlip은 캔버스 해상도를 CSS 픽셀 크기 그대로(1:1) 설정해서, 레티나/고해상도
  // 화면에서는 실제 화면 해상도보다 낮게 그려진 뒤 확대되어 텍스트가 흐려 보인다.
  // 캔버스의 실제 픽셀 수를 devicePixelRatio만큼 늘리고 그만큼 컨텍스트를 스케일해서
  // 라이브러리가 같은 좌표로 그리더라도 고해상도로 렌더링되게 만든다.
  function applyRetinaCanvas(containerEl) {
    if (!containerEl) return;
    var canvas = containerEl.querySelector('canvas.stf__canvas');
    if (!canvas) return;
    // PC의 OS 디스플레이 배율이 125%/150% 같은 정수가 아닌 값이면 devicePixelRatio도
    // 소수(예: 1.25)가 되는데, 그 값 그대로만 맞추면 배율 자체가 낮아서 약간 뭉개져
    // 보인다. 원본 페이지 이미지가 1725px로 충분히 고해상도라서, dpr이 낮거나 1이어도
    // 최소 3배로 그려 원본 해상도에 최대한 가깝게 만든다(핀치 줌 여유도 더 생긴다).
    var dpr = Math.max(3, window.devicePixelRatio || 1);
    var cssWidth = canvas.clientWidth;
    var cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // width/height를 다시 설정하면 캔버스 컨텍스트 상태가 초기화되는데, 브라우저
    // 기본 이미지 스무딩 품질이 'low'라서 원본 이미지를 줄여 그릴 때 필요 이상으로
    // 뭉개져 보인다. 'high'로 올려서 축소 시에도 선명하게 유지한다.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  // 앞표지(0페이지)·뒤표지(마지막 페이지)는 스프레드가 아니라 한 페이지만 있으므로,
  // 책 전체 폭(2페이지 스프레드 기준) 중 그 페이지가 있는 절반만 보이게 잘라내고
  // 나머지 빈 절반은 숨긴다. 책 자체 크기는 그대로 두고 보이는 영역만 좁히는 방식이라
  // 페이지 넘김 애니메이션이나 폭 계산에는 영향을 주지 않는다.
  // 모바일처럼 한 페이지씩만 보이는 portrait 모드에서는 애초에 빈 절반이 없고 페이지
  // 내용이 컨테이너 전체를 채우므로, landscape(2페이지 스프레드) 모드에서만 크롭한다.
  function applyCoverCrop(pageIndex, totalPages) {
    if (!bookCropEl || !bookEl) return;
    var fullWidth = parseFloat(bookEl.style.width) || bookEl.offsetWidth;
    if (!fullWidth) return;
    var isLandscape = pageFlip && pageFlip.getOrientation() === 'landscape';
    var isFront = pageIndex === 0;
    var isBack = pageIndex === totalPages - 1;
    var isCoverSolo = isLandscape && (isFront || isBack);

    if (isCoverSolo) {
      var half = Math.round(fullWidth / 2);
      bookCropEl.style.width = half + 'px';
      bookEl.style.marginLeft = isFront ? -half + 'px' : '0px';
    } else {
      bookCropEl.style.width = fullWidth + 'px';
      bookEl.style.marginLeft = '0px';
    }
    positionIndexRail();
  }

  // 목차 탭을 책의 실제 오른쪽 가장자리에 붙여서 위치시킨다. 화면(stage) 기준
  // 절대 좌표가 아니라 책(book-crop)의 현재 위치를 매번 다시 측정해서 따라가게
  // 하므로, 책이 화면 중앙에서 벗어나 있거나 확대/축소·앞뒤 표지 크롭으로 크기가
  // 바뀌어도 항상 책 옆에 붙어 있다. 여유 공간이 부족해 화면 밖으로 살짝 넘치는
  // 한이 있더라도(어차피 .pr-stage가 overflow:hidden이라 잘려서 안 보일 뿐),
  // 책 위에 겹쳐 보이는 것보다는 안전하므로 책 오른쪽 바깥으로만 붙이고 안쪽으로
  // 당겨서 겹치게 하지 않는다.
  function positionIndexRail() {
    if (!indexRail || !bookCropEl || !stage) return;
    var stageRect = stage.getBoundingClientRect();
    var cropRect = bookCropEl.getBoundingClientRect();
    var gap = 4;
    var left = Math.max(8, cropRect.right - stageRect.left + gap);
    indexRail.style.left = left + 'px';
  }

  // book-crop의 width는 CSS transition(0.2s)으로 부드럽게 바뀌는데, applyCoverCrop()
  // 직후 positionIndexRail()을 부르면 트랜지션이 시작되기 전(바뀌기 전 폭) 기준으로
  // 위치를 잡아버려서, 책이 새 폭으로 애니메이션되는 동안 탭이 제자리에 멈춰 있다가
  // 책 내용과 겹쳐 보이는 문제가 있었다. 트랜지션이 끝나는 시점에 한 번 더 다시
  // 위치를 잡아줘서 최종 폭 기준으로 확실히 맞춘다.
  if (bookCropEl) {
    bookCropEl.addEventListener('transitionend', function (event) {
      if (event.propertyName === 'width') positionIndexRail();
    });
  }

  // --- 확대/축소 ---
  var zoomLevel = 1;
  var ZOOM_MIN = 1;
  var ZOOM_MAX = 2;
  var ZOOM_STEP = 0.25;
  var zoomInBtn = document.getElementById('pr-zoom-in');
  var zoomOutBtn = document.getElementById('pr-zoom-out');
  var zoomLevelEl = document.getElementById('pr-zoom-level');

  function applyZoom() {
    if (bookCropEl) bookCropEl.style.transform = zoomLevel === 1 ? '' : 'scale(' + zoomLevel + ')';
    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%';
    // 확대되면 책이 화면보다 커질 수 있어서, 그 안에서 스크롤로 나머지를 볼 수 있게 한다.
    if (stage) stage.classList.toggle('is-zoomed', zoomLevel > 1);
    positionIndexRail();
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', function () {
      zoomLevel = Math.min(ZOOM_MAX, Math.round((zoomLevel + ZOOM_STEP) * 100) / 100);
      applyZoom();
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', function () {
      zoomLevel = Math.max(ZOOM_MIN, Math.round((zoomLevel - ZOOM_STEP) * 100) / 100);
      applyZoom();
    });
  }

  // --- 책갈피 (책에 직접 꽂힌 리본처럼 표시 + 좌상단 패널에서 목록으로 모아보기) ---
  var BOOKMARK_KEY = 'pr-bookmarks';
  var bookmarkBtn = document.getElementById('pr-bookmark-btn');
  var bookmarkRibbon = document.getElementById('pr-bookmark-ribbon');
  var bookmarkPanel = document.getElementById('pr-bookmark-panel');
  var bookmarkToggleBtn = document.getElementById('pr-bookmark-toggle');
  var bookmarkListEl = document.getElementById('pr-bookmark-list');
  var bookmarkEmptyEl = document.getElementById('pr-bookmark-empty');
  var bookmarks = [];
  try { bookmarks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]'); } catch (e) { bookmarks = []; }

  function saveBookmarks() {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks)); } catch (e) { /* 저장 불가 시 무시 */ }
  }

  function updateBookmarkUI(pageIndex) {
    var marked = bookmarks.indexOf(pageIndex) !== -1;
    if (bookmarkBtn) bookmarkBtn.classList.toggle('is-active', marked);
    if (bookmarkRibbon) bookmarkRibbon.hidden = !marked;
    if (bookmarkToggleBtn) {
      bookmarkToggleBtn.textContent = marked ? '🔖 이 페이지 책갈피 삭제' : '🔖 이 페이지 책갈피 추가';
      bookmarkToggleBtn.classList.toggle('is-active', marked);
    }
  }

  // 책갈피한 페이지들을 좌상단 책갈피 패널 안에 목록으로 모아 보여준다. 목차 탭
  // 자리(화면 오른쪽 바깥쪽)에 같이 섞어두면 지저분해 보인다는 피드백이 있어,
  // 패널을 열었을 때만 따로 보이게 분리했다.
  function renderBookmarkList() {
    if (!bookmarkListEl) return;
    var old = bookmarkListEl.querySelectorAll('.pr-panel-item');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

    var sorted = bookmarks.slice().sort(function (a, b) { return a - b; });
    if (bookmarkEmptyEl) bookmarkEmptyEl.hidden = sorted.length > 0;

    sorted.forEach(function (pageIndex) {
      var item = document.createElement('div');
      item.className = 'pr-panel-item';

      var jumpBtn = document.createElement('button');
      jumpBtn.type = 'button';
      jumpBtn.className = 'pr-panel-item__jump';
      jumpBtn.innerHTML = '<span class="pr-panel-item__page">' + (pageIndex + 1) + '쪽</span>';
      jumpBtn.setAttribute('aria-label', (pageIndex + 1) + '쪽 책갈피로 이동');
      jumpBtn.addEventListener('click', function () {
        if (pageFlip) pageFlip.turnToPage(pageIndex);
        hideHintOnce();
        closeBookmarkPanel();
      });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'pr-panel-item__delete';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('aria-label', (pageIndex + 1) + '쪽 책갈피 삭제');
      deleteBtn.addEventListener('click', function () {
        var pos = bookmarks.indexOf(pageIndex);
        if (pos !== -1) bookmarks.splice(pos, 1);
        saveBookmarks();
        if (pageFlip && pageFlip.getCurrentPageIndex() === pageIndex) updateBookmarkUI(pageIndex);
        renderBookmarkList();
      });

      item.appendChild(jumpBtn);
      item.appendChild(deleteBtn);
      bookmarkListEl.appendChild(item);
    });
  }

  function openBookmarkPanel() {
    if (!bookmarkPanel) return;
    if (memoPanel && !memoPanel.hidden) closeMemoPanel();
    renderBookmarkList();
    bookmarkPanel.hidden = false;
  }

  function closeBookmarkPanel() {
    if (bookmarkPanel) bookmarkPanel.hidden = true;
  }

  function toggleBookmarkPanel() {
    if (!bookmarkPanel) return;
    if (bookmarkPanel.hidden) openBookmarkPanel(); else closeBookmarkPanel();
  }

  if (bookmarkBtn) bookmarkBtn.addEventListener('click', toggleBookmarkPanel);

  if (bookmarkToggleBtn) {
    bookmarkToggleBtn.addEventListener('click', function () {
      if (!pageFlip) return;
      var pageIndex = pageFlip.getCurrentPageIndex();
      var pos = bookmarks.indexOf(pageIndex);
      if (pos === -1) bookmarks.push(pageIndex); else bookmarks.splice(pos, 1);
      saveBookmarks();
      updateBookmarkUI(pageIndex);
      renderBookmarkList();
    });
  }

  // --- 메모 (좌상단 패널에서 현재 페이지 작성 + 전체 목록 모아보기) ---
  var MEMO_KEY = 'pr-memos';
  var memoBtn = document.getElementById('pr-memo-btn');
  var memoPanel = document.getElementById('pr-memo-panel');
  var memoTextarea = document.getElementById('pr-memo-textarea');
  var memoCloseBtn = document.getElementById('pr-memo-close');
  var memoListHeadEl = document.getElementById('pr-memo-listhead');
  var memoListEl = document.getElementById('pr-memo-list');
  var memoEmptyEl = document.getElementById('pr-memo-empty');
  var memoOpenPageIndex = null;
  var memos = {};
  try { memos = JSON.parse(localStorage.getItem(MEMO_KEY) || '{}'); } catch (e) { memos = {}; }

  function saveMemos() {
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(memos)); } catch (e) { /* 저장 불가 시 무시 */ }
  }

  function updateMemoUI(pageIndex) {
    var hasMemo = !!(memos[pageIndex] && String(memos[pageIndex]).trim());
    if (memoBtn) memoBtn.classList.toggle('is-active', hasMemo);
  }

  // 메모 남긴 페이지들을 페이지 번호 순으로 목록화해서, 클릭하면 그 페이지로
  // 이동하면서 바로 그 메모를 불러와 이어서 편집할 수 있게 한다.
  function renderMemoList() {
    if (!memoListEl) return;
    var old = memoListEl.querySelectorAll('.pr-panel-item');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

    var pageIndexes = Object.keys(memos)
      .filter(function (key) { return memos[key] && String(memos[key]).trim(); })
      .map(Number)
      .sort(function (a, b) { return a - b; });

    if (memoEmptyEl) memoEmptyEl.hidden = pageIndexes.length > 0;
    if (memoListHeadEl) memoListHeadEl.hidden = pageIndexes.length === 0;

    pageIndexes.forEach(function (pageIndex) {
      var item = document.createElement('div');
      item.className = 'pr-panel-item';

      var jumpBtn = document.createElement('button');
      jumpBtn.type = 'button';
      jumpBtn.className = 'pr-panel-item__jump';
      jumpBtn.innerHTML = '<span class="pr-panel-item__page">' + (pageIndex + 1) + '쪽</span>' +
        '<span class="pr-panel-item__snippet"></span>';
      jumpBtn.querySelector('.pr-panel-item__snippet').textContent = memos[pageIndex];
      jumpBtn.setAttribute('aria-label', (pageIndex + 1) + '쪽 메모로 이동');
      jumpBtn.addEventListener('click', function () {
        if (pageFlip) pageFlip.turnToPage(pageIndex);
        hideHintOnce();
        openMemoPanel();
      });

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'pr-panel-item__delete';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('aria-label', (pageIndex + 1) + '쪽 메모 삭제');
      deleteBtn.addEventListener('click', function () {
        delete memos[pageIndex];
        saveMemos();
        if (pageFlip && pageFlip.getCurrentPageIndex() === pageIndex) {
          updateMemoUI(pageIndex);
          if (memoOpenPageIndex === pageIndex && memoTextarea) memoTextarea.value = '';
        }
        renderMemoList();
      });

      item.appendChild(jumpBtn);
      item.appendChild(deleteBtn);
      memoListEl.appendChild(item);
    });
  }

  function openMemoPanel() {
    if (!pageFlip || !memoPanel || !memoTextarea) return;
    closeBookmarkPanel();
    memoOpenPageIndex = pageFlip.getCurrentPageIndex();
    memoTextarea.value = memos[memoOpenPageIndex] || '';
    renderMemoList();
    memoPanel.hidden = false;
    memoTextarea.focus();
  }

  // 메모 창을 닫을 때, 열려 있던 그 페이지 번호(memoOpenPageIndex) 기준으로 저장해야 한다.
  // 페이지를 넘긴 뒤에 닫히는 경우 pageFlip.getCurrentPageIndex()는 이미 다음 페이지를
  // 가리키고 있어서, 새로 조회하면 엉뚱한 페이지에 메모가 저장되는 문제가 있다.
  function closeMemoPanel() {
    if (memoPanel) memoPanel.hidden = true;
    if (memoOpenPageIndex === null || !memoTextarea) return;
    var value = memoTextarea.value;
    if (value && value.trim()) memos[memoOpenPageIndex] = value; else delete memos[memoOpenPageIndex];
    saveMemos();
    updateMemoUI(memoOpenPageIndex);
    memoOpenPageIndex = null;
  }

  if (memoBtn) memoBtn.addEventListener('click', openMemoPanel);
  if (memoCloseBtn) memoCloseBtn.addEventListener('click', closeMemoPanel);

  function updateIndicator(pageIndex, totalPages) {
    if (currentEl) currentEl.textContent = String(pageIndex + 1);
    if (totalEl) totalEl.textContent = String(totalPages);
    if (prevBtn) prevBtn.disabled = pageIndex <= 0;
    if (nextBtn) nextBtn.disabled = pageIndex >= totalPages - 1;
    setActiveIndexTab(pageIndex);
    updateBookmarkUI(pageIndex);
    updateMemoUI(pageIndex);
  }

  function hideHintOnce() {
    if (hintEl && !hintEl.classList.contains('is-hidden')) {
      hintEl.classList.add('is-hidden');
    }
  }

  var indexTabs = [];

  function buildIndexRail(numPages) {
    if (!indexRail) return;
    indexRail.innerHTML = '';
    indexTabs = [];

    CHAPTERS.forEach(function (chapter) {
      var pageIndex = Math.max(0, Math.min(numPages - 1, chapter.page - 1));

      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'pr-index-tab';
      tab.textContent = chapter.title;
      tab.setAttribute('aria-label', chapter.title + ' 부분으로 이동');
      tab.style.setProperty('--tab-color', chapter.color);
      tab.style.setProperty('--tab-text', chapter.textColor);
      tab.dataset.pageIndex = String(pageIndex);

      tab.addEventListener('click', function () {
        // flip()은 종이 넘기는 애니메이션이 있어서 느리게 느껴진다는 피드백이 있어,
        // 애니메이션 없이 바로 전환되는 turnToPage()를 쓴다.
        if (pageFlip) pageFlip.turnToPage(pageIndex);
        hideHintOnce();
      });

      indexRail.appendChild(tab);
      indexTabs.push(tab);
    });
  }

  function setActiveIndexTab(realPageIndex) {
    // 스프레드 모드에서는 realPageIndex(왼쪽)와 그 오른쪽 페이지(+1)가 동시에 보이므로,
    // 오른쪽 페이지에서 챕터가 시작해도 그 챕터를 활성화 표시해야 한다.
    var visibleIndex = realPageIndex + 1;
    var activeTab = null;
    for (var i = 0; i < indexTabs.length; i++) {
      if (Number(indexTabs[i].dataset.pageIndex) <= visibleIndex) {
        activeTab = indexTabs[i];
      }
    }
    indexTabs.forEach(function (tab) {
      tab.classList.toggle('is-active', tab === activeTab);
    });
  }

  // 우클릭 저장/드래그 방지
  document.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  document.addEventListener('dragstart', function (event) {
    event.preventDefault();
  });

  var pageImages = null;
  var pageAspect = 0.7;
  var pageCount = 0;
  var lastDims = null;
  var bookReady = false;

  function buildBook(startIndex) {
    var dims = sizeBookToStage(pageAspect);

    // 리사이즈 이벤트가 연속으로 여러 번 튀는 경우(폰트 로딩, 프리뷰 패널 리스케일 등),
    // 실제로 크기가 달라진 게 아니면 다시 그리지 않는다. 그냥 다시 그리면 destroy() ->
    // 새 컨테이너 생성이 반복되면서 무한 루프처럼 계속 재생성되는 문제가 생긴다.
    if (lastDims && Math.abs(lastDims.width - dims.width) <= 2 && Math.abs(lastDims.height - dims.height) <= 2) {
      return;
    }
    lastDims = dims;
    bookReady = false;

    if (pageFlip) {
      // destroy()가 컨테이너 엘리먼트 자체를 DOM에서 제거하므로, 매번 새 컨테이너를
      // 만들어 붙여야 다음 buildBook()이 정상적으로 화면에 나타난다.
      pageFlip.destroy();
      pageFlip = null;
    }

    // 최초 호출 시에는 HTML에 있던 정적 #pr-book이 아직 안 지워진 상태이므로,
    // id가 겹치는 잔재가 있으면 먼저 치운다 (안 그러면 getElementById가 옛 빈 엘리먼트를 반환함).
    var stale = document.getElementById('pr-book');
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

    var freshBookEl = document.createElement('div');
    freshBookEl.id = 'pr-book';
    freshBookEl.className = 'pr-book';
    bookCropEl.appendChild(freshBookEl);
    bookEl = freshBookEl;

    pageFlip = new St.PageFlip(bookEl, {
      width: dims.width,
      height: dims.height,
      size: 'stretch',
      minWidth: dims.minWidth,
      maxWidth: dims.maxWidth,
      minHeight: dims.minHeight,
      maxHeight: dims.maxHeight,
      maxShadowOpacity: 0.5,
      showCover: true,
      usePortrait: true,
      mobileScrollSupport: false,
      useMouseEvents: true,
      // 모서리를 드래그해서 넘길 때의 애니메이션 속도. 기본값(1000ms)이 느리다는
      // 피드백이 있어 훨씬 빠르게 줄였다(버튼/목차 클릭은 애니메이션 없이 즉시 전환).
      flippingTime: 250
    });

    pageFlip.loadFromImages(pageImages);
    applyRetinaCanvas(freshBookEl);

    // 콜백이 실행될 때는 buildBook()이 다시 호출되어 바깥의 bookEl/pageFlip이
    // 이미 다른 값으로 바뀌어 있을 수 있으므로, 이 호출에서 만든 요소를 직접 캡처해서 쓴다.
    var thisBookEl = freshBookEl;
    var thisPageFlip = pageFlip;

    thisPageFlip.on('init', function () {
      if (loadingEl) loadingEl.classList.add('is-hidden');
      thisBookEl.classList.add('is-ready');
      // 리사이즈로 다시 그릴 때 원래 보던 페이지로 복귀시키는 용도라 애니메이션 없는
      // turnToPage를 쓴다. flip()은 애니메이션 상태를 가지는데, 리사이즈가 짧은 간격으로
      // 연달아 발생하면 flip 도중 currentPageIndex가 불안정해져서 페이지가 계속
      // 앞으로 튀는 문제가 있었다.
      // startIndex가 0(표지)일 때 `if(startIndex)`는 false라 복귀 호출을 건너뛰었고,
      // 그러면 새 인스턴스가 기본 시작 위치로 초기화되며 표지에서 리사이즈할 때마다
      // 페이지가 한 칸씩 밀리는 버그가 있었다. 0도 유효한 페이지이므로 명시적으로 비교한다.
      if (startIndex !== undefined && startIndex !== null) thisPageFlip.turnToPage(startIndex);
      applyRetinaCanvas(thisBookEl);
      // 표지 크롭 계산 전에 책 폭을 고정 px로 박아둬서, 크롭이 책 자체 크기에 영향 주지 않게 한다.
      thisBookEl.style.width = thisBookEl.offsetWidth + 'px';
      var initIndex = thisPageFlip.getCurrentPageIndex();
      applyCoverCrop(initIndex, pageCount);
      updateIndicator(initIndex, pageCount);
      bookReady = true;
    });

    thisPageFlip.on('flip', function (e) {
      // 메모 창을 열어둔 채로 페이지를 넘기면 이전 페이지 메모가 저장 안 되고
      // 날아갈 수 있어서, 페이지가 바뀌기 전에 먼저 저장하고 닫는다.
      if (memoPanel && !memoPanel.hidden) closeMemoPanel();
      applyCoverCrop(e.data, pageCount);
      updateIndicator(e.data, pageCount);
      hideHintOnce();
    });
  }

  pageCount = PAGE_COUNT;
  pageImages = [];
  for (var i = 1; i <= PAGE_COUNT; i++) {
    pageImages.push(pageUrl(i));
  }

  // 첫 페이지 이미지의 실제 가로세로 비율을 읽어서 책 크기를 계산한다.
  var probe = new Image();
  probe.onload = function () {
    if (probe.naturalWidth && probe.naturalHeight) {
      pageAspect = probe.naturalWidth / probe.naturalHeight;
    }
    buildIndexRail(pageCount);
    renderBookmarkList();
    buildBook();
  };
  probe.onerror = function () {
    console.error('페이지 이미지를 불러오지 못했습니다:', pageImages[0]);
    showError('이북을 불러오는 중 문제가 발생했어요.');
  };
  probe.src = pageImages[0];

  // flipNext()/flipPrev()는 종이 넘기는 애니메이션이 있어서 느리게 느껴진다는
  // 피드백이 있어, 버튼/키보드 이동은 애니메이션 없는 turnToNextPage()/
  // turnToPrevPage()로 바꿨다(모서리를 직접 드래그하는 제스처는 그대로 애니메이션 유지).
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (pageFlip) pageFlip.turnToPrevPage();
      hideHintOnce();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      if (pageFlip) pageFlip.turnToNextPage();
      hideHintOnce();
    });
  }

  // 하단 페이지 숫자를 눌러서 원하는 페이지로 바로 이동. 숫자 자리를 입력창으로
  // 바꿔치기해서 그 자리에서 바로 타이핑하고 엔터로 이동할 수 있게 한다.
  var indicatorEl = document.getElementById('pr-indicator');

  function enterPageJumpMode() {
    if (!pageJumpInput || !indicatorEl || !currentEl) return;
    pageJumpInput.value = currentEl.textContent;
    indicatorEl.classList.add('is-editing');
    pageJumpInput.focus();
    pageJumpInput.select();
  }

  function exitPageJumpMode() {
    if (indicatorEl) indicatorEl.classList.remove('is-editing');
  }

  function commitPageJump() {
    if (!pageJumpInput) return;
    var target = parseInt(pageJumpInput.value, 10);
    if (pageFlip && target >= 1 && target <= pageCount) {
      pageFlip.turnToPage(target - 1);
      hideHintOnce();
    }
    exitPageJumpMode();
  }

  if (pageJumpBtn) {
    pageJumpBtn.addEventListener('click', enterPageJumpMode);
  }

  if (pageJumpInput) {
    pageJumpInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') commitPageJump();
      if (event.key === 'Escape') exitPageJumpMode();
    });
    pageJumpInput.addEventListener('blur', exitPageJumpMode);
  }

  document.addEventListener('keydown', function (event) {
    if (!pageFlip) return;
    // 페이지 이동 입력창에 포커스가 있을 때는 방향키가 숫자 값을 바꾸거나 커서를
    // 옮기는 용도로 쓰여야 하므로, 여기서 책장을 넘겨버리면 안 된다.
    var tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') pageFlip.turnToNextPage();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') pageFlip.turnToPrevPage();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // 이전 buildBook()의 loadFromImages/init이 아직 안 끝났는데 리사이즈로 또
      // buildBook()을 부르면, 초기화 안 된 인스턴스에서 getCurrentPageIndex()를 읽어
      // 엉뚱한 페이지로 이동해버리는 문제가 있었다. 완전히 준비된 뒤에만 재실행한다.
      if (pageFlip && pageImages && bookReady) {
        var currentIndex = pageFlip.getCurrentPageIndex();
        buildBook(currentIndex);
        // buildBook()이 크기 차이가 미미해 재생성을 건너뛴 경우, 라이브러리 자체의
        // resize 핸들러가 이미 캔버스를 1:1 해상도로 되돌려놨을 수 있어 다시 보정한다.
        applyRetinaCanvas(bookEl);
        applyCoverCrop(pageFlip.getCurrentPageIndex(), pageCount);
      }
    }, 200);
  });
})();
