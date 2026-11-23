// Unit checks for the keyword mechanics. Run: node tools/mechtest.js
const Core = require('../src/core.js');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL:', msg); } };

function game() {
  const G = Core.newGame(Core.mulberry32(1), { deckMode: 'classic' });
  Core.startRound(G); G.plan = []; G.phase = 'plan';
  for (const s of ['you', 'foe']) { const S = G.side[s]; S.hand = []; S.deck = []; S.discard = []; S.energy = 10; }
  return G;
}
const def = id => Core.POOL.find(d => d.id === id);
const put = (G, side, id, cell) => { const c = Core.makeCard(G, def(id), side); c.seq = ++G.seq; G.boards[side][cell] = c; return c; };
const hand = (G, id) => { const c = Core.makeCard(G, def(id), 'you'); G.side.you.hand.push(c); return c; };
const tick = G => { for (const ev of Core.resolveRound(G)) { if (ev.type === 'score') break; } };

// --- Shield ---
{
  const G = game(); const t = put(G, 'foe', 'bulwark', 0); // Shield, 3 power
  const bolt1 = hand(G, 'bolt'); Core.playCard(G, bolt1.uid, 0);
  ok(t.power === def('bulwark').power && !t.shield, 'shield blocks the first hit and is spent');
  const bolt2 = hand(G, 'bolt'); Core.playCard(G, bolt2.uid, 0);
  ok(!G.boards.foe[0], 'a second hit lands (3 damage kills the 3-power card)');
}
{
  const G = game(); const t = put(G, 'foe', 'stoneguard', 0);
  const a = hand(G, 'assassin'); const A = put(G, 'you', 'assassin', 0); A.timer = 1;
  tick(G);
  ok(G.boards.foe[0] && !G.boards.foe[0].shield, 'shield blocks destroy');
}
{
  const G = game(); const t = put(G, 'foe', 'stoneguard', 0); const m = put(G, 'you', 'gagwitch', 0); m.timer = 1;
  tick(G);
  ok(t.silenced === 0 && !t.shield, 'shield blocks silence');
  const f = put(G, 'foe', 'frostcaller', 1); const c = put(G, 'you', 'frostcaller', 1); c.timer = 1; const before = f.timer;
  f.shield = true; tick(G);
  ok(f.timer === f.timerBase - 1 + 0 || f.shield === false, 'shield blocks slow');
}
// --- Glass ---
{
  const G = game(); const g = put(G, 'foe', 'golem', 0);
  const b = hand(G, 'bolt'); Core.playCard(G, b.uid, 0);
  ok(!G.boards.foe[0], 'glass dies to any hit');
  const G2 = game(); const g2 = put(G2, 'foe', 'golem', 0); g2.shield = true;
  const b2 = hand(G2, 'bolt'); Core.playCard(G2, b2.uid, 0);
  ok(G2.boards.foe[0] && !G2.boards.foe[0].shield, 'shield saves a glass card once');
  const G3 = game(); const g3 = put(G3, 'foe', 'golem', 0);
  const w = put(G3, 'you', 'gagwitch', 0); w.timer = 1; tick(G3);
  ok(!G3.boards.foe[0], 'glass dies to silence');
}
// --- Ephemeral ---
{
  const G = game(); const mine = put(G, 'you', 'herald', 4); const foe = put(G, 'foe', 'herald', 4);
  const b = hand(G, 'bolt'); const r = Core.playCard(G, b.uid, 4);
  ok(G.boards.you[4] === mine, 'ephemeral does not replace the card under it');
  ok(foe.power === 2 - 3 || !G.boards.foe[4], 'ephemeral hits the opposite card immediately');
  ok(G.side.you.discard.some(c => c.uid === b.uid) && !G.side.you.hand.includes(b), 'ephemeral goes to the discard');
}
{
  const G = game(); const a = put(G, 'you', 'fledgling', 0); const b = put(G, 'you', 'fledgling', 1); const c = put(G, 'you', 'fledgling', 5);
  const r = hand(G, 'rally'); Core.playCard(G, r.uid, 0);
  ok(a.power === 2 && b.power === 2 && c.power === 1, 'Rallying Cry buffs the whole row (including the cell it is cast on) and nothing else');
}
// --- Haste ---
{
  const G = game(); const foe = put(G, 'foe', 'troll', 2);
  const s = hand(G, 'skirmisher'); Core.playCard(G, s.uid, 2);
  ok(foe.power === 3, 'haste fires its effect on placement (5 - 2)');
  ok(G.boards.you[2] && G.boards.you[2].timer === def('skirmisher').timer, 'haste card keeps its full timer');
}
// --- Replacement, Consume, Edible, undo ---
{
  const G = game(); const old = put(G, 'you', 'warlord', 3);
  const g = hand(G, 'ghoul'); const r = Core.playCard(G, g.uid, 3);
  ok(G.boards.you[3] === g && g.power === def('ghoul').power + 3, 'consume gains the covered card power');
  ok(G.side.you.discard.includes(old) && old.power === old.base, 'covered card goes to discard, reset');
  Core.undoPlay(G);
  ok(G.boards.you[3] && G.boards.you[3].def === 'warlord' && G.boards.you[3].power === 3 && G.side.you.hand.some(c => c.def === 'ghoul') && G.side.you.energy === 10, 'undo restores the covered card, the hand and the energy');
}
{
  const G = game(); const n1 = put(G, 'you', 'fledgling', 1); const lamb = put(G, 'you', 'lamb', 0);
  const g = hand(G, 'ghoul'); Core.playCard(G, g.uid, 0);
  ok(n1.power === 3, 'edible lamb buffs adjacent cards when covered (1 + 2)');
  ok(g.power === def('ghoul').power + 1, 'consume takes the edible card power');
}
{
  const G = game(); const mimic = put(G, 'you', 'mimic', 0); const before = G.side.you.score;
  const w = hand(G, 'duelist'); Core.playCard(G, w.uid, 0);
  ok(G.side.you.score === before + 5, 'treasure mimic scores 5 when covered');
  const G2 = game(); put(G2, 'you', 'egg', 4); const w2 = hand(G2, 'duelist'); Core.playCard(G2, w2.uid, 4);
  ok(G2.boards.you.some(c => c && c.name === 'Hatchling' && c.power === 3), 'brood egg hatches a 3-power Hatchling when covered');
}
// --- Silence ---
{
  const G = game(); const wd = put(G, 'you', 'gagwitch', 0); wd.timer = 1; const foe = put(G, 'foe', 'treasurer', 0); foe.timer = 1;
  const before = G.side.foe.score;
  tick(G);
  ok(foe.silenced > 0 || G.boards.foe[0].silenced > 0, 'silence applies');
  ok(G.side.foe.score - before === foe.power, 'silenced card does not fire (score only from board power)');
}
// --- Destroy ---
{
  const G = game(); put(G, 'foe', 'fledgling', 0); const big = put(G, 'foe', 'troll', 1); const ex = put(G, 'you', 'executioner', 0); ex.timer = 1;
  tick(G);
  ok(!G.boards.foe[1] && G.boards.foe[0], 'destroyTop removes the strongest card regardless of power');
}
// --- Locked targets still hold with the new effects ---
{
  const G = game(); put(G, 'foe', 'warlord', 0); put(G, 'foe', 'herald', 2);
  const d = put(G, 'you', 'duelist', 0); d.timer = 1; const m = put(G, 'you', 'marksman', 5); m.timer = 1; G.targetLog = new Map();
  tick(G);
  ok((G.targetLog.get(m.uid) || [])[0] === 'foe:0', 'marksman keeps the target it locked at tick start');
}
console.log(`mechanics: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
