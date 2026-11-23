/* Countdown Grid - two grids, pure game logic (no DOM).
   Each side owns a 3x4 grid. Cell index i = row*4 + col, row 0 is the FRONT row (nearest the other side).
   Cell labels are the same on both grids (A1 = front-left), so a card's "opposite" card is the one at the same label across the table.
   A card can always be placed on any cell of your own grid. Placing on an occupied cell replaces the card there. */
const Core = (function () {
  'use strict';
  const COLS = 4, ROWS = 3, N = COLS * ROWS;
  const WIN = 100, HAND_MAX = 6, START_HAND = 3, ENERGY_CAP = 6, DECK_SIZE = 12;

  // ---------- keywords ----------
  const KW_LABEL = { shield: 'Shield', ephemeral: 'Ephemeral', haste: 'Haste', glass: 'Glass', consume: 'Consume', edible: 'Edible' };
  const KW_ORDER = ['ephemeral', 'haste', 'shield', 'glass', 'consume', 'edible'];
  const KW_HELP = {
    shield: 'Shield: blocks the next negative effect aimed at this card (power loss, slow, silence or destroy), then goes away.',
    ephemeral: 'Ephemeral: when placed, its effect happens once, right away, and the card is gone. It never replaces the card under it and never scores.',
    haste: 'Haste: its effect also happens the moment it is placed.',
    glass: 'Glass: dies to any negative effect (power loss, slow, silence or destroy) that a Shield does not block.',
    consume: 'Consume: when placed over one of your cards, it gains that card’s power.',
    edible: 'Edible: when another card is placed over it, its effect happens once, right away.',
    destroy: 'Destroy: removes a card outright, whatever its power. A Shield blocks it.',
    silence: 'Silence X: the card’s text (its effect and its keywords) is removed for X ticks. A Shield blocks it.',
  };
  const NEGATIVE_FX = new Set(['hitOpposite', 'hitRow', 'hitCol', 'hitTop', 'hitAll', 'drainOpposite', 'slowRow',
    'destroyOpposite', 'destroyTop', 'destroyWeakest', 'silenceOpposite', 'silenceTop', 'silenceRow']);

  // ---------- cards ----------
  // timer = rounds between firings (a tick happens at the end of every round). null = no effect / no timer.
  const D = (num, id, name, cost, power, timer, fx, kw) => ({ num, id, name, cost, power, timer, fx, kw: kw || [] });

  const CLASSIC = [
    D(0, 'fledgling', 'Fledgling', 1, 1, 2, { t: 'buffSelf', n: 1 }),
    D(0, 'duelist', 'Duelist', 1, 2, 3, { t: 'hitOpposite', n: 2 }),
    D(0, 'marksman', 'Marksman', 2, 2, 2, { t: 'hitTop', n: 1 }),
    D(0, 'frostcaller', 'Frostcaller', 2, 2, 3, { t: 'slowRow', n: 1 }),
    D(0, 'conjurer', 'Sand Conjurer', 2, 2, 3, { t: 'spawn', token: 'Sandling', tokenPower: 4 }),
    D(0, 'herald', 'Herald', 2, 2, 3, { t: 'buffAdj', n: 2 }),
    D(0, 'drillmaster', 'Drillmaster', 3, 3, 2, { t: 'buffCol', n: 1 }),
    D(0, 'pikeman', 'Pikeman', 3, 3, 3, { t: 'hitCol', n: 2 }),
    D(0, 'treasurer', 'Treasurer', 3, 2, 2, { t: 'score', n: 4 }),
    D(0, 'chronomancer', 'Chronomancer', 3, 3, 3, { t: 'hasten' }),
    D(0, 'warlord', 'Warlord', 4, 3, 3, { t: 'buffRow', n: 2 }),
    D(0, 'troll', 'Troll', 5, 5, 3, { t: 'buffSelf', n: 4 }),
  ];
  // The 24 keyword cards, numbered 1-24, three per mechanic.
  const NEW = [
    // Shield
    D(1, 'bulwark', 'Bulwark', 2, 2, 3, { t: 'buffAdj', n: 1 }, ['shield']),
    D(2, 'aegis', 'Aegis Priest', 3, 4, 2, { t: 'shieldAdj' }),
    D(3, 'stoneguard', 'Stoneguard', 4, 4, 3, { t: 'hitOpposite', n: 2 }, ['shield']),
    // Ephemeral (spells: they resolve when placed, then vanish)
    D(4, 'bolt', 'Lightning Bolt', 2, 0, null, { t: 'hitOpposite', n: 3 }, ['ephemeral']),
    D(5, 'rally', 'Rallying Cry', 1, 0, null, { t: 'buffRow', n: 1 }, ['ephemeral']),
    D(6, 'plague', 'Plague Wind', 5, 0, null, { t: 'hitAll', n: 1 }, ['ephemeral']),
    // Haste
    D(7, 'skirmisher', 'Skirmisher', 2, 1, 4, { t: 'hitOpposite', n: 2 }, ['haste']),
    D(8, 'smuggler', 'Smuggler', 2, 2, 3, { t: 'score', n: 5 }, ['haste']),
    D(9, 'stormcaller', 'Stormcaller', 5, 3, 4, { t: 'hitRow', n: 1 }, ['haste']),
    // Destroy
    D(10, 'assassin', 'Assassin', 2, 3, 4, { t: 'destroyOpposite' }),
    D(11, 'executioner', 'Executioner', 4, 4, 3, { t: 'destroyTop' }),
    D(12, 'reaper', 'Reaper', 2, 3, 5, { t: 'destroyWeakest' }),
    // Glass
    D(13, 'glasscannon', 'Glass Cannon', 2, 4, 3, { t: 'hitOpposite', n: 1 }, ['glass']),
    D(14, 'golem', 'Crystal Golem', 4, 6, null, null, ['glass']),
    D(15, 'seer', 'Prism Seer', 3, 3, 2, { t: 'buffSelf', n: 2 }, ['glass']),
    // Consume
    D(16, 'ghoul', 'Ghoul', 2, 3, 3, { t: 'buffSelf', n: 1 }, ['consume']),
    D(17, 'devourer', 'Devourer', 3, 3, 3, { t: 'hitOpposite', n: 2 }, ['consume']),
    D(18, 'glutton', 'Ogre Glutton', 3, 4, null, null, ['consume']),
    // Edible
    D(19, 'lamb', 'Sacrificial Lamb', 1, 1, 3, { t: 'buffAdj', n: 2 }, ['edible']),
    D(20, 'mimic', 'Treasure Mimic', 2, 3, 3, { t: 'score', n: 5 }, ['edible']),
    D(21, 'egg', 'Brood Egg', 1, 1, 3, { t: 'spawn', token: 'Hatchling', tokenPower: 3 }, ['edible']),
    // Silence
    D(22, 'gagwitch', 'Gag Witch', 2, 3, 3, { t: 'silenceOpposite', n: 2 }),
    D(23, 'nullmage', 'Null Mage', 3, 3, 3, { t: 'silenceTop', n: 3 }),
    D(24, 'hushpriest', 'Hush Priest', 3, 3, 3, { t: 'silenceRow', n: 2 }),
  ];
  const POOL = CLASSIC.concat(NEW);
  const HEROES = CLASSIC, VILLAINS = CLASSIC; // kept as aliases for older tools
  const BY_ID = Object.fromEntries(POOL.map(d => [d.id, d]));

  // ---------- decks ----------
  // Every deck is exactly 12 DIFFERENT cards (the Starter deck has 12 distinct cards, so the same limit applies to all decks).
  const DECK_SIZE_RULE = 12;
  /*THEMED_DECKS_BEGIN*/
  const THEMED = [
    { id: "fortress", name: "Iron Bastion", theme: "Shielded blockers and Aegis Priest keep a growing board alive while Stoneguard, Troll and Warlord grind out points, but it is slow to start and has little burst or removal.",
      cards: ['fledgling', 'duelist', 'bulwark', 'herald', 'marksman', 'aegis', 'treasurer', 'drillmaster', 'hushpriest', 'stoneguard', 'warlord', 'troll'] },
    { id: "silence", name: "Hushed Court", theme: "Silence and timer delays shut down the opponent's best cards while cheap engines tick up, but the low-power board scores slowly and loses to fast aggro.",
      cards: ['fledgling', 'duelist', 'gagwitch', 'frostcaller', 'marksman', 'herald', 'nullmage', 'hushpriest', 'treasurer', 'pikeman', 'warlord', 'troll'] },
    { id: "assassin", name: "Knife Dance", theme: "Cheap Destroy effects and Lightning Bolt pick off the opponent's best cards with Chronomancer speeding the kills, but its own board scores low early and the long timers are slow.",
      cards: ['fledgling', 'duelist', 'assassin', 'reaper', 'bolt', 'chronomancer', 'treasurer', 'pikeman', 'drillmaster', 'executioner', 'stoneguard', 'troll'] },
    { id: "glass", name: "Glass Cannons", theme: "Fragile high-power Glass cards with buffs race for a fast lead, but any negative effect kills them and the deck has no Shield or Silence protection.",
      cards: ['fledgling', 'rally', 'duelist', 'glasscannon', 'herald', 'seer', 'drillmaster', 'treasurer', 'pikeman', 'golem', 'warlord', 'troll'] },
    { id: "feeding", name: "Feeding Frenzy", theme: "Cheap Edible bait is placed over by Consume cards that absorb its power and trigger its effect, but it needs the right placements and is weak if hands lack bait or fatties.",
      cards: ['lamb', 'egg', 'mimic', 'ghoul', 'fledgling', 'herald', 'devourer', 'glutton', 'treasurer', 'drillmaster', 'warlord', 'troll'] },
    { id: "haste", name: "Quickdraw", theme: "Haste cards fire the turn they land for tempo, scoring and chip damage, backed by Chronomancer and Stormcaller, but it has little late-game power and runs out of steam.",
      cards: ['fledgling', 'duelist', 'smuggler', 'skirmisher', 'marksman', 'chronomancer', 'treasurer', 'drillmaster', 'pikeman', 'stormcaller', 'warlord', 'stoneguard'] },
    { id: "spellstorm", name: "Spellstorm", theme: "Bolt, Rallying Cry and Plague Wind burst down threats and bolster the row, with solid bodies to score, but spells never score and Plague Wind costs 5, so the deck stumbles when it draws spells early.",
      cards: ['bolt', 'rally', 'plague', 'fledgling', 'duelist', 'marksman', 'bulwark', 'treasurer', 'glutton', 'pikeman', 'stoneguard', 'troll'] },
    { id: "swarm", name: "The Brood", theme: "Hatchlings, Sandlings and a wide board of small cards are buffed by Herald, Drillmaster and Warlord for rapid growth, but it is fragile to area damage like Pikeman and Plague Wind, and slow without setup.",
      cards: ['fledgling', 'egg', 'bulwark', 'conjurer', 'herald', 'rally', 'drillmaster', 'chronomancer', 'treasurer', 'pikeman', 'warlord', 'troll'] },
  ];
  /*THEMED_DECKS_END*/
  const DECKS = [{ id: 'starter', name: 'Starter', theme: 'The original 12 cards.', cards: CLASSIC.map(d => d.id) }].concat(THEMED);
  const deckById = id => DECKS.find(d => d.id === id) || DECKS[0];
  const deckDefs = id => deckById(id).cards.map(cid => BY_ID[cid]);

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

  // keyword helpers. A silenced card has no text and no keywords until the silence runs out.
  const hasKw = (c, k) => !!c.kw && c.kw.indexOf(k) >= 0;
  const kwOn = (c, k) => hasKw(c, k) && !(c.silenced > 0);
  const shieldOn = c => !!c.shield && !(c.silenced > 0);
  const isEph = c => hasKw(c, 'ephemeral');
  const isNegFx = c => !!c.fx && NEGATIVE_FX.has(c.fx.t);

  // ---------- text ----------
  function effectPhrase(f) {
    const n = f.n;
    switch (f.t) {
      case 'buffSelf': return `+${n} power to itself`;
      case 'buffAdj': return `+${n} power to adjacent friendly cards`;
      case 'buffRow': return `+${n} power to other friendly cards in its row`;
      case 'buffCol': return `+${n} power to other friendly cards in its column`;
      case 'shieldAdj': return 'gives Shield to adjacent friendly cards';
      case 'hitOpposite': return `−${n} power to the card opposite it`;
      case 'hitRow': return `−${n} power to every opposing card in the opposite row`;
      case 'hitCol': return `−${n} power to every opposing card in the opposite column`;
      case 'hitTop': return `−${n} power to the strongest opposing card (ties go to the front row, then left to right)`;
      case 'hitAll': return `−${n} power to every opposing card`;
      case 'drainOpposite': return `drains ${n} power from the card opposite it and keeps it`;
      case 'slowRow': return `adds ${n} to the timers of every opposing card in the opposite row`;
      case 'destroyOpposite': return 'destroys the card opposite it';
      case 'destroyTop': return 'destroys the strongest opposing card';
      case 'destroyWeakest': return 'destroys the weakest opposing card';
      case 'silenceOpposite': return `Silence ${n} on the card opposite it`;
      case 'silenceTop': return `Silence ${n} on the strongest opposing card`;
      case 'silenceRow': return `Silence ${n} on every opposing card in the opposite row`;
      case 'score': return `scores ${n} points`;
      case 'spawn': return `creates a ${f.tokenPower || 1}-power ${f.token || 'Drone'} in an empty adjacent cell`;
      case 'hasten': return 'takes 1 off the timers of other friendly cards (minimum 1)';
    }
    return '';
  }
  // Ephemeral cards act on the cell they are placed on, so "its row" becomes "this row" and so on.
  function ephPhrase(f) {
    const n = f.n;
    switch (f.t) {
      case 'buffRow': return `+${n} power to every friendly card in this row`;
      case 'buffCol': return `+${n} power to every friendly card in this column`;
      case 'hitOpposite': return `−${n} power to the card opposite this cell`;
      case 'hitRow': return `−${n} power to every opposing card in the opposite row`;
    }
    return effectPhrase(f);
  }
  function cardText(card) {
    const kws = KW_ORDER.filter(k => hasKw(card, k)).map(k => KW_LABEL[k]);
    const lead = kws.length ? kws.join('. ') + '. ' : '';
    if (!card.fx) return (lead || 'No effect.').trim();
    if (isEph(card)) return lead + 'When placed: ' + ephPhrase(card.fx) + '.';
    const t = card.timerBase != null ? card.timerBase : card.timer;
    return lead + (t === 1 ? 'Every tick: ' : `Every ${t} ticks: `) + effectPhrase(card.fx) + '.';
  }
  function fxShort(card) {
    if (!card.fx) return card.kw && card.kw.length ? card.kw.map(k => KW_LABEL[k]).join(' ').toLowerCase() : 'no effect';
    const f = card.fx, n = f.n;
    switch (f.t) {
      case 'buffSelf': return `+${n} self`;
      case 'buffAdj': return `+${n} adjacent`;
      case 'buffRow': return `+${n} row`;
      case 'buffCol': return `+${n} column`;
      case 'shieldAdj': return 'shield adjacent';
      case 'hitOpposite': return `−${n} opposite`;
      case 'hitRow': return `−${n} opposite row`;
      case 'hitCol': return `−${n} opposite col`;
      case 'hitTop': return `−${n} top foe`;
      case 'hitAll': return `−${n} all foes`;
      case 'drainOpposite': return `drain ${n} opposite`;
      case 'slowRow': return 'slow opposite row';
      case 'destroyOpposite': return 'destroy opposite';
      case 'destroyTop': return 'destroy top foe';
      case 'destroyWeakest': return 'destroy weakest';
      case 'silenceOpposite': return `silence ${n} opposite`;
      case 'silenceTop': return `silence ${n} top foe`;
      case 'silenceRow': return `silence ${n} row`;
      case 'score': return `+${n} points`;
      case 'spawn': return 'spawn ' + (f.token || 'Drone');
      case 'hasten': return 'haste allies';
    }
    return '';
  }
  // Keyword definitions that apply to a card, for the inspector.
  function keywordHelp(card) {
    const out = [];
    for (const k of KW_ORDER) if (hasKw(card, k)) out.push(KW_HELP[k]);
    const t = card.fx && card.fx.t;
    if (t && t.indexOf('destroy') === 0) out.push(KW_HELP.destroy);
    if (t && t.indexOf('silence') === 0) out.push(KW_HELP.silence);
    return out;
  }

  // ---------- card instances ----------
  function makeCard(G, def, owner) {
    const kw = def.kw || [];
    return {
      uid: ++G.uid, def: def.id, num: def.num || 0, name: def.name, cost: def.cost,
      base: def.power, power: def.power,
      timerBase: def.timer, timer: def.timer, fx: def.fx, kw,
      owner, seq: 0, token: false, shield: kw.indexOf('shield') >= 0, silenced: 0, silFresh: false,
    };
  }
  function makeToken(G, name, owner, power) {
    power = power || 1;
    return {
      uid: ++G.uid, def: 'token', num: 0, name, cost: 0, base: power, power,
      timerBase: null, timer: null, fx: null, kw: [], owner, seq: ++G.seq, token: true,
      shield: false, silenced: 0, silFresh: false,
    };
  }
  function resetCard(c) {
    c.power = c.base; c.timer = c.timerBase; c.shield = hasKw(c, 'shield'); c.silenced = 0; c.silFresh = false;
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
    if (G.log.length > 300) G.log.shift();
  }
  function draw(G, side) {
    const S = G.side[side];
    if (!S.deck.length && S.discard.length) { S.deck = shuffle(G, S.discard); S.discard = []; }
    if (!S.deck.length) return null;
    const c = S.deck.pop();
    if (S.hand.length >= HAND_MAX) { discardCard(G, side, c); return null; }
    S.hand.push(c);
    return c;
  }
  function discardCard(G, side, c) {
    if (c.token) return;
    resetCard(c);
    G.side[side].discard.push(c);
  }

  // mode: 'classic' = the original 12; 'mixed' = 12 random cards from all 36; 'keywords' = 12 random cards from the 24 keyword cards
  function makeDeck(mode, rnd) {
    if (mode === 'classic' || mode === 'starter') return CLASSIC.slice();
    const src = mode === 'keywords' ? NEW : POOL;
    const G = { rnd };
    let pick = null;
    for (let tries = 0; tries < 60; tries++) {
      pick = shuffle(G, src.slice()).slice(0, DECK_SIZE);
      const cheap = pick.filter(d => d.cost <= 2).length, big = pick.filter(d => d.cost >= 4).length;
      if (cheap >= 4 && big <= 3) break;
    }
    return pick.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  }

  function newGame(rnd, opts) {
    opts = opts || {};
    const G = {
      rnd: rnd || Math.random, uid: 0, seq: 0, round: 0, phase: 'idle', over: null, foeBonus: 0, inFire: false,
      side: {}, boards: { you: new Array(N).fill(null), foe: new Array(N).fill(null) },
      plan: [], undo: [], log: [], deckMode: opts.deckMode || 'classic',
    };
    G.deckIds = opts.deckIds || null;
    G.deckDefs = opts.deckDefs || (G.deckIds ? deckDefs(G.deckIds.you) : makeDeck(G.deckMode, G.rnd));
    if (G.deckIds && !opts.decks) opts = Object.assign({}, opts, { decks: { you: deckDefs(G.deckIds.you), foe: deckDefs(G.deckIds.foe) } });
    G.deckByside = opts.decks || null;
    for (const side of ['you', 'foe']) {
      const S = { score: 0, energy: 0, deck: [], hand: [], discard: [] };
      G.side[side] = S;
      const defs = (opts.decks && opts.decks[side]) || G.deckDefs;
      if (G.deckByside === null && opts.decks) G.deckByside = opts.decks;
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

  // ---------- targeting ----------
  const pickTop = theirs => { let t = -1; for (let j = 0; j < N; j++) if (theirs[j] && (t < 0 || theirs[j].power > theirs[t].power)) t = j; return t; };
  const pickLow = theirs => { let t = -1; for (let j = 0; j < N; j++) if (theirs[j] && (t < 0 || theirs[j].power < theirs[t].power)) t = j; return t; };

  // The board as it will be once the enemy's telegraphed placements land (what targets are locked against).
  // Ephemeral cards never stay on the board, so they are left out.
  function previewBoards(G) {
    const B = { you: G.boards.you.slice(), foe: G.boards.foe.slice() };
    for (const p of G.plan) if (!p.placed && !isEph(p.card)) B.foe[p.cell] = p.card;
    return B;
  }
  // Cells a card's effect would touch, as [{side, cell}]. Pass B (previewBoards) to include telegraphed cards.
  function effectArea(G, side, i, card, B) {
    const f = card.fx;
    if (!f) return [];
    B = B || G.boards;
    const opp = other(side), mine = B[side], theirs = B[opp], eph = isEph(card);
    const own = js => js.map(j => ({ side, cell: j }));
    const their = js => js.map(j => ({ side: opp, cell: j }));
    const all = [...Array(N).keys()];
    switch (f.t) {
      case 'buffAdj': case 'shieldAdj': return own(neighbors(i));
      case 'buffRow': return own(rowCells(i).filter(j => eph || j !== i));
      case 'buffCol': return own(colCells(i).filter(j => eph || j !== i));
      case 'hitOpposite': case 'drainOpposite': case 'destroyOpposite': case 'silenceOpposite': return their([i]);
      case 'hitRow': case 'slowRow': case 'silenceRow': return their(rowCells(i));
      case 'hitCol': return their(colCells(i));
      case 'hitTop': case 'destroyTop': case 'silenceTop': { const t = pickTop(theirs); return t < 0 ? [] : their([t]); }
      case 'destroyWeakest': { const t = pickLow(theirs); return t < 0 ? [] : their([t]); }
      case 'hitAll': return their(all.filter(j => theirs[j]));
      case 'spawn': { const j = neighbors(i).find(k => !mine[k]); return j == null ? [] : own([j]); }
      case 'hasten': return own(all.filter(j => j !== i && mine[j] && mine[j].timer != null));
      default: return [];
    }
  }
  // Targets are LOCKED when an effect is about to resolve (for ticks: at the start of the tick, after the enemy's plays land and
  // timers drop, before any effect fires). Each effect then acts only on the cards it locked, so earlier effects never redirect it.
  function lockTargets(G, side, i, card) {
    return effectArea(G, side, i, card).map(a => {
      const t = G.boards[a.side][a.cell];
      return { side: a.side, cell: a.cell, uid: t ? t.uid : null };
    });
  }
  // Every other card (placed, or telegraphed by the enemy) whose effect would touch cell (side, i).
  function influences(G, side, i) {
    const out = [], B = previewBoards(G);
    const consider = (s, j, c) => {
      if (!c.fx || (s === side && j === i)) return;
      if (effectArea(G, s, j, c, B).some(a => a.side === side && a.cell === i)) out.push({ side: s, cell: j, hostile: s !== side });
    };
    for (const s of ['you', 'foe']) for (let j = 0; j < N; j++) if (B[s][j]) consider(s, j, B[s][j]);
    for (const p of G.plan) if (!p.placed && isEph(p.card)) consider('foe', p.cell, p.card);
    return out;
  }

  // ---------- AI ----------
  function effectValue(G, card, i, side, fires, B) {
    const f = card.fx;
    if (!f || fires <= 0) return 0;
    const opp = other(side), mine = B[side], theirs = B[opp], n = f.n || 0, eph = isEph(card);
    const area = effectArea(G, side, i, card, B);
    const mineIn = area.filter(a => a.side === side && mine[a.cell]).map(a => mine[a.cell]);
    const emptyIn = area.filter(a => a.side === side && !mine[a.cell]).length;
    const oppIn = area.filter(a => a.side === opp && theirs[a.cell]).map(a => theirs[a.cell]);
    const allyCount = mine.filter(Boolean).length;
    const hits = ts => ts.reduce((s, t) => s + Math.min(n, t.power) * 1.2 + (t.power <= n ? t.power * 0.6 + 0.5 : 0), 0);
    switch (f.t) {
      case 'buffSelf': return eph ? 0 : n * fires;
      case 'buffAdj': case 'buffRow': case 'buffCol': return n * fires * (mineIn.length + (eph ? 0 : 0.5 * emptyIn));
      case 'shieldAdj': return fires * (mineIn.filter(t => !t.shield).length * 1.6 + 0.3 * emptyIn);
      case 'hitOpposite': case 'hitRow': case 'hitCol': return fires * (oppIn.length ? hits(oppIn) : (eph ? 0 : 0.3 * n));
      case 'hitTop': case 'hitAll': return fires * hits(oppIn);
      case 'drainOpposite': return fires * (oppIn.length ? Math.min(n, oppIn[0].power) * 2.2 : 0.4 * n);
      case 'slowRow': return fires * (oppIn.length * 1.0 + 0.2);
      case 'destroyOpposite': case 'destroyTop': case 'destroyWeakest':
        return fires * (oppIn.length ? oppIn[0].power + 1.5 + (oppIn[0].fx ? 1 : 0) : (eph ? 0 : 0.5));
      case 'silenceOpposite': case 'silenceTop': case 'silenceRow':
        return fires * (oppIn.reduce((s, t) => s + (t.fx ? 1.1 : 0.2) * Math.min(n, 3) * 0.9, 0) + (oppIn.length ? 0 : 0.3));
      case 'score': return n * fires;
      case 'spawn': return (f.tokenPower || 1) * 1.5 * fires * (emptyIn > 0 ? 1 : 0);
      case 'hasten': return fires * allyCount * 0.8;
    }
    return 0;
  }
  function bodyValue(G, c, i, side, B) {
    return c.power + effectValue(G, c, i, side, c.timerBase ? 4 / c.timerBase : 0, B);
  }
  function cellValue(G, card, i, side, B) {
    B = B || G.boards;
    const opp = other(side), theirs = B[opp], eph = isEph(card);
    const negCount = Math.min(4, theirs.filter(c => c && isNegFx(c)).length + 1);
    let fires = eph ? 1 : (card.timerBase ? 4 / card.timerBase : 0);
    if (hasKw(card, 'haste') && !eph) fires += 1;
    let v = (eph ? 0 : card.power) + effectValue(G, card, i, side, fires, B);
    if (hasKw(card, 'shield')) v += 1.4 + 0.4 * negCount;
    if (hasKw(card, 'glass')) v -= 0.5 + 0.85 * negCount;
    const old = B[side][i];
    if (old && !eph) {
      v -= bodyValue(G, old, i, side, B);
      if (hasKw(card, 'consume')) v += old.power;
      if (hasKw(old, 'edible') && old.fx) v += effectValue(G, old, i, side, 1, B);
    }
    // avoid sitting where the opponent's attackers will hit
    if (!eph) for (let j = 0; j < N; j++) {
      const a = theirs[j];
      if (!a || !a.fx || !a.timerBase) continue;
      const af = a.fx, rate = 4 / a.timerBase;
      if ((af.t === 'hitOpposite' || af.t === 'drainOpposite' || af.t === 'destroyOpposite') && j === i) v -= (af.n || 2) * rate * 0.5;
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
    for (;;) {
      let best = null;
      for (const card of hand) {
        if (card.cost > energy) continue;
        for (let i = 0; i < N; i++) {
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

  // ---------- negative effects (Shield and Glass live here) ----------
  // Returns true when the effect landed, false when it was blocked or had nothing to act on.
  function applyNeg(G, side, j, kind, n, marks) {
    const t = G.boards[side][j];
    if (!t) return false;
    if (kind === 'slow' && t.timer == null) return false;
    if (shieldOn(t)) {
      t.shield = false;
      marks.push({ side, cell: j, kind: 'shield', text: 'blocked' });
      return false;
    }
    const glass = kwOn(t, 'glass');
    if (kind === 'hurt') { t.power -= n; marks.push({ side, cell: j, kind: 'hurt', text: '−' + n }); }
    else if (kind === 'slow') { t.timer += n; marks.push({ side, cell: j, kind: 'slow', text: '⏱+' + n }); }
    else if (kind === 'silence') { t.silenced = Math.max(t.silenced || 0, n); t.silFresh = !!G.inFire; marks.push({ side, cell: j, kind: 'silence', text: 'silenced' }); }
    else if (kind === 'destroy') { t.power = 0; marks.push({ side, cell: j, kind: 'destroy', text: '✕' }); }
    if (glass && t.power > 0) { t.power = 0; marks.push({ side, cell: j, kind: 'destroy', text: 'shatters' }); }
    return true;
  }

  function cleanupDead(G, marks) {
    for (const side of ['you', 'foe']) {
      for (let j = 0; j < N; j++) {
        const t = G.boards[side][j];
        if (t && t.power <= 0) {
          G.boards[side][j] = null;
          discardCard(G, side, t);
          marks.push({ side, cell: j, kind: 'destroy', text: '✕' });
          log(G, side, `${t.name} (${cellName(j)}) is destroyed.`);
        }
      }
    }
  }

  // ---------- effects ----------
  // card: the card whose effect this is. It is normally the card on the board at (me, i); an Ephemeral card is not on the board.
  function fire(G, me, i, locks, card) {
    const opp = other(me), mine = G.boards[me];
    const c = card || mine[i], f = c.fx, onBoard = mine[i] === c;
    const marks = [{ side: me, cell: i, kind: 'fire', text: '' }];
    const where = cellName(i);
    const buff = (side, j, n) => { G.boards[side][j].power += n; marks.push({ side, cell: j, kind: 'buff', text: '+' + n }); };
    const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    const alive = locks.filter(a => { const t = G.boards[a.side][a.cell]; return a.uid != null && t && t.uid === a.uid; });
    const locked = locks.filter(a => a.uid != null).length;
    const gone = locked - alive.length;
    const goneNote = gone ? ` (${gone} locked target${gone === 1 ? ' was' : 's were'} already destroyed)` : '';
    const nameAt = a => G.boards[a.side][a.cell].name;
    let msg = '';
    // run a negative effect on every live target and report how many landed / were blocked
    const hitAll = (kind, n) => {
      let ok = 0, bl = 0;
      alive.forEach(a => { if (applyNeg(G, a.side, a.cell, kind, n, marks)) ok++; else bl++; });
      return { ok, bl, note: (bl ? ` (${bl} blocked by Shield)` : '') + goneNote };
    };

    switch (f.t) {
      case 'buffSelf':
        if (onBoard) { buff(me, i, f.n); msg = `${c.name} (${where}) grows by ${f.n}.`; }
        break;
      case 'buffAdj': case 'buffRow': case 'buffCol':
        alive.forEach(a => buff(a.side, a.cell, f.n));
        msg = `${c.name} (${where}) gives +${f.n} to ${plural(alive.length, 'card')}.${goneNote}`; break;
      case 'shieldAdj': {
        let k = 0;
        alive.forEach(a => { const t = G.boards[a.side][a.cell]; if (!t.shield) { t.shield = true; k++; marks.push({ side: a.side, cell: a.cell, kind: 'buff', text: 'shield' }); } });
        msg = `${c.name} (${where}) shields ${plural(k, 'card')}.${goneNote}`; break;
      }
      case 'hitOpposite': case 'hitTop':
        if (!locked) { msg = `${c.name} (${where}) finds no target.`; break; }
        if (!alive.length) { msg = `${c.name} (${where}) lost its target before firing.`; break; }
        { const nm = nameAt(alive[0]); const r = hitAll('hurt', f.n); msg = `${c.name} (${where}) hits ${nm} for ${f.n}${r.bl ? ', but Shield blocks it' : ''}.`; }
        break;
      case 'hitRow': case 'hitCol': case 'hitAll': {
        const r = hitAll('hurt', f.n);
        msg = `${c.name} (${where}) hits ${plural(r.ok, 'card')} for ${f.n}.${r.note}`; break;
      }
      case 'drainOpposite': {
        if (!locked) { msg = `${c.name} (${where}) has nothing to drain.`; break; }
        if (!alive.length) { msg = `${c.name} (${where}) lost its target before firing.`; break; }
        const a = alive[0], t = G.boards[a.side][a.cell], amt = Math.min(f.n, t.power), nm = t.name;
        if (applyNeg(G, a.side, a.cell, 'hurt', amt, marks)) { if (onBoard) buff(me, i, amt); msg = `${c.name} (${where}) drains ${amt} from ${nm}.`; }
        else msg = `${c.name} (${where}) tries to drain ${nm}, but Shield blocks it.`;
        break;
      }
      case 'slowRow': {
        const r = hitAll('slow', f.n);
        msg = `${c.name} (${where}) slows ${plural(r.ok, 'card')}.${r.note}`; break;
      }
      case 'destroyOpposite': case 'destroyTop': case 'destroyWeakest': {
        if (!locked) { msg = `${c.name} (${where}) finds no target.`; break; }
        if (!alive.length) { msg = `${c.name} (${where}) lost its target before firing.`; break; }
        const nm = nameAt(alive[0]); const r = hitAll('destroy', 0);
        msg = r.ok ? `${c.name} (${where}) destroys ${nm}.` : `${c.name} (${where}) tries to destroy ${nm}, but Shield blocks it.`; break;
      }
      case 'silenceOpposite': case 'silenceTop': case 'silenceRow': {
        const r = hitAll('silence', f.n);
        msg = `${c.name} (${where}) silences ${plural(r.ok, 'card')} for ${f.n}.${r.note}`; break;
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
    if (msg) log(G, me, msg);
    cleanupDead(G, marks);
    return { marks };
  }

  // ---------- placing a card (shared by the player and the enemy) ----------
  // Any cell on your own grid is a legal target. Placing on an occupied cell replaces the card there.
  function placeCard(G, side, card, i) {
    const mine = G.boards[side], marks = [];
    const who = side === 'you' ? 'You' : 'Enemy';
    card.seq = ++G.seq;

    if (isEph(card)) {
      log(G, side, `${who} ${side === 'you' ? 'cast' : 'casts'} ${card.name} at ${cellName(i)}.`);
      if (card.fx) {
        const r = fire(G, side, i, lockTargets(G, side, i, card), card);
        marks.push(...r.marks);
        if (G.fired) G.fired.add(card.uid);
      } else marks.push({ side, cell: i, kind: 'fire', text: '' });
      discardCard(G, side, card);
      return { marks, spell: true };
    }

    const old = mine[i];
    let eaten = 0;
    if (old) {
      if (hasKw(old, 'edible') && !(old.silenced > 0) && old.fx) {
        log(G, side, `${old.name} (${cellName(i)}) is eaten and triggers.`);
        const r = fire(G, side, i, lockTargets(G, side, i, old), old);
        marks.push(...r.marks);
        if (G.fired) G.fired.add(old.uid);
      }
      eaten = old.power;
      mine[i] = null;
      if (G.replaced) G.replaced.add(old.uid);
      discardCard(G, side, old);
      log(G, side, `${card.name} replaces ${old.name} at ${cellName(i)}.`);
    } else {
      log(G, side, `${who} ${side === 'you' ? 'play' : 'plays'} ${card.name} at ${cellName(i)}.`);
    }
    mine[i] = card;
    marks.push({ side, cell: i, kind: 'place', text: '' });
    if (old && kwOn(card, 'consume') && eaten > 0) {
      card.power += eaten;
      marks.push({ side, cell: i, kind: 'buff', text: '+' + eaten });
      log(G, side, `${card.name} consumes ${eaten} power.`);
    }
    if (kwOn(card, 'haste') && card.fx) {
      const r = fire(G, side, i, lockTargets(G, side, i, card), card);
      marks.push(...r.marks);
      if (G.fired) G.fired.add(card.uid);
    }
    return { marks };
  }

  // ---------- player actions (undo works from full snapshots, because placing can trigger effects) ----------
  function snapshot(G) {
    const map = new Map();
    const cp = c => { if (!c) return c; if (map.has(c)) return map.get(c); const d = Object.assign({}, c); map.set(c, d); return d; };
    const sides = {};
    for (const s of ['you', 'foe']) {
      const S = G.side[s];
      sides[s] = { score: S.score, energy: S.energy, deck: S.deck.map(cp), hand: S.hand.map(cp), discard: S.discard.map(cp) };
    }
    return {
      boards: { you: G.boards.you.map(cp), foe: G.boards.foe.map(cp) }, side: sides,
      plan: G.plan.map(p => Object.assign({}, p, { card: cp(p.card) })), seq: G.seq, uid: G.uid, logLen: G.log.length,
    };
  }
  function restore(G, s) {
    G.boards = s.boards;
    for (const k of ['you', 'foe']) Object.assign(G.side[k], s.side[k]);
    G.plan = s.plan; G.seq = s.seq; G.uid = s.uid; G.log.length = s.logLen;
  }
  function playCard(G, uid, cell) {
    if (G.phase !== 'plan' || cell < 0 || cell >= N) return null;
    const S = G.side.you;
    const idx = S.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return null;
    const card = S.hand[idx];
    if (card.cost > S.energy) return null;
    const snap = snapshot(G);
    S.hand.splice(idx, 1);
    S.energy -= card.cost;
    const r = placeCard(G, 'you', card, cell);
    G.undo.push({ snap, name: card.name });
    return { card, marks: r.marks, spell: !!r.spell };
  }
  function undoPlay(G) {
    if (G.phase !== 'plan' || !G.undo.length) return false;
    const u = G.undo.pop();
    restore(G, u.snap);
    log(G, 'you', `You take back ${u.name}.`);
    return true;
  }

  // ---------- round resolution (generator: yields after each visible step) ----------
  function* resolveRound(G) {
    G.phase = 'resolving';
    G.lastGain = null;
    G.inFire = false;
    yield { type: 'begin' };

    // 1. the enemy's telegraphed plays are made
    for (const p of G.plan) {
      const S = G.side.foe;
      const idx = S.hand.indexOf(p.card);
      if (idx < 0 || S.energy < p.card.cost) continue;
      S.hand.splice(idx, 1);
      S.energy -= p.card.cost;
      const r = placeCard(G, 'foe', p.card, p.cell);
      p.placed = true;
      yield { type: 'place', marks: r.marks, ms: 'place' };
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
    const locks = new Map();
    for (const c of ready) {
      const i = G.boards[c.owner].indexOf(c);
      if (i >= 0) locks.set(c.uid, lockTargets(G, c.owner, i, c));
    }
    yield { type: 'tick', ms: 'tick' };

    G.inFire = true;
    for (const c of ready) {
      const i = G.boards[c.owner].indexOf(c);
      if (i < 0) { log(G, c.owner, `${c.name} was destroyed before its effect fired.`); continue; }
      if (c.timer > 0) {
        log(G, c.owner, `${c.name} (${cellName(i)}) was delayed.`);
        yield { type: 'delayed', marks: [{ side: c.owner, cell: i, kind: 'slow', text: 'delayed' }], ms: 'fire' };
        continue;
      }
      if (c.silenced > 0) {
        c.timer = c.timerBase;
        log(G, c.owner, `${c.name} (${cellName(i)}) is silenced and does nothing.`);
        yield { type: 'silenced', marks: [{ side: c.owner, cell: i, kind: 'silence', text: 'silenced' }], ms: 'fire' };
        continue;
      }
      const r = fire(G, c.owner, i, locks.get(c.uid) || [], c);
      c.timer = c.timerBase;
      if (G.fired) G.fired.add(c.uid);
      yield { type: 'fire', marks: r.marks, ms: 'fire' };
    }
    G.inFire = false;
    // silence wears off one tick at a time (a silence applied mid-tick lasts through the next X full ticks)
    for (const side of ['you', 'foe']) for (const c of G.boards[side]) {
      if (c && c.silenced > 0) { if (c.silFresh) c.silFresh = false; else c.silenced--; }
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

  // ---------- forecast: dry-run the round on a copy ----------
  function clonePreview(G) {
    const map = new Map();
    const cp = c => { if (!c) return null; if (map.has(c)) return map.get(c); const d = Object.assign({}, c); map.set(c, d); return d; };
    const C = {
      rnd: G.rnd, uid: G.uid, seq: G.seq, round: G.round, phase: 'plan', over: null, log: [], undo: [], inFire: false,
      fired: new Set(), replaced: new Set(), side: {},
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
    const note = c => before.set(c.uid, { p0: c.power, shield: !!c.shield, eph: isEph(c), sil: c.silenced > 0 });
    for (const s of ['you', 'foe']) G.boards[s].forEach(c => { if (c) note(c); });
    for (const p of G.plan) note(p.card);
    let gain = { you: 0, foe: 0 };
    for (const ev of resolveRound(C)) { if (ev.type === 'score') { gain = ev.gain; break; } }
    const present = new Map();
    for (const s of ['you', 'foe']) C.boards[s].forEach((c, i) => { if (c) present.set(c.uid, { side: s, cell: i, c }); });
    const out = { byUid: {}, spawn: [], gain, after: { you: C.side.you.score, foe: C.side.foe.score } };
    for (const [uid, b] of before) {
      const now = present.get(uid);
      const replaced = C.replaced.has(uid);
      out.byUid[uid] = {
        p0: b.p0, p1: now ? now.c.power : 0,
        dies: !now && !replaced && !b.eph, replaced, cast: b.eph && C.fired.has(uid),
        fires: C.fired.has(uid),
        shieldLost: b.shield && !!now && !now.c.shield,
        silenced: !!now && now.c.silenced > 0 && !b.sil,
      };
    }
    for (const [uid, n] of present) if (!before.has(uid)) out.spawn.push({ side: n.side, cell: n.cell, name: n.c.name });
    return out;
  }

  const api = {
    COLS, ROWS, N, WIN, HAND_MAX, ENERGY_CAP, DECK_SIZE, CLASSIC, NEW, POOL, HEROES, VILLAINS, KW_LABEL, KW_HELP, KW_ORDER,
    mulberry32, other, cellName, rowOf, colOf, neighbors, rowCells, colCells, fxText: cardText, cardText, fxShort, keywordHelp, energyMax,
    hasKw, kwOn, shieldOn, isEph, makeCard, makeDeck, DECKS, deckById, deckDefs, newGame, startRound, aiPlan, cellValue, playCard, undoPlay, placeCard, resolveRound,
    forecast, effectArea, influences, previewBoards,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
