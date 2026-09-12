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
  // page: 그 챕터가 시작하는 실제 이미지 페이지 번호(1부터 시작). color: 탭 색상.
  var CHAPTERS = [
    { title: "'영점소비' 시대", page: 10, color: '#000a82' },
    { title: '1. 마이-파이', page: 31, color: '#00c800' },
    { title: '2. 언클리셰', page: 45, color: '#00b4ff' },
    { title: '3. BPM', page: 59, color: '#ff5aaa' },
    { title: '4. 스탯 맥싱', page: 71, color: '#6464ff' },
    { title: '영점 조준의 시대', page: 79, color: '#000a82' }
  ];

  var stage = document.getElementById('pr-stage');
  var bookEl = document.getElementById('pr-book');
  var loadingEl = document.getElementById('pr-loading');
  var hintEl = document.getElementById('pr-hint');
  var prevBtn = document.getElementById('pr-prev');
  var nextBtn = document.getElementById('pr-next');
  var currentEl = document.querySelector('.pr-indicator__current');
  var totalEl = document.querySelector('.pr-indicator__total');
  var indexRail = document.getElementById('pr-index-rail');

  // 테마 전환 (밝은 모드 / 다크 모드 / 일러스트 배경). 책 페이지 이미지 자체는 그대로 두고
  // 주변 화면 색상만 바뀐다. 선택한 테마는 localStorage에 저장해서 다음 방문에도 유지한다.
  (function initThemeSwitcher() {
    var THEME_KEY = 'pr-theme';
    var switcherEl = document.getElementById('pr-theme-switcher');
    if (!switcherEl) return;
    var buttons = switcherEl.querySelectorAll('.pr-theme-btn');

    function applyTheme(theme) {
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
    var availW = Math.max(200, stageRect.width - 32);
    var availH = Math.max(200, stageRect.height - 32);

    // 두 페이지가 나란히 펼쳐지는 스프레드 기준으로 한 페이지 폭을 계산
    var pageW = Math.min(availW / 2, availH * aspect);
    var pageH = pageW / aspect;

    if (pageW < 220) {
      // 화면이 좁으면 한 페이지만 보이는 모드에 맞춰 폭을 계산
      pageW = Math.min(availW, availH * aspect);
      pageH = pageW / aspect;
    }

    var width = Math.round(pageW);
    var height = Math.round(pageH);

    return {
      width: width,
      height: height,
      // stretch 모드가 화면보다 커지지 않도록 상한을 실제 계산값으로 고정.
      // min은 max를 절대 넘으면 안 되므로(가로형처럼 height가 작은 경우 고정 하한을 쓰면
      // min > max가 되어 라이브러리가 박스를 이미지 비율과 다르게 키워 흰 여백이 생긴다)
      // 비율 기반으로만 계산한다.
      minWidth: Math.round(width * 0.6),
      maxWidth: width,
      minHeight: Math.round(height * 0.6),
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
    var dpr = window.devicePixelRatio || 1;
    if (dpr <= 1) return;
    var cssWidth = canvas.clientWidth;
    var cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updateIndicator(pageIndex, totalPages) {
    if (currentEl) currentEl.textContent = String(pageIndex + 1);
    if (totalEl) totalEl.textContent = String(totalPages);
    if (prevBtn) prevBtn.disabled = pageIndex <= 0;
    if (nextBtn) nextBtn.disabled = pageIndex >= totalPages - 1;
    setActiveIndexTab(pageIndex);
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
      tab.dataset.pageIndex = String(pageIndex);

      tab.addEventListener('click', function () {
        if (pageFlip) pageFlip.flip(pageIndex);
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
    stage.appendChild(freshBookEl);
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
      useMouseEvents: true
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
      updateIndicator(thisPageFlip.getCurrentPageIndex(), pageCount);
      bookReady = true;
    });

    thisPageFlip.on('flip', function (e) {
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
    buildBook();
  };
  probe.onerror = function () {
    console.error('페이지 이미지를 불러오지 못했습니다:', pageImages[0]);
    showError('이북을 불러오는 중 문제가 발생했어요.');
  };
  probe.src = pageImages[0];

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (pageFlip) pageFlip.flipPrev();
      hideHintOnce();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      if (pageFlip) pageFlip.flipNext();
      hideHintOnce();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (!pageFlip) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') pageFlip.flipNext();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') pageFlip.flipPrev();
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
      }
    }, 200);
  });
})();
