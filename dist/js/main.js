/* main.js — shared across all pages */

const GITHUB_USER = 'ArnaldoKJQ';
const PORTFOLIO_TOPIC = 'portfolio';

// ── GitHub projects (runs only if grid exists) ────────────
const grid = document.getElementById('projects-grid');
const filterBar = document.getElementById('topic-filters');

if (grid) fetchRepos();

async function fetchRepos() {
  try {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`);
    const repos = await res.json();

    const repoCountEl = document.getElementById('repo-count');
    if (repoCountEl) repoCountEl.textContent = repos.length;

    const filtered = PORTFOLIO_TOPIC
      ? repos.filter(r => r.topics?.includes(PORTFOLIO_TOPIC))
      : repos;

    if (!filtered.length) {
      grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem;padding:3rem 2rem;grid-column:1/-1">
        No repos tagged <code style="color:var(--accent)">${PORTFOLIO_TOPIC}</code> yet.
        Add the topic on GitHub to show them here.
      </p>`;
      return;
    }

    // Unique extra topics for filter
    const allTopics = new Set();
    filtered.forEach(r => r.topics?.forEach(t => {
      if (t !== PORTFOLIO_TOPIC) allTopics.add(t);
    }));

    if (filterBar) {
      [...allTopics].slice(0, 6).forEach(topic => {
        const btn = document.createElement('button');
        btn.className = 'wf';
        btn.dataset.topic = topic;
        btn.textContent = topic;
        btn.addEventListener('click', () => setFilter(topic, filtered, btn));
        filterBar.appendChild(btn);
      });

      const allBtn = filterBar.querySelector('[data-topic="all"]');
      if (allBtn) allBtn.addEventListener('click', () => setFilter('all', filtered, allBtn));
    }

    renderRepos(filtered);
  } catch {
    if (grid) grid.innerHTML = '<p style="color:var(--muted);padding:3rem 2rem;grid-column:1/-1">Could not load repositories.</p>';
  }
}

function setFilter(topic, repos, activeBtn) {
  document.querySelectorAll('.wf').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
  const shown = topic === 'all' ? repos : repos.filter(r => r.topics?.includes(topic));
  renderRepos(shown);
}

function renderRepos(repos) {
  grid.innerHTML = repos.map(r => `
    <a class="proj-card" href="${r.html_url}" target="_blank" rel="noopener">
      <div class="proj-top">
        <div class="proj-name">${r.name}</div>
        ${r.language ? `<span class="proj-lang">${r.language}</span>` : ''}
      </div>
      <p class="proj-desc">${r.description || 'No description.'}</p>
      <div class="proj-footer">
        <span>${r.stargazers_count ? `★ ${r.stargazers_count}` : ''}</span>
        <span class="proj-arrow">↗</span>
      </div>
    </a>
  `).join('');
  // re-attach hover cursor listeners
  document.querySelectorAll('.proj-card').forEach(attachHover);
}

// ── Scroll reveal ─────────────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.about, .work, .skills-section, .exp-section, .contact-section').forEach(el => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// ── Cursor hover effect ───────────────────────────────────
function attachHover(el) {
  el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
}
document.querySelectorAll('a, button, .proj-card, .blog-card, .menu-item').forEach(attachHover);

// ── Footer year ───────────────────────────────────────────
const fyEl = document.getElementById('footer-year');
if (fyEl) fyEl.textContent = new Date().getFullYear();

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3500);
}
window.showToast = showToast;
