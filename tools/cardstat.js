// Win rate of a card, measured only in games where exactly ONE side played it (both sides share the same deck, so
// games where both play it say nothing). Over many mirror games between two AIs.
// Usage: DECK=mixed|keywords|classic GAMES=3000 node tools/cardstat.js
const Core = require('../src/core.js');
const GAMES = +(process.env.GAMES || 2000);
const mode = process.env.DECK || 'mixed';
const stat = {};
let games = 0, rounds = 0;
for (let k = 0; k < GAMES; k++) {
  const G = Core.newGame(Core.mulberry32(9000 + k), { deckMode: mode });
  G.foeBonus = 0; Core.startRound(G);
  const seen = { you: new Set(), foe: new Set() };
  let guard = 0;
  while (G.phase !== 'over' && guard++ < 40) {
    for (const p of Core.aiPlan(G, 'you')) { seen.you.add(p.card.def); Core.playCard(G, p.card.uid, p.cell); }
    for (const p of G.plan) seen.foe.add(p.card.def);
    for (const ev of Core.resolveRound(G)) { /* run */ }
  }
  if (!G.over || G.over.winner === 'draw') continue;
  games++; rounds += G.round;
  const w = G.over.winner, l = w === 'you' ? 'foe' : 'you';
  for (const id of new Set([...seen.you, ...seen.foe])) {
    const byW = seen[w].has(id), byL = seen[l].has(id);
    if (byW === byL) continue;
    const s = stat[id] = stat[id] || { w: 0, l: 0 };
    if (byW) s.w++; else s.l++;
  }
}
const byId = Object.fromEntries(Core.POOL.map(d => [d.id, d]));
const rows = Object.entries(stat).map(([id, s]) => ({ id, n: s.w + s.l, wr: s.w / (s.w + s.l) })).sort((a, b) => b.wr - a.wr);
console.log(`mode=${mode} games=${games} avg rounds=${(rounds / games).toFixed(1)}`);
for (const r of rows) {
  const d = byId[r.id];
  console.log(`${String(d.num || '-').padStart(2)} ${d.name.padEnd(17)} ${d.cost}c ${String(d.power).padStart(2)}p  win ${(r.wr * 100).toFixed(0)}%  (n=${r.n})`);
}
