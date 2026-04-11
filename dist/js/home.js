/* home.js — cinematic entry, cursor, menu, hero animations */
/* Only runs on index.html */

(function () {

  // ── Custom cursor ─────────────────────────────────────
  const cursor    = document.getElementById('cursor');
  const cursorDot = document.getElementById('cursor-dot');
  if (!cursor) return;

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let cx = mx, cy = my;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursorDot.style.left = mx + 'px';
    cursorDot.style.top  = my + 'px';
  });

  function animateCursor() {
    cx += (mx - cx) * 0.12;
    cy += (my - cy) * 0.12;
    cursor.style.left = cx + 'px';
    cursor.style.top  = cy + 'px';
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // ── Loader animation ──────────────────────────────────
  const loader      = document.getElementById('loader');
  const loaderBar   = document.getElementById('loader-bar');
  const loaderName  = document.getElementById('loader-name');
  const loaderCount = document.getElementById('loader-counter');

  let progress = 0;
  const duration = 1800; // ms
  const start = performance.now();

  function tickLoader(now) {
    const elapsed = now - start;
    progress = Math.min(100, Math.round((elapsed / duration) * 100));
    loaderBar.style.width = progress + '%';
    if (loaderCount) loaderCount.textContent = progress;

    if (progress >= 30 && loaderName) loaderName.classList.add('revealed');

    if (progress < 100) {
      requestAnimationFrame(tickLoader);
    } else {
      // Done — hide loader, reveal hero
      setTimeout(() => {
        loader.classList.add('hidden');
        revealHero();
      }, 400);
    }
  }
  requestAnimationFrame(tickLoader);

  function revealHero() {
    // Nav
    document.querySelector('.nav-logo')?.classList.add('visible');
    document.querySelector('.nav-right')?.classList.add('visible');
    // Hero words
    setTimeout(() => {
      document.getElementById('hw1')?.classList.add('visible');
      setTimeout(() => document.getElementById('hw2')?.classList.add('visible'), 120);
    }, 100);
    // Hero sub
    setTimeout(() => document.querySelector('.hero-sub')?.classList.add('visible'), 400);
    // Badge & scroll hint
    setTimeout(() => {
      document.querySelector('.hero-badge')?.classList.add('visible');
      document.querySelector('.hero-scroll-hint')?.classList.add('visible');
    }, 600);
  }

  // ── Hamburger / fullscreen menu ───────────────────────
  const hamburger = document.getElementById('hamburger');
  const menu      = document.getElementById('menu');
  let menuOpen = false;

  if (hamburger && menu) {
    hamburger.addEventListener('click', toggleMenu);
    // Close on menu link click
    menu.querySelectorAll('.menu-item').forEach(link => {
      link.addEventListener('click', () => {
        toggleMenu();
      });
    });
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
    hamburger.classList.toggle('open', menuOpen);
    menu.classList.toggle('open', menuOpen);
    document.body.classList.toggle('menu-open', menuOpen);
  }

  // ── Blog post count (fetch from worker or skip) ───────
  const blogCountEl = document.getElementById('blog-count');
  if (blogCountEl) {
    const WORKER = 'http://localhost:8787';
    if (WORKER && !WORKER.includes('{{')) {
      fetch(`${WORKER}/api/posts`)
        .then(r => r.json())
        .then(d => { if (d.posts) blogCountEl.textContent = d.posts.length; })
        .catch(() => { blogCountEl.textContent = '—'; });
    } else {
      blogCountEl.textContent = '—';
    }
  }

})();
