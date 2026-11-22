const Core = require('../src/core.js');

// 'ai'    = same heuristic as the enemy (does not look at the forecast)
// 'smart' = greedy 1-ply using the exact forecast, like an attentive human reading the screen
function aiTurn(G) {
  for (const p of Core.aiPlan(G, 'you')) Core.playCard(G, p.card.uid, p.cell);
}
function smartTurn(G) {
  for (;;) {
    const S = G.side.you;
    let best = null;
    for (const card of S.hand) {
      if (card.cost > S.energy) continue;
      for (let i = 0; i < Core.N; i++) {
        if (G.boards.you[i]) continue;
        const heur = Core.cellValue(G, card, i, 'you');
        Core.playCard(G, card.uid, i);
        const fc = Core.forecast(G);
        Core.undoPlay(G);
        const val = (fc.gain.you - fc.gain.foe) + 0.4 * heur;
        if (!best || val > best.val) best = { card, i, val };
      }
    }
    if (!best) break;
    Core.playCard(G, best.card.uid, best.i);
  }
}

function run(strategy, n) {
  let y = 0, f = 0, d = 0, margin = 0;
  const lens = [];
  for (let k = 0; k < n; k++) {
    const G = Core.newGame(Core.mulberry32(2000 + k));
    G.foeBonus = +(process.env.FB || 0);
    Core.startRound(G);
    let guard = 0;
    while (G.phase !== 'over' && guard++ < 60) {
      (strategy === 'smart' ? smartTurn : aiTurn)(G);
      for (const ev of Core.resolveRound(G)) { /* run to completion */ }
    }
    if (G.over) { if (G.over.winner === 'you') y++; else if (G.over.winner === 'foe') f++; else d++; }
    lens.push(G.round);
    margin += Math.abs(G.side.you.score - G.side.foe.score);
  }
  lens.sort((a, b) => a - b);
  console.log(`[${strategy}] FB=${process.env.FB || 0} games=${n} you=${y} foe=${f} draw=${d} | rounds median=${lens[n >> 1]} min=${lens[0]} max=${lens[n - 1]} | avg margin=${(margin / n).toFixed(1)}`);
}
run('ai', +(process.env.N || 300));
run('smart', +(process.env.NS || 100));
