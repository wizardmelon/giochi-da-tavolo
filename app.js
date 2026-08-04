let games = [];

async function loadGames() {
  const res = await fetch('data/games.json');
  games = await res.json();
  document.getElementById('game-count').textContent = games.length;
  render();
}

function playersLabel(g) {
  if (!g.minplayers && !g.maxplayers) return null;
  if (g.minplayers === g.maxplayers) return `${g.minplayers} giocatori`;
  return `${g.minplayers}-${g.maxplayers} giocatori`;
}

function cardHtml(g) {
  const img = g.image
    ? `<img src="${g.image}" alt="${g.name}" loading="lazy">`
    : `<span class="placeholder">🎲</span>`;

  const meta = [];
  const pl = playersLabel(g);
  if (pl) meta.push(`<span>${pl}</span>`);
  if (g.playingtime) meta.push(`<span>${g.playingtime} min</span>`);
  if (g.year) meta.push(`<span>${g.year}</span>`);

  const rating = g.rating ? `<span class="card-rating">★ ${g.rating}</span>` : '';

  const expansions = (g.expansions && g.expansions.length)
    ? `<div class="card-expansions">+ ${g.expansions.join(' · ')}</div>`
    : '';

  return `
    <div class="card">
      <div class="card-image">${img}</div>
      <div class="card-body">
        <div class="card-title">${g.name}</div>
        <div class="card-meta">${meta.join('')}${rating}</div>
        ${expansions}
      </div>
    </div>
  `;
}

function render() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const sort = document.getElementById('sort').value;

  let filtered = games.filter(g => {
    const haystack = [g.name, ...(g.expansions || [])].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  filtered.sort((a, b) => {
    if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
    if (sort === 'year') return (b.year || 0) - (a.year || 0);
    if (sort === 'players') return (a.minplayers || 0) - (b.minplayers || 0);
    return a.name.localeCompare(b.name);
  });

  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('empty-state');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
    grid.innerHTML = filtered.map(cardHtml).join('');
  }
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('sort').addEventListener('change', render);

loadGames();
