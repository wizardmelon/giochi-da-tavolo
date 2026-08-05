let games = [];
const openExpansionPanels = new Set();

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

function expLabel(e) { return typeof e === 'string' ? e : e.label; }
function expBggName(e) { return typeof e === 'string' ? null : (e.bgg || null); }
function expPlayerBoost(e) { return typeof e === 'string' ? null : (e.maxplayers_when_owned || null); }

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

function isFanOrRegionalExpansion(name) {
  if (/fan expansion/i.test(name)) return true;
  if (/[äöüßÄÖÜ]/.test(name)) return true;
  if (/[Ѐ-ӿ]/.test(name)) return true;
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(name)) return true;
  if (/Die Siedler von Catan|De Kolonisten van Catan|Saggsen-Gadan|Halo wie|scenariusze/i.test(name)) return true;
  return false;
}

function isOwned(gameName, bggName, ownedExpansions, overrides) {
  const key = `${gameName}::${bggName}`;
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  return ownedExpansions.some(o => {
    const oBgg = expBggName(o);
    if (oBgg) return normName(oBgg) === normName(bggName);
    const label = normName(expLabel(o));
    const target = normName(bggName);
    return label === target || target.includes(label) || label.includes(target);
  });
}

function playersRange(g, ownedExpansions, overrides) {
  let max = Number(g.maxplayers) || 0;
  (ownedExpansions || []).forEach(e => {
    const boost = expPlayerBoost(e);
    if (!boost) return;
    const bggName = expBggName(e) || expLabel(e);
    if (isOwned(g.name, bggName, ownedExpansions, overrides)) {
      max = Math.max(max, boost);
    }
  });
  if (!g.minplayers && !max) return null;
  if (Number(g.minplayers) === max || !max) return `${g.minplayers}`;
  return `${g.minplayers} - ${max}`;
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

  const overrides = loadOwnedOverrides();
  const ownedExpansions = g.expansions || [];

  const pl = playersRange(g, ownedExpansions, overrides);
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

  const allExpNames = ((g.expansions_bgg && g.expansions_bgg.length)
    ? g.expansions_bgg
    : ownedExpansions.map(expLabel)
  ).filter(e => !isFanOrRegionalExpansion(e));

  let expansions = '';
  const gameKey = normName(g.name);
  if (allExpNames.length) {
    const ownedCount = allExpNames.filter(e => isOwned(g.name, e, ownedExpansions, overrides)).length;
    const isOpen = openExpansionPanels.has(gameKey);
    expansions = `
      <button class="expansions-toggle" data-key="${gameKey}">Vedi espansioni ${ownedCount}/${allExpNames.length}</button>
      <div class="expansions-list" id="exp-${gameKey}" ${isOpen ? '' : 'hidden'}>
        ${allExpNames.map(e => {
          const owned = isOwned(g.name, e, ownedExpansions, overrides);
          const checkboxId = `exp-check-${gameKey}-${normName(e)}`;
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
        const key = btn.dataset.key;
        const list = document.getElementById(`exp-${key}`);
        list.hidden = !list.hidden;
        if (list.hidden) openExpansionPanels.delete(key);
        else openExpansionPanels.add(key);
      });
    });
    grid.querySelectorAll('.expansions-list input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('click', (ev) => {
        ev.preventDefault();
        const willOwn = !cb.checked;
        const action = willOwn ? 'aggiungere' : 'rimuovere';
        const ok = confirm(`Vuoi ${action} "${cb.dataset.exp}" dalle espansioni possedute di ${cb.dataset.game}?`);
        if (!ok) return;

        const overrides = loadOwnedOverrides();
        const key = `${cb.dataset.game}::${cb.dataset.exp}`;
        overrides[key] = willOwn;
        saveOwnedOverrides(overrides);
        render();
      });
    });
  }
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('player-filter').addEventListener('input', render);
document.getElementById('duration-filter').addEventListener('change', render);

loadGames();
