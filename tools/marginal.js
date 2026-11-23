// How much stronger than a plain vanilla card (power = cost, no effect) is each card?
// For every card X, two AIs play mirror-ish games: one side's deck has X, the other's has a vanilla of the same cost in X's slot.
// Everything else in the deck is identical and random. ~50% means "as good as a vanilla"; more means stronger.
// Usage: GAMES=400 node tools/marginal.js [cardId ...]
const Core = require('../src/core.js');
const GAMES = +(process.env.GAMES || 400);
const only = process.argv.slice(2);
const rows = [];
for (const X of Core.POOL) {
  if (only.length && !only.includes(X.id)) continue;
  const van = { num: 0, id: 'vanilla', name: 'Vanilla', cost: X.cost, power: Math.max(1, X.cost), timer: null, fx: null, kw: [] };
  let win = 0, n = 0;
  for (let g = 0; g < GAMES; g++) {
    const rnd = Core.mulberry32(500000 + g * 7 + X.cost);
    const base = Core.makeDeck('mixed', rnd).filter(d => d.id !== X.id).slice(0, Core.DECK_SIZE - 1);
    const withX = base.concat(X), withV = base.concat(van);
    const xSide = g % 2 ? 'you' : 'foe';
    const decks = xSide === 'you' ? { you: withX, foe: withV } : { you: withV, foe: withX };
    const G = Core.newGame(Core.mulberry32(900000 + g), { decks, deckDefs: base });
    G.foeBonus = 0; Core.startRound(G);
    let guard = 0;
    while (G.phase !== 'over' && guard++ < 40) {
      for (const p of Core.aiPlan(G, 'you')) Core.playCard(G, p.card.uid, p.cell);
      for (const ev of Core.resolveRound(G)) { /* run */ }
    }
    if (!G.over || G.over.winner === 'draw') continue;
    n++; if (G.over.winner === xSide) win++;
  }
  rows.push({ X, wr: win / n, n });
  if (only.length) console.log(`${X.name}: ${(win / n * 100).toFixed(0)}% (n=${n})`);
}
if (!only.length) {
  rows.sort((a, b) => b.wr - a.wr);
  for (const r of rows) console.log(`${String(r.X.num || '-').padStart(2)} ${r.X.name.padEnd(17)} ${r.X.cost}c ${String(r.X.power).padStart(2)}p  ${(r.wr * 100).toFixed(0)}%  (n=${r.n})`);
}
