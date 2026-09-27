/* The Patio Edit — shared site JS (vanilla, no dependencies).
   Every feature degrades gracefully: if this file fails to load, the site
   renders exactly as before (no TOC, no search dropdown, plain FAQ list). */
(function () {
  'use strict';

  var doc = document;
  var $ = function (sel, ctx) { return (ctx || doc).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); };

  /* ---------- 1. Mobile nav toggle ---------- */
  function initNav() {
    var toggle = doc.getElementById('navToggle');
    var nav = doc.getElementById('siteNav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* ---------- 2. Dark mode toggle (boot snippet in <head> sets data-theme early) ---------- */
  function initTheme() {
    var btn = doc.getElementById('themeToggle');
    if (!btn) return;
    function current() {
      return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }
    function paint() {
      var dark = current() === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      doc.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('patioedit-theme', next); } catch (e) { /* private mode */ }
      paint();
    });
    paint();
  }

  /* ---------- 3. Site-wide client-side search ---------- */
  function initSearch() {
    var box = $('[data-search]');
    if (!box || !('fetch' in window)) return;
    var input = $('input', box);
    var panel = $('.site-search-results', box);
    if (!input || !panel) return;

    // search-index.json lives at the site root; resolve relative to this script.
    var indexURL;
    try {
      var scriptSrc = (doc.currentScript && doc.currentScript.src) || doc.baseURI;
      indexURL = new URL('../search-index.json', scriptSrc).href;
    } catch (e) {
      indexURL = 'search-index.json';
    }
    var indexDir = indexURL.slice(0, indexURL.lastIndexOf('/') + 1);
    var entries = null;
    var loadFailed = false;

    fetch(indexURL, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { entries = Array.isArray(data) ? data : data.articles || []; })
      .catch(function () { loadFailed = true; });

    function haystack(e) {
      return ((e.title || '') + ' ' + (e.excerpt || '') + ' ' + (e.headings || []).join(' ')).toLowerCase();
    }
    function score(e, words) {
      var h = haystack(e);
      var t = (e.title || '').toLowerCase();
      var s = 0;
      for (var i = 0; i < words.length; i++) {
        if (h.indexOf(words[i]) === -1) return -1;
        if (t.indexOf(words[i]) !== -1) s += 2; else s += 1;
      }
      return s;
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function close() {
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }
    function open() {
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function render(q) {
      q = q.trim().toLowerCase();
      if (q.length < 2) { close(); return; }
      if (loadFailed || entries === null) {
        panel.innerHTML = '<p class="site-search-empty">' +
          (loadFailed ? 'Search is unavailable right now.' : 'Loading search…') + '</p>';
        open();
        return;
      }
      var words = q.split(/\s+/);
      var hits = [];
      entries.forEach(function (e) {
        var s = score(e, words);
        if (s > 0) hits.push({ e: e, s: s });
      });
      hits.sort(function (a, b) { return b.s - a.s; });
      hits = hits.slice(0, 6);
      if (!hits.length) {
        panel.innerHTML = '<p class="site-search-empty">No articles match &ldquo;' + esc(q) + '&rdquo;.</p>';
      } else {
        panel.innerHTML = hits.map(function (h) {
          var href = indexDir + h.e.url;
          return '<a href="' + esc(href) + '" role="option">' +
            '<span class="sr-title">' + esc(h.e.title) + '</span>' +
            '<span class="sr-excerpt">' + esc(h.e.excerpt) + '</span></a>';
        }).join('');
      }
      open();
    }

    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { render(input.value); }, 150);
    });
    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2) render(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); input.blur(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = $$('a', panel);
      if (!links.length) return;
      e.preventDefault();
      var i = links.indexOf(doc.activeElement);
      if (e.key === 'ArrowDown') i = (i + 1) % links.length;
      else i = (i - 1 + links.length) % links.length;
      links[i].focus();
    });
    doc.addEventListener('click', function (e) {
      if (!box.contains(e.target)) close();
    });
  }

  /* ---------- 4. Article table of contents + scroll-spy ---------- */
  function slugify(text, i) {
    var s = text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || ('section-' + (i + 1));
  }
  function initToc() {
    if (!doc.body.classList.contains('article-page')) return;
    var article = $('main article');
    if (!article) return;
    var heads = $$('h2, h3', article).filter(function (h) { return !h.closest('.keep-reading'); });
    if (heads.length < 2) return;

    var used = {};
    heads.forEach(function (h, i) {
      if (h.id) { used[h.id] = true; return; }
      var base = slugify(h.textContent, i);
      var id = base, n = 2;
      while (used[id] || doc.getElementById(id)) id = base + '-' + (n++);
      h.id = id;
      used[id] = true;
    });

    var nav = doc.createElement('nav');
    nav.className = 'toc';
    nav.setAttribute('aria-label', 'On this page');
    var title = doc.createElement('p');
    title.className = 'toc-title';
    title.textContent = 'On this page';
    var list = doc.createElement('ul');
    heads.forEach(function (h) {
      var li = doc.createElement('li');
      if (h.tagName === 'H3') li.className = 'toc-sub';
      var a = doc.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      a.setAttribute('data-toc-for', h.id);
      li.appendChild(a);
      list.appendChild(li);
    });
    nav.appendChild(title);
    nav.appendChild(list);
    var anchor = $('.article-head', article);
    if (anchor && anchor.parentNode === article) anchor.parentNode.insertBefore(nav, anchor.nextSibling);
    else article.insertBefore(nav, article.firstChild);

    if (!('IntersectionObserver' in window)) return;
    var links = {};
    $$('a[data-toc-for]', list).forEach(function (a) { links[a.getAttribute('data-toc-for')] = a; });
    var activeId = null;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        if (activeId && links[activeId]) links[activeId].classList.remove('active');
        activeId = id;
        if (links[id]) links[id].classList.add('active');
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    heads.forEach(function (h) { obs.observe(h); });
  }

  /* ---------- 5. Reading progress bar (article pages) ---------- */
  function initProgress() {
    if (!doc.body.classList.contains('article-page')) return;
    var bar = doc.createElement('div');
    bar.className = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    var fill = doc.createElement('span');
    bar.appendChild(fill);
    doc.body.appendChild(bar);
    var ticking = false;
    function update() {
      ticking = false;
      var h = doc.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var p = max > 0 ? (h.scrollTop || doc.body.scrollTop) / max : 0;
      fill.style.width = (Math.min(1, Math.max(0, p)) * 100).toFixed(2) + '%';
    }
    function request() {
      if (!ticking) { ticking = true; (window.requestAnimationFrame || window.setTimeout)(update); }
    }
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    update();
  }

  /* ---------- 6. FAQ accordions (progressive enhancement over <dl>) ---------- */
  function initFaq() {
    var dls = $$('.faq dl');
    if (!dls.length) return;
    var n = 0;
    dls.forEach(function (dl) {
      var dts = $$('dt', dl);
      dts.forEach(function (dt) {
        var dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== 'DD') return;
        n++;
        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'faq-q';
        while (dt.firstChild) btn.appendChild(dt.firstChild);
        var panelId = 'faq-panel-' + n;
        dd.id = panelId;
        dd.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', panelId);
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', open ? 'false' : 'true');
          dd.hidden = open;
        });
        dt.appendChild(btn);
      });
    });
  }

  /* ---------- 7. Back-to-top button ---------- */
  function initBackToTop() {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    doc.body.appendChild(btn);
    var ticking = false;
    function update() {
      ticking = false;
      btn.classList.toggle('show', (window.scrollY || window.pageYOffset) > 600);
    }
    function request() {
      if (!ticking) { ticking = true; (window.requestAnimationFrame || window.setTimeout)(update); }
    }
    window.addEventListener('scroll', request, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    update();
  }

  initNav();
  initTheme();
  initSearch();
  initToc();
  initProgress();
  initFaq();
  initBackToTop();
})();
