(function () {
  // 이 파일 하나만 바꾸면 다른 PDF로 교체할 수 있습니다.
  var PDF_URL = 'pdf/sample.pdf';
  var PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var RENDER_TARGET_WIDTH = 1000; // 페이지 1장을 렌더링할 목표 픽셀 폭 (선명도용)

  var stage = document.getElementById('pr-stage');
  var bookEl = document.getElementById('pr-book');
  var loadingEl = document.getElementById('pr-loading');
  var hintEl = document.getElementById('pr-hint');
  var prevBtn = document.getElementById('pr-prev');
  var nextBtn = document.getElementById('pr-next');
  var indicatorBtn = document.getElementById('pr-indicator');
  var currentEl = document.querySelector('.pr-indicator__current');
  var totalEl = document.querySelector('.pr-indicator__total');
  var tocTrigger = document.getElementById('pr-toc-trigger');
  var tocOverlay = document.getElementById('pr-toc-overlay');
  var tocClose = document.getElementById('pr-toc-close');
  var tocGrid = document.getElementById('pr-toc-grid');

  if (!stage || !bookEl || typeof pdfjsLib === 'undefined' || typeof St === 'undefined') {
    showError('이북을 불러오지 못했어요. 새로고침해 주세요.');
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

  var pageFlip = null;

  function showError(message) {
    if (loadingEl) loadingEl.classList.add('is-hidden');
    var err = document.createElement('div');
    err.className = 'pr-error';
    err.textContent = message;
    stage.appendChild(err);
  }

  function renderPageToDataUrl(pdfDoc, pageNumber) {
    return pdfDoc.getPage(pageNumber).then(function (page) {
      var baseViewport = page.getViewport({ scale: 1 });
      var scale = RENDER_TARGET_WIDTH / baseViewport.width;
      var viewport = page.getViewport({ scale: scale });

      var canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      var ctx = canvas.getContext('2d');

      return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
        var aspect = viewport.width / viewport.height;
        var dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        canvas.width = 0;
        canvas.height = 0;
        return { dataUrl: dataUrl, aspect: aspect };
      });
    });
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
      // stretch 모드가 화면보다 커지지 않도록 상한을 실제 계산값으로 고정
      minWidth: Math.max(200, Math.round(width * 0.6)),
      maxWidth: width,
      minHeight: Math.max(280, Math.round(height * 0.6)),
      maxHeight: height
    };
  }

  function updateIndicator(pageIndex, totalPages) {
    if (currentEl) currentEl.textContent = String(pageIndex + 1);
    if (totalEl) totalEl.textContent = String(totalPages);
    if (prevBtn) prevBtn.disabled = pageIndex <= 0;
    if (nextBtn) nextBtn.disabled = pageIndex >= totalPages - 1;
  }

  function hideHintOnce() {
    if (hintEl && !hintEl.classList.contains('is-hidden')) {
      hintEl.classList.add('is-hidden');
    }
  }

  function buildToc(images, aspect) {
    if (!tocGrid) return;
    bookEl.style.setProperty('--pr-page-aspect', aspect);
    tocGrid.style.setProperty('--pr-page-aspect', aspect);

    images.forEach(function (src, i) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'pr-toc-item';

      var thumb = document.createElement('span');
      thumb.className = 'pr-toc-item__thumb';

      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      thumb.appendChild(img);

      var num = document.createElement('span');
      num.className = 'pr-toc-item__num';
      num.textContent = String(i + 1) + '페이지';

      item.appendChild(thumb);
      item.appendChild(num);

      item.addEventListener('click', function () {
        if (pageFlip) pageFlip.flip(i);
        closeToc();
        hideHintOnce();
      });

      tocGrid.appendChild(item);
    });
  }

  function openToc() {
    if (tocOverlay) tocOverlay.classList.add('is-open');
  }

  function closeToc() {
    if (tocOverlay) tocOverlay.classList.remove('is-open');
  }

  if (tocTrigger) tocTrigger.addEventListener('click', openToc);
  if (indicatorBtn) indicatorBtn.addEventListener('click', openToc);
  if (tocClose) tocClose.addEventListener('click', closeToc);

  if (tocOverlay) {
    tocOverlay.addEventListener('click', function (event) {
      if (event.target === tocOverlay) closeToc();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeToc();
  });

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

  function buildBook(startIndex) {
    var dims = sizeBookToStage(pageAspect);

    if (pageFlip) {
      pageFlip.destroy();
      pageFlip = null;
    }

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

    pageFlip.on('init', function () {
      if (loadingEl) loadingEl.classList.add('is-hidden');
      bookEl.classList.add('is-ready');
      if (startIndex) pageFlip.flip(startIndex);
      updateIndicator(pageFlip.getCurrentPageIndex(), pageCount);
    });

    pageFlip.on('flip', function (e) {
      updateIndicator(e.data, pageCount);
      hideHintOnce();
    });
  }

  pdfjsLib.getDocument(PDF_URL).promise.then(function (pdfDoc) {
    pageCount = pdfDoc.numPages;
    var pagePromises = [];
    for (var i = 1; i <= pageCount; i++) {
      pagePromises.push(renderPageToDataUrl(pdfDoc, i));
    }

    return Promise.all(pagePromises).then(function (rendered) {
      pageImages = rendered.map(function (r) { return r.dataUrl; });
      pageAspect = rendered[0] ? rendered[0].aspect : 0.7;

      buildToc(pageImages, pageAspect);
      buildBook();
    });
  }).catch(function (err) {
    console.error(err);
    showError('PDF를 불러오는 중 문제가 발생했어요.');
  });

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
      if (pageFlip && pageImages) {
        var currentIndex = pageFlip.getCurrentPageIndex();
        buildBook(currentIndex);
      }
    }, 200);
  });
})();
