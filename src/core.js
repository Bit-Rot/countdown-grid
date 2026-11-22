/* Countdown Grid v2 - two grids, pure game logic (no DOM).
   Each side owns a 3x4 grid. Cell index i = row*4 + col, row 0 is the FRONT row (nearest the other side).
   Cell labels are the same on both grids (A1 = front-left), so a card's "opposite" card is the one at the same label across the table. */
const Core = (function () {
  'use strict';
  const COLS = 4, ROWS = 3, N = COLS * ROWS;
  const WIN = 100, HAND_MAX = 6, START_HAND = 3, ENERGY_CAP = 6;

  // timer = rounds between firings (a tick happens at the end of every round). Both sides play this same 12-card deck.
  const DECK = [
    { id: 'fledgling', name: 'Fledgling', cost: 1, power: 1, timer: 2, fx: { t: 'buffSelf', n: 1 } },
    { id: 'duelist', name: 'Duelist', cost: 1, power: 2, timer: 3, fx: { t: 'hitOpposite', n: 2 } },
    { id: 'marksman', name: 'Marksman', cost: 2, power: 2, timer: 2, fx: { t: 'hitTop', n: 1 } },
    { id: 'frostcaller', name: 'Frostcaller', cost: 2, power: 2, timer: 3, fx: { t: 'slowRow', n: 1 } },
    { id: 'conjurer', name: 'Sand Conjurer', cost: 2, power: 2, timer: 3, fx: { t: 'spawn', token: 'Sandling', tokenPower: 4 } },
    { id: 'herald', name: 'Herald', cost: 2, power: 2, timer: 3, fx: { t: 'buffAdj', n: 2 } },
    { id: 'drillmaster', name: 'Drillmaster', cost: 3, power: 3, timer: 2, fx: { t: 'buffCol', n: 1 } },
    { id: 'pikeman', name: 'Pikeman', cost: 3, power: 3, timer: 3, fx: { t: 'hitCol', n: 2 } },
    { id: 'treasurer', name: 'Treasurer', cost: 3, power: 2, timer: 2, fx: { t: 'score', n: 4 } },
    { id: 'chronomancer', name: 'Chronomancer', cost: 3, power: 3, timer: 3, fx: { t: 'hasten' } },
    { id: 'warlord', name: 'Warlord', cost: 4, power: 3, timer: 3, fx: { t: 'buffRow', n: 2 } },
    { id: 'troll', name: 'Troll', cost: 5, power: 5, timer: 3, fx: { t: 'buffSelf', n: 4 } },
  ];
  const HEROES = DECK, VILLAINS = DECK;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const other = s => (s === 'you' ? 'foe' : 'you');
  const cellName = i => 'ABCD'[i % COLS] + (Math.floor(i / COLS) + 1);
  const rowOf = i => Math.floor(i / COLS);
  const colOf = i => i % COLS;
  function neighbors(i) {
    const r = rowOf(i), c = colOf(i), out = [];
    if (r > 0) out.push(i - COLS);
    if (r < ROWS - 1) out.push(i + COLS);
    if (c > 0) out.push(i - 1);
    if (c < COLS - 1) out.push(i + 1);
    return out;
  }
  function rowCells(i) { const r = rowOf(i), out = []; for (let c = 0; c < COLS; c++) out.push(r * COLS + c); return out; }
  function colCells(i) { const c = colOf(i), out = []; for (let r = 0; r < ROWS; r++) out.push(r * COLS + c); return out; }

  function fxText(card) {
    if (!card.fx) return 'No effect.';
    const f = card.fx, n = f.n;
    const t = card.timerBase != null ? card.timerBase : card.timer;
    let s = '';
    switch (f.t) {
      case 'buffSelf': s = `+${n} power to itself`; break;
      case 'buffAdj': s = `+${n} power to adjacent friendly cards`; break;
      case 'buffRow': s = `+${n} power to other friendly cards in its row`; break;
      case 'buffCol': s = `+${n} power to other friendly cards in its column`; break;
      case 'hitOpposite': s = `−${n} power to the card opposite it`; break;
      case 'hitRow': s = `−${n} power to every opposing card in the opposite row`; break;
      case 'hitCol': s = `−${n} power to every opposing card in the opposite column`; break;
      case 'hitTop': s = `−${n} power to the strongest opposing card (ties go to the front row, then left to right)`; break;
      case 'hitAll': s = `−${n} power to every opposing card`; break;
      case 'drainOpposite': s = `drains ${n} power from the card opposite it and keeps it`; break;
      case 'slowRow': s = `adds ${n} to the timers of every opposing card in the opposite row`; break;
      case 'score': s = `scores ${n} points`; break;
      case 'spawn': s = `creates a ${f.tokenPower || 1}-power ${f.token || 'Drone'} in an empty adjacent cell`; break;
      case 'hasten': s = `takes 1 off the timers of other friendly cards (minimum 1)`; break;
    }
    return (t === 1 ? 'Every tick: ' : `Every ${t} ticks: `) + s + '.';
  }
  function fxShort(card) {
    if (!card.fx) return 'no effect';
    const f = card.fx, n = f.n;
    switch (f.t) {
      case 'buffSelf': return `+${n} self`;
      case 'buffAdj': return `+${n} adjacent`;
      case 'buffRow': return `+${n} row`;
      case 'buffCol': return `+${n} column`;
      case 'hitOpposite': return `−${n} opposite`;
      case 'hitRow': return `−${n} opposite row`;
      case 'hitCol': return `−${n} opposite col`;
      case 'hitTop': return `−${n} top foe`;
      case 'hitAll': return `−${n} all foes`;
      case 'drainOpposite': return `drain ${n} opposite`;
      case 'slowRow': return 'slow opposite row';
      case 'score': return `+${n} points`;
      case 'spawn': return 'spawn ' + (f.token || 'Drone');
      case 'hasten': return 'haste allies';
    }
    return '';
  }

  function makeCard(G, def, owner) {
    return {
      uid: ++G.uid, def: def.id, name: def.name, cost: def.cost,
      base: def.power, power: def.power,
      timerBase: def.timer, timer: def.timer, fx: def.fx,
      owner, seq: 0, token: false,
    };
  }
  function makeToken(G, name, owner, power) {
    power = power || 1;
    return {
      uid: ++G.uid, def: 'token', name, cost: 0, base: power, power,
      timerBase: null, timer: null, fx: null, owner, seq: ++G.seq, token: true,
    };
  }
  function shuffle(G, a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(G.rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function log(G, side, text) {
    G.log.push({ round: G.round, side, text });
    if (G.log.length > 200) G.log.shift();
  }
  function draw(G, side) {
    const S = G.side[side];
    if (!S.deck.length && S.discard.length) { S.deck = shuffle(G, S.discard); S.discard = []; }
    if (!S.deck.length) return null;
    const c = S.deck.pop();
    if (S.hand.length >= HAND_MAX) { S.discard.push(c); return null; }
    S.hand.push(c);
    return c;
  }

  function newGame(rnd) {
    const G = {
      rnd: rnd || Math.random, uid: 0, seq: 0, round: 0, phase: 'idle', over: null, foeBonus: 0,
      side: {}, boards: { you: new Array(N).fill(null), foe: new Array(N).fill(null) },
      plan: [], undo: [], log: [],
    };
    for (const [side, defs] of [['you', HEROES], ['foe', VILLAINS]]) {
      const S = { score: 0, energy: 0, deck: [], hand: [], discard: [] };
      G.side[side] = S;
      S.deck = shuffle(G, defs.map(d => makeCard(G, d, side)));
      for (let k = 0; k < START_HAND; k++) draw(G, side);
    }
    return G;
  }
  const energyMax = G => Math.min(Math.max(G.round, 1), ENERGY_CAP);

  function startRound(G) {
    G.round++;
    for (const side of ['you', 'foe']) {
      G.side[side].energy = Math.max(1, energyMax(G) + (side === 'foe' ? (G.foeBonus || 0) : 0));
      draw(G, side);
    }
    G.plan = aiPlan(G, 'foe');
    G.undo = [];
    G.phase = 'plan';
    log(G, 'sys', `Round ${G.round} begins.`);
  }

  // ---------- AI ----------
  function cellValue(G, card, i, side) {
    const opp = other(side), f = card.fx, T = card.timerBase;
    const mine = G.boards[side], theirs = G.boards[opp];
    const fires = 4 / T;
    let allies = 0, empty = 0;
    for (const j of neighbors(i)) { if (!mine[j]) empty++; else allies++; }
    const rowAllies = rowCells(i).filter(j => j !== i && mine[j]).length;
    const colAllies = colCells(i).filter(j => j !== i && mine[j]).length;
    const oppCount = theirs.filter(Boolean).length;
    const allyCount = mine.filter(Boolean).length;
    const opposite = theirs[i];
    const rowOpp = rowCells(i).filter(j => theirs[j]).length;
    const colOpp = colCells(i).filter(j => theirs[j]).length;
    let v = card.power;
    switch (f.t) {
      case 'buffSelf': v += f.n * fires; break;
      case 'buffAdj': v += f.n * fires * (allies + 0.5 * empty); break;
      case 'buffRow': v += f.n * fires * (rowAllies + 1) * 0.8; break;
      case 'buffCol': v += f.n * fires * (colAllies + 0.7); break;
      case 'hitOpposite': v += f.n * fires * (opposite ? 1.3 + (opposite.power <= f.n ? 0.8 : 0) : 0.3); break;
      case 'hitRow': v += f.n * fires * (rowOpp * 1.1 + 0.3); break;
      case 'hitCol': v += f.n * fires * (colOpp * 1.1 + 0.3); break;
      case 'hitTop': v += f.n * fires * (oppCount > 0 ? 1.5 : 0); break;
      case 'hitAll': v += f.n * fires * oppCount * 0.9; break;
      case 'drainOpposite': v += f.n * fires * (opposite ? 2.2 : 0.4); break;
      case 'slowRow': v += fires * (rowOpp + 0.2); break;
      case 'score': v += f.n * fires; break;
      case 'spawn': v += (f.tokenPower || 1) * 1.5 * fires * (empty > 0 ? 1 : 0); break;
      case 'hasten': v += fires * allyCount * 0.8; break;
    }
    // avoid sitting where the opponent's attackers will hit
    for (let j = 0; j < N; j++) {
      const a = theirs[j];
      if (!a || !a.fx) continue;
      const af = a.fx, rate = 4 / a.timerBase;
      if ((af.t === 'hitOpposite' || af.t === 'drainOpposite') && j === i) v -= af.n * rate * 0.5;
      else if (af.t === 'hitRow' && rowOf(j) === rowOf(i)) v -= af.n * rate * 0.4;
      else if (af.t === 'hitCol' && colOf(j) === colOf(i)) v -= af.n * rate * 0.4;
    }
    return v;
  }
  function aiPlan(G, side) {
    const S = G.side[side];
    let energy = S.energy;
    const hand = S.hand.slice();
    const reserved = new Set();
    const plan = [];
    const empties = [];
    for (let i = 0; i < N; i++) if (!G.boards[side][i]) empties.push(i);
    for (;;) {
      let best = null;
      for (const card of hand) {
        if (card.cost > energy) continue;
        for (const i of empties) {
          if (reserved.has(i)) continue;
          const v = cellValue(G, card, i, side) + card.cost * 0.35 + G.rnd() * 0.6;
          if (!best || v > best.v) best = { card, i, v };
        }
      }
      if (!best || best.v < 1.5) break;
      plan.push({ card: best.card, cell: best.i, placed: false });
      energy -= best.card.cost;
      reserved.add(best.i);
      hand.splice(hand.indexOf(best.card), 1);
    }
    return plan;
  }

  // ---------- player actions ----------
  function playCard(G, uid, cell) {
    if (G.phase !== 'plan') return null;
    const S = G.side.you;
    const idx = S.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return null;
    const card = S.hand[idx];
    if (card.cost > S.energy || G.boards.you[cell]) return null;
    S.hand.splice(idx, 1);
    S.energy -= card.cost;
    card.seq = ++G.seq;
    G.boards.you[cell] = card;
    G.undo.push({ card, cell, idx });
    log(G, 'you', `You play ${card.name} at ${cellName(cell)}.`);
    return { card };
  }
  function undoPlay(G) {
    if (G.phase !== 'plan' || !G.undo.length) return false;
    const u = G.undo.pop();
    G.boards.you[u.cell] = null;
    G.side.you.hand.splice(Math.min(u.idx, G.side.you.hand.length), 0, u.card);
    G.side.you.energy += u.card.cost;
    log(G, 'you', `You take back ${u.card.name}.`);
    return true;
  }

  // ---------- effects (fully deterministic so the forecast is exact) ----------
  function cleanupDead(G, marks) {
    for (const side of ['you', 'foe']) {
      for (let j = 0; j < N; j++) {
        const t = G.boards[side][j];
        if (t && t.power <= 0) {
          G.boards[side][j] = null;
          if (!t.token) { t.power = t.base; t.timer = t.timerBase; G.side[side].discard.push(t); }
          marks.push({ side, cell: j, kind: 'destroy', text: '✕' });
          log(G, side, `${t.name} (${cellName(j)}) is destroyed.`);
        }
      }
    }
  }

  // Targets are LOCKED at the start of each tick (after the enemy's plays land and timers drop, before any effect fires).
  // Each firing card then acts only on the cards it locked onto, so earlier effects in the same tick never redirect it.
  function lockTargets(G, side, i, card) {
    return effectArea(G, side, i, card).map(a => {
      const t = G.boards[a.side][a.cell];
      return { side: a.side, cell: a.cell, uid: t ? t.uid : null };
    });
  }

  function fire(G, me, i, locks) {
    const opp = other(me), mine = G.boards[me];
    const c = mine[i], f = c.fx;
    const marks = [{ side: me, cell: i, kind: 'fire', text: '' }];
    const where = cellName(i);
    const hurt = (side, j, n) => { G.boards[side][j].power -= n; marks.push({ side, cell: j, kind: 'hurt', text: '−' + n }); };
    const buff = (side, j, n) => { G.boards[side][j].power += n; marks.push({ side, cell: j, kind: 'buff', text: '+' + n }); };
    const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    // locked cards that are still on the board, in the same cell
    const alive = locks.filter(a => { const t = G.boards[a.side][a.cell]; return a.uid != null && t && t.uid === a.uid; });
    const locked = locks.filter(a => a.uid != null).length;
    const gone = locked - alive.length;
    const goneNote = gone ? ` (${gone} locked target${gone === 1 ? ' was' : 's were'} already destroyed)` : '';
    let msg = '';

    switch (f.t) {
      case 'buffSelf': buff(me, i, f.n); msg = `${c.name} (${where}) grows by ${f.n}.`; break;
      case 'buffAdj':
        alive.forEach(a => buff(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) gives +${f.n} to ${plural(alive.length, 'adjacent card')}.${goneNote}`; break;
      case 'buffRow':
        alive.forEach(a => buff(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) gives +${f.n} to ${plural(alive.length, 'card')} in its row.${goneNote}`; break;
      case 'buffCol':
        alive.forEach(a => buff(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) gives +${f.n} to ${plural(alive.length, 'card')} in its column.${goneNote}`; break;
      case 'hitOpposite':
        if (!locked) { msg = `${c.name} (${where}) has nothing opposite it.`; break; }
        if (!alive.length) { msg = `${c.name} (${where}) lost its target before firing.`; break; }
        msg = `${c.name} (${where}) hits ${G.boards[opp][alive[0].cell].name} for ${f.n}.`; hurt(opp, alive[0].cell, f.n); break;
      case 'hitRow':
        alive.forEach(a => hurt(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) hits ${plural(alive.length, 'card')} in the opposite row for ${f.n}.${goneNote}`; break;
      case 'hitCol':
        alive.forEach(a => hurt(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) hits ${plural(alive.length, 'card')} in the opposite column for ${f.n}.${goneNote}`; break;
      case 'hitTop':
        if (!locked) { msg = `${c.name} (${where}) finds no target.`; break; }
        if (!alive.length) { msg = `${c.name} (${where}) lost its target before firing.`; break; }
        msg = `${c.name} (${where}) hits ${G.boards[opp][alive[0].cell].name} (${cellName(alive[0].cell)}) for ${f.n}.`; hurt(opp, alive[0].cell, f.n); break;
      case 'hitAll':
        alive.forEach(a => hurt(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) hits ${plural(alive.length, 'opposing card')} for ${f.n}.${goneNote}`; break;
      case 'drainOpposite': {
        if (!locked) { msg = `${c.name} (${where}) has nothing to drain.`; break; }
        if (!alive.length) { msg = `${c.name} (${where}) lost its target before firing.`; break; }
        const t = G.boards[opp][alive[0].cell];
        const amt = Math.min(f.n, t.power);
        msg = `${c.name} (${where}) drains ${amt} from ${t.name}.`;
        hurt(opp, alive[0].cell, amt); buff(me, i, amt); break;
      }
      case 'slowRow': {
        const t = alive.filter(a => G.boards[a.side][a.cell].timer != null);
        t.forEach(a => { G.boards[a.side][a.cell].timer += f.n; marks.push({ side: a.side, cell: a.cell, kind: 'slow', text: '⏱+' + f.n }); });
        msg = `${c.name} (${where}) slows ${plural(t.length, 'card')} in the opposite row.${goneNote}`; break;
      }
      case 'score':
        G.side[me].score += f.n; marks.push({ side: me, cell: i, kind: 'score', text: '+' + f.n });
        msg = `${c.name} (${where}) scores ${f.n} points.`; break;
      case 'spawn': {
        if (!locks.length) { msg = `${c.name} (${where}) has no room to spawn.`; break; }
        const j = locks[0].cell;
        if (mine[j]) { msg = `${c.name} (${where}) found its spawn cell ${cellName(j)} taken.`; break; }
        mine[j] = makeToken(G, f.token || 'Drone', me, f.tokenPower);
        marks.push({ side: me, cell: j, kind: 'place', text: '+' + mine[j].power });
        msg = `${c.name} (${where}) creates a ${mine[j].name} at ${cellName(j)}.`; break;
      }
      case 'hasten': {
        const t = alive.filter(a => G.boards[a.side][a.cell].timer != null && G.boards[a.side][a.cell].timer > 1);
        t.forEach(a => { G.boards[a.side][a.cell].timer -= 1; marks.push({ side: a.side, cell: a.cell, kind: 'buff', text: '⏱−1' }); });
        msg = `${c.name} (${where}) speeds up ${plural(t.length, 'friendly timer')}.`; break;
      }
    }
    if (G.targetLog) G.targetLog.set(c.uid, alive.map(a => a.side + ':' + a.cell));
    log(G, me, msg);
    cleanupDead(G, marks);
    return { marks };
  }

  // ---------- round resolution (generator: yields after each visible step) ----------
  function* resolveRound(G) {
    G.phase = 'resolving';
    G.lastGain = null;
    yield { type: 'begin' };

    // 1. the enemy's telegraphed plays are made
    for (const p of G.plan) {
      const S = G.side.foe;
      const idx = S.hand.indexOf(p.card);
      if (idx < 0 || G.boards.foe[p.cell]) continue;
      S.hand.splice(idx, 1);
      S.energy -= p.card.cost;
      p.card.seq = ++G.seq;
      G.boards.foe[p.cell] = p.card;
      p.placed = true;
      log(G, 'foe', `Enemy plays ${p.card.name} at ${cellName(p.cell)}.`);
      yield { type: 'place', marks: [{ side: 'foe', cell: p.cell, kind: 'place', text: '' }], ms: 'place' };
    }

    // 2. all timers tick at once, then ready cards fire in placement order
    const live = [];
    for (const side of ['you', 'foe']) for (const c of G.boards[side]) if (c) live.push(c);
    live.sort((a, b) => a.seq - b.seq);
    const ready = [];
    for (const c of live) {
      if (c.timer == null) continue;
      c.timer -= 1;
      if (c.timer <= 0) ready.push(c);
    }
    // lock every ready card's targets now, before any effect in this tick resolves
    const locks = new Map();
    for (const c of ready) {
      const i = G.boards[c.owner].indexOf(c);
      if (i >= 0) locks.set(c.uid, lockTargets(G, c.owner, i, c));
    }
    yield { type: 'tick', ms: 'tick' };

    for (const c of ready) {
      const i = G.boards[c.owner].indexOf(c);
      if (i < 0) { log(G, c.owner, `${c.name} was destroyed before its effect fired.`); continue; }
      if (c.timer > 0) {
        log(G, c.owner, `${c.name} (${cellName(i)}) was delayed.`);
        yield { type: 'delayed', marks: [{ side: c.owner, cell: i, kind: 'slow', text: 'delayed' }], ms: 'fire' };
        continue;
      }
      const r = fire(G, c.owner, i, locks.get(c.uid) || []);
      c.timer = c.timerBase;
      if (G.fired) G.fired.add(c.uid);
      yield { type: 'fire', marks: r.marks, ms: 'fire' };
    }

    // 3. score: each side banks the total power on its own grid
    const gain = { you: 0, foe: 0 };
    for (const side of ['you', 'foe']) for (const c of G.boards[side]) if (c) gain[side] += c.power;
    G.side.you.score += gain.you;
    G.side.foe.score += gain.foe;
    G.lastGain = gain;
    log(G, 'sys', `Scoring: you +${gain.you}, enemy +${gain.foe}.`);
    yield { type: 'score', gain, ms: 'score' };

    const y = G.side.you.score, f = G.side.foe.score;
    if (y >= WIN || f >= WIN) {
      const winner = y > f ? 'you' : f > y ? 'foe' : (gain.you > gain.foe ? 'you' : gain.foe > gain.you ? 'foe' : 'draw');
      G.over = { winner };
      G.phase = 'over';
      log(G, 'sys', winner === 'draw' ? 'The game is a draw.' : winner === 'you' ? 'You win!' : 'The enemy wins.');
      yield { type: 'over' };
      return;
    }
    startRound(G);
    yield { type: 'round' };
  }

  // ---------- targeting queries (used for hover highlights) ----------
  // The board as it will be once the enemy's telegraphed plays land (what targets are locked against).
  function previewBoards(G) {
    const B = { you: G.boards.you.slice(), foe: G.boards.foe.slice() };
    for (const p of G.plan) if (!p.placed && !B.foe[p.cell]) B.foe[p.cell] = p.card;
    return B;
  }
  // Cells a card's effect would touch at the next tick, as [{side, cell}]. Pass B (previewBoards) to include telegraphed cards.
  function effectArea(G, side, i, card, B) {
    const f = card.fx;
    if (!f) return [];
    B = B || G.boards;
    const opp = other(side), mine = B[side], theirs = B[opp];
    const own = js => js.map(j => ({ side, cell: j }));
    const their = js => js.map(j => ({ side: opp, cell: j }));
    const all = [...Array(N).keys()];
    switch (f.t) {
      case 'buffAdj': return own(neighbors(i));
      case 'buffRow': return own(rowCells(i).filter(j => j !== i));
      case 'buffCol': return own(colCells(i).filter(j => j !== i));
      case 'hitOpposite': case 'drainOpposite': return their([i]);
      case 'hitRow': case 'slowRow': return their(rowCells(i));
      case 'hitCol': return their(colCells(i));
      case 'hitTop': {
        let top = -1;
        for (let j = 0; j < N; j++) if (theirs[j] && (top < 0 || theirs[j].power > theirs[top].power)) top = j;
        return top < 0 ? [] : their([top]);
      }
      case 'hitAll': return their(all.filter(j => theirs[j]));
      case 'spawn': { const j = neighbors(i).find(k => !mine[k]); return j == null ? [] : own([j]); }
      case 'hasten': return own(all.filter(j => j !== i && mine[j] && mine[j].timer != null));
      default: return [];
    }
  }
  // Every other card (placed, or telegraphed by the enemy) whose effect would touch cell (side, i).
  function influences(G, side, i) {
    const out = [], B = previewBoards(G);
    for (const s of ['you', 'foe']) for (let j = 0; j < N; j++) {
      const c = B[s][j];
      if (!c || (s === side && j === i)) continue;
      if (effectArea(G, s, j, c, B).some(a => a.side === side && a.cell === i)) out.push({ side: s, cell: j, hostile: s !== side });
    }
    return out;
  }

  // ---------- forecast: dry-run the round on a copy ----------
  function clonePreview(G) {
    const map = new Map();
    const cp = c => { if (!c) return null; if (map.has(c)) return map.get(c); const d = Object.assign({}, c); map.set(c, d); return d; };
    const C = {
      rnd: G.rnd, uid: G.uid, seq: G.seq, round: G.round, phase: 'plan', over: null, log: [], undo: [],
      fired: new Set(), side: {},
      boards: { you: G.boards.you.map(cp), foe: G.boards.foe.map(cp) },
    };
    for (const s of ['you', 'foe']) {
      const S = G.side[s];
      C.side[s] = { score: S.score, energy: S.energy, deck: [], hand: S.hand.map(cp), discard: [] };
    }
    C.plan = G.plan.map(p => Object.assign({}, p, { card: cp(p.card) }));
    return C;
  }
  function forecast(G) {
    if (G.phase !== 'plan') return null;
    const C = clonePreview(G);
    const before = new Map();
    for (const s of ['you', 'foe']) G.boards[s].forEach((c, i) => { if (c) before.set(c.uid, { p0: c.power }); });
    for (const p of G.plan) before.set(p.card.uid, { p0: p.card.power });
    let gain = { you: 0, foe: 0 };
    for (const ev of resolveRound(C)) { if (ev.type === 'score') { gain = ev.gain; break; } }
    const present = new Map();
    for (const s of ['you', 'foe']) C.boards[s].forEach((c, i) => { if (c) present.set(c.uid, { side: s, cell: i, c }); });
    const out = { byUid: {}, spawn: [], gain, after: { you: C.side.you.score, foe: C.side.foe.score } };
    for (const [uid, b] of before) {
      const now = present.get(uid);
      out.byUid[uid] = { p0: b.p0, p1: now ? now.c.power : 0, dies: !now, fires: C.fired.has(uid) };
    }
    for (const [uid, n] of present) if (!before.has(uid)) out.spawn.push({ side: n.side, cell: n.cell, name: n.c.name });
    return out;
  }

  const api = {
    COLS, ROWS, N, WIN, HAND_MAX, ENERGY_CAP, HEROES, VILLAINS,
    mulberry32, other, cellName, rowOf, colOf, neighbors, rowCells, colCells, fxText, fxShort, energyMax,
    newGame, startRound, aiPlan, cellValue, playCard, undoPlay, resolveRound, forecast, effectArea, influences, previewBoards,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
