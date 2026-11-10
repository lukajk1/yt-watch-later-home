// Watch Later Home: the YouTube homepage becomes your Watch Later list, shown as
// a grid we draw ourselves. YouTube's own rows stay in the page (hidden) so its
// infinite scroll, sorting and menus keep working; we read the videos from them.
(() => {
  const WATCH_LATER = '/playlist?list=WL';
  const FEED = '/?wlh=feed'; // the homepage, without the redirect

  const params = () => new URLSearchParams(location.search);
  const isHome = () => location.pathname === '/';
  // ?wlh=grid turns the grid on for that playlist too (handy for testing signed
  // out). YouTube strips unknown parameters, so remember it from the first load.
  const debugList = params().get('wlh') === 'grid' ? params().get('list') : null;
  const isGridPage = () => {
    if (location.pathname !== '/playlist') return false;
    const list = params().get('list');
    return list === 'WL' || (debugList !== null && list === debugList);
  };
  const wantsFeed = () => params().get('wlh') === 'feed';

  // Redirect before the feed has a chance to render.
  if (isHome() && !wantsFeed()) {
    location.replace(WATCH_LATER);
    return;
  }

  // The feed stays allowed until you leave the homepage.
  let feedAllowed = isHome();

  // In-site clicks on links to "/" (logo, "Home" in the sidebar) go to Watch Later.
  window.addEventListener(
    'click',
    (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== '/' || url.searchParams.get('wlh') === 'feed') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      location.assign(WATCH_LATER);
    },
    true
  );

  function onNavigate() {
    if (isHome()) {
      if (!feedAllowed && !wantsFeed()) {
        location.replace(WATCH_LATER);
        return;
      }
    } else {
      feedAllowed = false;
    }
    sync();
  }

  // ---------- Masthead button ----------

  function ensureButton() {
    const end = document.querySelector('ytd-masthead #end');
    if (!end) return;
    let btn = document.getElementById('wlh-toggle');
    if (!btn) {
      btn = document.createElement('a');
      btn.id = 'wlh-toggle';
      end.prepend(btn);
    }
    const toFeed = !isHome();
    const label = toFeed ? 'Recommendations' : 'Watch Later';
    if (btn.textContent !== label) {
      btn.textContent = label;
      btn.href = toFeed ? FEED : WATCH_LATER;
      btn.title = toFeed ? 'Show the normal YouTube homepage' : 'Back to your Watch Later grid';
    }
  }

  // ---------- Reading videos out of YouTube's rows ----------

  const ROW = 'ytd-playlist-video-renderer, yt-lockup-view-model';
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function findRows() {
    const browse = document.querySelector('ytd-browse[page-subtype="playlist"]:not([hidden])');
    return browse ? [...browse.querySelectorAll(`#primary :is(${ROW})`)] : [];
  }

  function readRow(row) {
    const link = row.querySelector('a[href*="/watch?v="]');
    if (!link) return null;
    const href = link.getAttribute('href');
    const id = new URL(href, location.origin).searchParams.get('v');
    if (!id) return null;

    let title, channel, meta;
    if (row.tagName === 'YTD-PLAYLIST-VIDEO-RENDERER') {
      const t = row.querySelector('#video-title');
      title = (t && t.getAttribute('title')) || text(t);
      channel = text(row.querySelector('ytd-channel-name #text')) || text(row.querySelector('ytd-channel-name a'));
      meta = text(row.querySelector('#video-info'));
    } else {
      title = text(row.querySelector('.ytLockupMetadataViewModelTitle'));
      const lines = [...row.querySelectorAll('.ytContentMetadataViewModelMetadataRow')].map(text);
      channel = lines[0] || '';
      meta = lines.slice(1).join(' • ');
    }

    // Duration: the first short "12:34" / "1:02:03" text anywhere in the row.
    let duration = '';
    for (const el of row.querySelectorAll('badge-shape, #time-status #text, ytd-thumbnail-overlay-time-status-renderer, span, div')) {
      const s = text(el);
      if (/^\d{1,2}(:\d{2}){1,2}$/.test(s)) { duration = s; break; }
      if (/^(LIVE|SHORTS|UPCOMING|PREMIERE)$/i.test(s)) { duration = s.toUpperCase(); break; }
    }

    // Watched progress, if any (a bar with an inline width in %).
    let progress = 0;
    const bar = row.querySelector('#progress[style*="width"], [class*="ProgressBarSegment"][style*="width"], [class*="WatchedProgress"][style*="width"]');
    if (bar) progress = parseFloat(bar.style.width) || 0;

    return { id, href, title: title || '(untitled)', channel, meta, duration, progress, row, link };
  }

  // ---------- Drawing our grid ----------

  let grid = null;
  let lastSignature = '';
  let menuHost = null;

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }

  function card(v) {
    const c = el('div', 'wlh-card');
    c.dataset.id = v.id;

    const thumb = el('a', 'wlh-thumb');
    thumb.href = v.href;
    const img = el('img');
    img.loading = 'lazy';
    img.alt = '';
    img.src = `https://i.ytimg.com/vi/${v.id}/hq720.jpg`;
    img.addEventListener('error', () => {
      if (!img.src.includes('mqdefault')) img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    });
    thumb.append(img);
    if (v.duration) thumb.append(el('span', 'wlh-duration', v.duration));
    if (v.progress > 0) {
      const p = el('div', 'wlh-progress');
      const f = el('div');
      f.style.width = Math.min(100, v.progress) + '%';
      p.append(f);
      thumb.append(p);
    }

    const info = el('div', 'wlh-info');
    const words = el('div', 'wlh-words');
    const title = el('a', 'wlh-title', v.title);
    title.href = v.href;
    title.title = v.title;
    words.append(title);
    if (v.channel) words.append(el('div', 'wlh-line', v.channel));
    if (v.meta) words.append(el('div', 'wlh-line', v.meta));
    const menu = el('button', 'wlh-menu');
    menu.type = 'button';
    menu.title = 'More (remove from Watch Later, etc.)';
    menu.setAttribute('aria-label', 'More actions');
    // Built with DOM calls: YouTube's Trusted Types policy can block innerHTML.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    for (const cy of [5, 12, 19]) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', '12');
      dot.setAttribute('cy', String(cy));
      dot.setAttribute('r', '2');
      svg.append(dot);
    }
    menu.append(svg);
    info.append(words, menu);

    c.append(thumb, info);
    return c;
  }

  // Clicks on a card play the video through YouTube's own link (fast in-app
  // navigation, keeps the Watch Later queue). Middle/ctrl-click open a new tab.
  function onGridClick(e) {
    const c = e.target.closest('.wlh-card');
    if (!c) return;
    const v = current.get(c.dataset.id);
    if (!v) return;
    if (e.target.closest('.wlh-menu')) {
      e.preventDefault();
      openRowMenu(v, e.target.closest('.wlh-menu'));
      return;
    }
    if (e.target.closest('a') && e.button === 0 && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
      v.link.click();
    }
  }

  // Open YouTube's own "⋮" menu for the hidden row, lined up with our button.
  function openRowMenu(v, ourBtn) {
    // New layout: hide/show the wrapper div around the lockup, not the lockup.
    const host = v.row.tagName === 'YT-LOCKUP-VIEW-MODEL' ? v.row.parentElement : v.row;
    if (menuHost && menuHost !== host) {
      menuHost.classList.remove('wlh-menu-host');
      menuHost.style.left = menuHost.style.top = '';
    }
    menuHost = host;
    host.classList.add('wlh-menu-host');
    host.style.left = '0px';
    host.style.top = '0px';
    const theirBtn = v.row.querySelector(
      '#menu button, #menu yt-icon-button, .ytLockupMetadataViewModelMenuButton button'
    );
    if (!theirBtn) return;
    const a = theirBtn.getBoundingClientRect();
    const b = ourBtn.getBoundingClientRect();
    host.style.left = b.left - a.left + 'px';
    host.style.top = b.top - a.top + 'px';
    theirBtn.click();
    placePopupAt(b);
  }

  // YouTube positions its popup from its own layout, which ends up off to the
  // side; once it's open, move it under our button (kept on screen).
  function placePopupAt(b) {
    const started = performance.now();
    const tick = () => {
      const pop = [...document.querySelectorAll('tp-yt-iron-dropdown')].find((p) => {
        const r = p.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(p).display !== 'none';
      });
      if (!pop) {
        if (performance.now() - started < 1000) requestAnimationFrame(tick);
        return;
      }
      const r = pop.getBoundingClientRect();
      let left = b.right - r.width;
      let top = b.bottom + 4;
      if (left < 8) left = 8;
      if (top + r.height > innerHeight - 8) top = Math.max(8, b.top - r.height - 4);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    };
    requestAnimationFrame(tick);
  }

  let current = new Map();

  function sync() {
    const on = isGridPage();
    document.documentElement.classList.toggle('wlh-grid', on);
    ensureButton();
    if (!on) return;

    const rows = findRows();
    if (!rows.length) return;
    const videos = rows.map(readRow).filter(Boolean);

    // Put the grid just before YouTube's list.
    const first = rows[0];
    const list =
      first.closest('ytd-playlist-video-list-renderer') ||
      first.closest('#contents'); // new layout: yt-item-section-renderer > #contents
    if (!list || !list.parentElement) return;
    if (!grid) {
      grid = el('div');
      grid.id = 'wlh-grid';
      grid.addEventListener('click', onGridClick);
    }
    if (grid.nextElementSibling !== list) list.parentElement.insertBefore(grid, list);

    current = new Map(videos.map((v) => [v.id, v]));
    const signature = videos
      .map((v) => [v.id, v.title, v.channel, v.meta, v.duration, Math.round(v.progress)].join('|'))
      .join('\n');
    if (signature === lastSignature) return;
    lastSignature = signature;

    // Reuse cards whose content didn't change so thumbnails don't flicker.
    const old = new Map([...grid.children].map((c) => [c.dataset.id, c]));
    const frag = document.createDocumentFragment();
    for (const v of videos) {
      const key = [v.title, v.channel, v.meta, v.duration, Math.round(v.progress)].join('|');
      let c = old.get(v.id);
      if (!c || c.dataset.key !== key) {
        c = card(v);
        c.dataset.key = key;
      }
      frag.append(c);
    }
    grid.replaceChildren(frag);
  }

  document.documentElement.classList.toggle('wlh-grid', isGridPage());
  window.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('yt-page-data-updated', onNavigate);
  // YouTube adds rows as you scroll and rebuilds them on sort or removal.
  setInterval(sync, 500);
})();
