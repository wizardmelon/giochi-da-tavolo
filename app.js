let games = [];

async function loadGames() {
  const res = await fetch('data/games.json');
  games = await res.json();
  render();
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function playersRange(g) {
  const max = g.maxplayers_override || g.maxplayers;
  if (!g.minplayers && !max) return null;
  if (g.minplayers === max || !max) return `${g.minplayers}`;
  return `${g.minplayers} - ${max}`;
}

const OWNED_KEY = 'giochi-owned-expansions-v1';

function loadOwnedOverrides() {
  try { return JSON.parse(localStorage.getItem(OWNED_KEY)) || {}; }
  catch { return {}; }
}

function saveOwnedOverrides(data) {
  localStorage.setItem(OWNED_KEY, JSON.stringify(data));
}

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isOwned(gameName, expName, ownedList, overrides) {
  const key = `${gameName}::${expName}`;
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return ownedList.some(o => normName(o) === normName(expName) || normName(expName).includes(normName(o)) || normName(o).includes(normName(expName)));
}

function durationRange(g) {
  const min = g.minplaytime, max = g.maxplaytime || g.playingtime;
  if (!min && !max) return null;
  if (!min || min === max) return `${max || min}'`;
  return `${min}-${max}'`;
}

function firstSentences(text, maxLen = 220) {
  if (!text) return '';
  const clean = text.replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/\n+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

function tagBadges(list, cls) {
  if (!list || !list.length) return '';
  return list.map(t => `<span class="tag ${cls}">${esc(t)}</span>`).join('');
}

function cardHtml(g, idx) {
  const img = g.image
    ? `<img src="${esc(g.image)}" alt="${esc(g.name)}" loading="lazy">`
    : `<span class="placeholder">🎲</span>`;

  const pl = playersRange(g);
  const dur = durationRange(g);

  const stats = [];
  if (pl) stats.push(`<span class="stat">👥 ${pl}</span>`);
  if (dur) stats.push(`<span class="stat">⏱ ${dur}</span>`);
  if (g.minage) stats.push(`<span class="stat">🔞 ${g.minage}+</span>`);

  const rating = g.rating ? `<span class="rating">★ ${g.rating}</span>` : '';

  const badges = tagBadges((g.categories || []).slice(0, 5), 'tag-category')
    + tagBadges((g.mechanics || []).slice(0, 5), 'tag-mechanic');

  const extraInfo = [];
  if (g.best_players) extraInfo.push(`<div><strong>Ideale per:</strong> ${esc(g.best_players)} giocatori</div>`);
  if (g.language_dependence) extraInfo.push(`<div><strong>Lingua:</strong> ${esc(g.language_dependence)}</div>`);

  const desc = g.description
    ? `<p class="description">${esc(firstSentences(g.description))}</p>`
    : '';

  const links = [];
  if (g.video_url) links.push(`<a href="${esc(g.video_url)}" target="_blank" rel="noopener" class="link-btn link-video">▶ Tutorial video</a>`);
  if (g.pdf_url) links.push(`<a href="${esc(g.pdf_url)}" target="_blank" rel="noopener" class="link-btn link-pdf">📄 Regolamento PDF</a>`);
  const linksHtml = links.length ? `<div class="links">${links.join('')}</div>` : '';

  const allExpNames = (g.expansions_bgg && g.expansions_bgg.length)
    ? g.expansions_bgg
    : (g.expansions || []);

  let expansions = '';
  if (allExpNames.length) {
    const overrides = loadOwnedOverrides();
    const ownedCount = allExpNames.filter(e => isOwned(g.name, e, g.expansions || [], overrides)).length;
    expansions = `
      <button class="expansions-toggle" data-idx="${idx}">Vedi espansioni ${ownedCount}/${allExpNames.length}</button>
      <div class="expansions-list" id="exp-${idx}" hidden>
        ${allExpNames.map(e => {
          const owned = isOwned(g.name, e, g.expansions || [], overrides);
          const checkboxId = `exp-check-${idx}-${normName(e)}`;
          return `
            <label class="expansion-item" for="${checkboxId}">
              <input type="checkbox" id="${checkboxId}" data-game="${esc(g.name)}" data-exp="${esc(e)}" ${owned ? 'checked' : ''}>
              ${esc(e)}
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-image">${img}</div>
      <div class="card-body">
        <div class="card-head">
          <h3 class="card-title">${esc(g.name)}</h3>
          ${g.year ? `<span class="year">${esc(g.year)}</span>` : ''}
        </div>
        <div class="card-stats">${stats.join('')}${rating}</div>
        <div class="card-badges">${badges}</div>
        <div class="card-extra">${extraInfo.join('')}</div>
        ${desc}
        ${linksHtml}
        ${expansions}
      </div>
    </div>
  `;
}

function parseDurationFilter(value) {
  if (!value) return null;
  const [min, max] = value.split('-').map(Number);
  return { min, max };
}

function render() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const playerCount = parseInt(document.getElementById('player-filter').value, 10);
  const durationFilter = parseDurationFilter(document.getElementById('duration-filter').value);

  let filtered = games.filter(g => {
    const haystack = [g.name, ...(g.expansions || [])].join(' ').toLowerCase();
    if (!haystack.includes(query)) return false;

    if (!isNaN(playerCount)) {
      const min = Number(g.minplayers) || 0;
      const max = Number(g.maxplayers) || min;
      if (playerCount < min || playerCount > max) return false;
    }

    if (durationFilter) {
      const dur = Number(g.maxplaytime || g.playingtime || g.minplaytime) || 0;
      if (dur < durationFilter.min || dur > durationFilter.max) return false;
    }

    return true;
  });

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById('game-count').textContent = filtered.length;

  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('empty-state');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    grid.innerHTML = filtered.map((g, i) => cardHtml(g, i)).join('');
    grid.querySelectorAll('.expansions-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const list = document.getElementById(`exp-${btn.dataset.idx}`);
        list.hidden = !list.hidden;
      });
    });
    grid.querySelectorAll('.expansions-list input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const overrides = loadOwnedOverrides();
        const key = `${cb.dataset.game}::${cb.dataset.exp}`;
        overrides[key] = cb.checked;
        saveOwnedOverrides(overrides);

        const list = cb.closest('.expansions-list');
        const btn = list.previousElementSibling;
        const total = list.querySelectorAll('input[type="checkbox"]').length;
        const owned = list.querySelectorAll('input[type="checkbox"]:checked').length;
        btn.textContent = `Vedi espansioni ${owned}/${total}`;
      });
    });
  }
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('player-filter').addEventListener('input', render);
document.getElementById('duration-filter').addEventListener('change', render);

loadGames();
