// Round-robin between all decks (AI vs AI, sides swapped) to spot decks that are far too strong or weak.
// Usage: GAMES=200 node tools/decks.js
const Core = require('../src/core.js');
const GAMES = +(process.env.GAMES || 200);
const D = Core.DECKS;
const wins = D.map(() => 0), played = D.map(() => 0);
const cell = D.map(() => D.map(() => null));
for (let a = 0; a < D.length; a++) for (let b = 0; b < D.length; b++) {
  if (a === b) continue;
  let w = 0, n = 0;
  for (let g = 0; g < GAMES; g++) {
    const G = Core.newGame(Core.mulberry32(31000 + g * 13 + a * 101 + b), { deckIds: { you: D[a].id, foe: D[b].id } });
    G.foeBonus = 0; Core.startRound(G);
    let guard = 0;
    while (G.phase !== 'over' && guard++ < 40) {
      for (const p of Core.aiPlan(G, 'you')) Core.playCard(G, p.card.uid, p.cell);
      for (const ev of Core.resolveRound(G)) { /* run */ }
    }
    if (!G.over || G.over.winner === 'draw') continue;
    n++; if (G.over.winner === 'you') w++;
  }
  cell[a][b] = w / n; wins[a] += w; played[a] += n; wins[b] += n - w; played[b] += n;
}
console.log('deck'.padEnd(16) + D.map(d => d.id.slice(0, 6).padStart(7)).join('') + '   overall');
D.forEach((d, a) => {
  console.log(d.name.padEnd(16) + D.map((_, b) => (a === b ? '   -   ' : String(Math.round(cell[a][b] * 100)).padStart(6) + '%')).join('') + '   ' + (wins[a] / played[a] * 100).toFixed(0) + '%');
});
