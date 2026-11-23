// For one deck: how much does each card contribute? Each card is swapped, one at a time, for a plain vanilla card of the same cost
// (power = cost, no effect) and the deck plays the other decks (sides alternate). A big drop means the card carries the deck; a rise means it drags.
// Usage: GAMES=50 node tools/ablate.js <deckId>
const Core = require('../src/core.js');
const GAMES = +(process.env.GAMES || 50);
const deckId = process.argv[2];
const deck = Core.deckById(deckId);
if (!deck || deck.id !== deckId) { console.error('unknown deck', deckId); process.exit(1); }
const others = Core.DECKS.filter(d => d.id !== deckId);
const base = Core.deckDefs(deckId);

function rate(defs) {
  let w = 0, n = 0;
  others.forEach((o, oi) => {
    for (let g = 0; g < GAMES; g++) {
      const mine = g % 2 ? 'you' : 'foe';
      const decks = mine === 'you' ? { you: defs, foe: Core.deckDefs(o.id) } : { you: Core.deckDefs(o.id), foe: defs };
      const G = Core.newGame(Core.mulberry32(77000 + oi * 1000 + g), { decks, deckDefs: defs });
      G.foeBonus = 0; Core.startRound(G);
      let guard = 0;
      while (G.phase !== 'over' && guard++ < 40) {
        for (const p of Core.aiPlan(G, 'you')) Core.playCard(G, p.card.uid, p.cell);
        for (const ev of Core.resolveRound(G)) { /* run */ }
      }
      if (!G.over || G.over.winner === 'draw') continue;
      n++; if (G.over.winner === mine) w++;
    }
  });
  return w / n;
}
const b = rate(base);
console.log(`${deck.name} baseline ${(b * 100).toFixed(1)}%`);
const rows = [];
base.forEach((card, i) => {
  const van = { num: 0, id: 'vanilla', name: 'Vanilla', cost: card.cost, power: Math.max(1, card.cost), timer: null, fx: null, kw: [] };
  const defs = base.slice(); defs[i] = van;
  const r = rate(defs);
  rows.push({ card, drop: b - r });
});
rows.sort((a, b2) => b2.drop - a.drop);
for (const r of rows) console.log(`  ${r.card.name.padEnd(17)} ${r.card.cost}c  contributes ${r.drop >= 0 ? '+' : ''}${(r.drop * 100).toFixed(1)} pts`);
