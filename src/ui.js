(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cn = Core.cellName;

  // ---------- card art ----------
  // Art lives in art/<card id>.jpg; tokens use art/<token name>.jpg. Cards without art get a tinted placeholder with their initials.
  const ART = new Set(Core.CLASSIC.map(d => d.id).concat('sandling'));
  const artKey = c => (c.token ? c.name.toLowerCase() : c.def);
  const hasArt = c => ART.has(artKey(c));
  const hueOf = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  // attributes for any element that shows a card's art (the element also needs the class "art-box")
  const artAttrs = c => hasArt(c)
    ? `style="background-image:url('art/${artKey(c)}.jpg')"`
    : `data-ph="${esc(initials(c.name))}" style="--h:${hueOf(artKey(c))}"`;
  const artCls = c => (hasArt(c) ? '' : ' ph');
  if (typeof Image !== 'undefined') for (const id of ART) new Image().src = 'art/' + id + '.jpg';

  const DELAY = { place: 650, tick: 500, fire: 800, fizzle: 650, score: 1100 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let G = null;
  const ui = { sel: null, inspect: null, flash: {}, busy: false, gain: null, fast: false, showFc: true, diff: 0, deck: 'mixed', tip: '', fc: null, hover: null, armed: null };

  function start() {
    G = Core.newGame(Math.random, { deckMode: ui.deck });
    G.foeBonus = ui.diff;
    Core.startRound(G);
    Object.assign(ui, { sel: null, inspect: null, flash: {}, busy: false, gain: null, tip: '', fc: null, hover: null, armed: null });
    renderLib();
    render();
  }

  const ghostAt = i => G.plan.find(p => p.cell === i && !p.placed) || null;
  const pwText = c => (Core.isEph(c) ? '—' : c.power);

  // ---------- hover highlights: cells a card affects, and cards that affect it ----------
  // Classes are toggled on the existing cells (no re-render), so hovering never disturbs the DOM under the pointer.
  function applyHl() {
    const cells = document.querySelectorAll('.cell');
    const h = ui.hover;
    let out = null, inn = null, srcKey = null, placing = null, label = '';
    if (h && !ui.busy && !G.over) {
      srcKey = h.side + ':' + h.i;
      const c = G.boards[h.side][h.i];
      const gh = h.side === 'foe' && !c ? ghostAt(h.i) : null;
      // with a hand card selected, hovering any cell of your grid previews that card placed there
      if (h.side === 'you' && ui.sel != null && G.phase === 'plan') placing = G.side.you.hand.find(x => x.uid === ui.sel) || null;
      const card = placing || c || (gh && gh.card);
      out = new Set();
      if (card) {
        // effects that happen right now (Haste, Ephemeral) are worked out on the board as it is; ticks use the board after the enemy's plays land
        const immediate = placing && (Core.hasKw(placing, 'haste') || Core.isEph(placing));
        const B = immediate ? G.boards : Core.previewBoards(G);
        for (const a of Core.effectArea(G, h.side, h.i, card, B)) out.add(a.side + ':' + a.cell);
        const old = G.boards[h.side][h.i];
        if (placing && old && Core.hasKw(old, 'edible') && old.fx && !Core.isEph(placing)) {
          for (const a of Core.effectArea(G, h.side, h.i, old, G.boards)) out.add(a.side + ':' + a.cell);
        }
        if (placing) label = Core.isEph(placing) ? 'cast here' : (old ? 'replace' : 'place here');
      }
      inn = new Map();
      for (const x of Core.influences(G, h.side, h.i)) inn.set(x.side + ':' + x.cell, x.hostile ? 'threat' : 'boost');
      if (!card) srcKey = null;
    }
    cells.forEach(el => {
      el.classList.remove('hl-out', 'hl-foe', 'hl-ally', 'hl-src');
      el.removeAttribute('data-hl');
      if (!out) return;
      const k = el.dataset.side + ':' + el.dataset.cell;
      const labels = [];
      if (out.has(k)) { el.classList.add('hl-out'); labels.push('target'); }
      const kind = inn.get(k);
      if (kind) { el.classList.add(kind === 'threat' ? 'hl-foe' : 'hl-ally'); labels.push(kind); }
      if (k === srcKey) el.classList.add('hl-src');
      if (k === srcKey && placing) el.setAttribute('data-hl', label);
      else if (labels.length && k !== srcKey) el.setAttribute('data-hl', labels.join(' + '));
    });
  }
  function setHover(side, i) { ui.hover = { side, i }; applyHl(); }
  function clearHover() { ui.hover = null; applyHl(); }

  // ---------- rendering ----------
  function renderScores() {
    const row = (side, label) => {
      const s = G.side[side];
      const g = ui.gain ? ui.gain[side] : 0;
      let extra = '';
      if (ui.fc) extra = `<em class="proj" title="Forecast for this round">+${ui.fc.gain[side]} forecast</em>`;
      else if (g) extra = `<em>+${g}</em>`;
      return `<div class="srow ${side}"><div class="slabel">${label}</div>
        <div class="bar" role="progressbar" aria-label="${label} score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, s.score)}"><i style="width:${Math.min(100, s.score)}%"></i></div>
        <div class="snum"><b>${s.score}</b><span>/ 100</span>${extra}</div></div>`;
    };
    $('#scores').innerHTML = row('foe', 'Enemy') + row('you', 'You');
  }

  function renderIntent() {
    const el = $('#intent');
    if (G.over) {
      const w = G.over.winner;
      const txt = w === 'you' ? 'You win' : w === 'foe' ? 'The enemy wins' : 'Draw';
      el.innerHTML = `<div class="verdict ${w}"><div><strong>${txt}</strong><span>Final score ${G.side.you.score} to ${G.side.foe.score} after ${G.round} rounds.</span></div><button class="btn primary" id="again" type="button">Play again</button></div>`;
      return;
    }
    const F = G.side.foe;
    const lead = `<div class="lead"><b>Enemy intends</b> this round (${F.energy} energy, ${F.hand.length} cards in hand)${G.plan.length ? '' : ': nothing to play.'}</div>`;
    const chips = G.plan.map((p, k) => {
      const over = G.boards.foe[p.cell] && !p.placed;
      const verb = Core.isEph(p.card) ? 'cast at' : (over ? 'over' : 'to');
      return `<button class="chip${p.placed ? ' done' : ''}" type="button" data-plan="${k}"><b>${k + 1}</b>${esc(p.card.name)} <span>${verb} ${cn(p.cell)}</span></button>`;
    }).join('');
    el.innerHTML = lead + chips;
  }

  function badge(f) {
    if (!f) return '';
    if (f.cast) return '<span class="fc spawn">cast</span>';
    if (f.replaced) return '<span class="fc bad">replaced</span>';
    if (f.dies) return '<span class="fc bad">✕ dies</span>';
    const d = f.p1 - f.p0;
    if (d) return `<span class="fc ${d > 0 ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>`;
    if (f.shieldLost) return '<span class="fc good">blocked</span>';
    if (f.silenced) return '<span class="fc bad">silenced</span>';
    return '';
  }

  const KW_SHORT = { ephemeral: 'spell', haste: 'haste', glass: 'glass', consume: 'consume', edible: 'edible' };
  function kwChips(c) {
    let h = '';
    const off = c.silenced > 0 ? ' off' : '';
    if (Core.isEph(c)) h += `<span class="kw k-ephemeral">${KW_SHORT.ephemeral}</span>`;
    for (const k of ['haste', 'glass', 'consume', 'edible']) if (Core.hasKw(c, k)) h += `<span class="kw k-${k}${off}">${KW_SHORT[k]}</span>`;
    if (c.shield) h += `<span class="kw k-shield${off}">shield</span>`;
    if (c.silenced > 0) h += `<span class="kw k-silenced">silenced ${c.silenced}</span>`;
    return h ? `<span class="kws">${h}</span>` : '';
  }
  const timerChip = (c, soon, title) => (c.timerBase == null ? '' : `<span class="tm${soon ? ' soon' : ''}" title="${title}">${c.timer != null ? c.timer : c.timerBase}</span>`);

  function cellHTML(side, i) {
    const c = G.boards[side][i];
    const fl = ui.flash[side + ':' + i];
    const flc = fl ? fl.kinds.map(k => 'f-' + k).join(' ') : '';
    const pop = fl && fl.text ? `<span class="pop ${fl.kinds[fl.kinds.length - 1]}">${esc(fl.text)}</span>` : '';
    const placing = side === 'you' && G.phase === 'plan' && ui.sel != null && !ui.busy;
    const fc = ui.fc;
    const attrs = `data-side="${side}" data-cell="${i}"`;
    const gh = side === 'foe' ? ghostAt(i) : null;
    if (c) {
      const f = fc && fc.byUid[c.uid];
      const soon = c.timer != null && (f ? f.fires : c.timer === 1);
      const t = timerChip(c, soon, `Fires at the end of round ${G.round + (c.timer || 0) - 1}`);
      const ovr = gh ? `<span class="ovr"><b>NEXT ${G.plan.indexOf(gh) + 1}</b> ${esc(gh.card.name)}${Core.isEph(gh.card) ? ' (spell)' : ' replaces'}</span>` : '';
      return `<button class="cell card ${side}${c.silenced > 0 ? ' silenced' : ''}${placing ? ' covers' : ''} ${flc}" type="button" ${attrs} aria-label="${esc(c.name)}, power ${c.power}, ${side === 'you' ? 'yours' : 'enemy'}, ${cn(i)}">
        <span class="art art-box${artCls(c)}" ${artAttrs(c)}></span><span class="top"><span class="nm">${esc(c.name)}</span>${kwChips(c)}</span>${t}<span class="fx">${esc(Core.fxShort(c))}</span>
        <span class="bot"><span class="pw">${c.power}</span><span class="rt">${badge(f)}</span></span>${ovr}${pop}</button>`;
    }
    if (gh) {
      const k = G.plan.indexOf(gh) + 1;
      const f = fc && fc.byUid[gh.card.uid];
      const soon = f ? f.fires : gh.card.timerBase === 1;
      return `<button class="cell ghost ${flc}" type="button" ${attrs} aria-label="Enemy intends to play ${esc(gh.card.name)} at ${cn(i)}">
        <span class="art art-box${artCls(gh.card)}" ${artAttrs(gh.card)}></span><span class="top"><span class="nm">${esc(gh.card.name)}</span>${kwChips(gh.card)}</span>${timerChip({ timerBase: gh.card.timerBase, timer: null }, soon, 'Timer')}<span class="fx">${esc(Core.fxShort(gh.card))}</span>
        <span class="bot"><span class="pw">${pwText(gh.card)}</span><span class="rt"><span class="next">NEXT ${k}</span>${badge(f)}</span></span>${pop}</button>`;
    }
    const sp = fc && fc.spawn.find(s => s.side === side && s.cell === i);
    return `<button class="cell empty${placing ? ' target' : ''} ${flc}" type="button" ${attrs} aria-label="Empty cell ${cn(i)}"><span class="co">${cn(i)}</span>${sp ? `<span class="fc spawn">+${esc(sp.name)}</span>` : ''}${pop}</button>`;
  }
  function renderBoards() {
    // the enemy grid is drawn back row first, so the two front rows meet at the front line
    for (const side of ['foe', 'you']) {
      const rows = side === 'foe' ? [2, 1, 0] : [0, 1, 2];
      let h = '';
      for (const r of rows) for (let c = 0; c < Core.COLS; c++) h += cellHTML(side, r * Core.COLS + c);
      $('#board-' + side).innerHTML = h;
    }
  }

  function renderStatus() {
    const Y = G.side.you, max = Core.energyMax(G);
    let pips = '';
    for (let k = 0; k < max; k++) pips += k < Y.energy ? '●' : '○';
    let tip = ui.tip;
    if (!tip && ui.sel != null) {
      const c = Y.hand.find(h => h.uid === ui.sel);
      if (c) tip = Core.isEph(c) ? `Choose the cell to cast ${c.name} on. It replaces nothing.` : `Choose a cell on your grid for ${c.name}. Placing on an occupied cell replaces that card.`;
    }
    $('#status').innerHTML = G.over ? `<span>Game over.</span>` :
      `<span>Round <b>${G.round}</b></span><span>Energy <span class="pips" aria-label="${Y.energy} of ${max} energy">${pips}</span> <b>${Y.energy}</b></span><span>Deck <b>${Y.deck.length}</b> &middot; Discard <b>${Y.discard.length}</b></span>${tip ? `<span class="tip">${esc(tip)}</span>` : ''}`;
  }

  function renderHand() {
    const Y = G.side.you;
    if (!Y.hand.length) { $('#hand').innerHTML = `<div class="empty-hand">Your hand is empty. End the round to draw.</div>`; return; }
    $('#hand').innerHTML = Y.hand.map(c => {
      const poor = c.cost > Y.energy;
      const tm = c.timerBase == null ? '' : `<span class="tm" title="Timer (ticks between effects)">${c.timerBase}</span>`;
      return `<button class="hcard${ui.sel === c.uid ? ' sel' : ''}${poor ? ' poor' : ''}" type="button" data-hand="${c.uid}" aria-pressed="${ui.sel === c.uid}">
        <span class="hart art-box${artCls(c)}" ${artAttrs(c)}><span class="cost" title="Energy cost">${c.cost}</span></span>
        <span class="hbody"><span class="hn">${esc(c.name)}</span>
        <span class="hmeta"><span class="pw">${pwText(c)}</span>${tm}</span>
        <span class="hfx">${esc(Core.cardText(c))}</span></span></button>`;
    }).join('');
  }

  function inspectModel() {
    const t = ui.inspect;
    if (!t) return null;
    if (t.k === 'cell') {
      const c = G.boards[t.side][t.i];
      if (c) return { card: c, where: cn(t.i), kind: 'board' };
      const p = t.side === 'foe' ? ghostAt(t.i) : null;
      if (p) return { card: p.card, where: cn(t.i), kind: 'ghost' };
      return null;
    }
    if (t.k === 'hand') {
      const c = G.side.you.hand.find(h => h.uid === t.uid);
      return c ? { card: c, kind: 'hand' } : null;
    }
    if (t.k === 'plan') {
      const p = G.plan[t.i];
      return p ? { card: p.card, where: cn(p.cell), kind: 'ghost' } : null;
    }
    return null;
  }
  function renderInspect() {
    const el = $('#inspect');
    const m = inspectModel();
    if (!m) {
      el.innerHTML = `<h2>Inspector</h2><p class="note">Hover or tap any card, ghost or chip to read what it does and when it fires. The board also marks the cells it affects (amber), the enemy cards that affect it (red) and the friendly cards that affect it (green).</p>`;
      return;
    }
    const c = m.card, owner = c.owner, eph = Core.isEph(c);
    const timer = c.timerBase == null ? 'None' : (m.kind === 'board' ? `${c.timer} / ${c.timerBase}` : `${c.timerBase}`);
    let when = '';
    if (eph) when = 'It resolves once, the moment it is placed, then it is gone.';
    else if (c.timerBase == null) when = 'It has no timer. It just adds its power.';
    else if (m.kind === 'board') when = c.timer === 1 ? `Fires at the end of this round (round ${G.round}).` : `Fires at the end of round ${G.round + c.timer - 1}.`;
    else when = `If placed this round, it first fires at the end of round ${G.round + c.timerBase - 1}.`;
    if (Core.hasKw(c, 'haste') && !eph) when = 'It also fires the moment it is placed. ' + when;
    let note = '';
    if (m.kind === 'ghost') note = `<p class="note">The enemy intends to ${eph ? 'cast' : 'play'} this at ${m.where}. You can't block it, so use the forecast to see what it will do and arrange your own cards around it.</p>`;
    if (m.kind === 'hand') note = `<p class="note">Select it, then choose ${eph ? 'a cell to cast it on' : 'a cell on your grid. Placing on an occupied cell replaces that card'}. Cost ${c.cost} of your ${G.side.you.energy} energy.</p>`;
    let fcast = '';
    const f = ui.fc && ui.fc.byUid[c.uid];
    if (f) {
      const bits = [];
      if (f.cast) bits.push('cast this round');
      else if (f.replaced) bits.push('replaced this round');
      else if (f.dies) bits.push('destroyed this round');
      else if (f.p1 !== f.p0) bits.push(`power ${f.p0} → ${f.p1}`);
      else bits.push('power unchanged');
      if (f.fires && !f.cast) bits.push('fires');
      if (f.shieldLost) bits.push('Shield blocks an effect');
      if (f.silenced) bits.push('gets silenced');
      fcast = `<p class="fcast">Forecast: ${bits.join(', ')}.</p>`;
    }
    const live = [];
    if (c.silenced > 0) live.push(`Silenced for ${c.silenced} more tick${c.silenced === 1 ? '' : 's'}: its text is off.`);
    if (c.shield && !Core.hasKw(c, 'shield')) live.push('Has a Shield from another card.');
    const help = Core.keywordHelp(c).map(t => `<li>${esc(t)}</li>`).join('');
    el.innerHTML = `<div class="iart art-box ${owner}${artCls(c)}" ${artAttrs(c)} role="img" aria-label="Art for ${esc(c.name)}"></div>
      <div class="ih"><span class="tag ${owner}">${owner === 'you' ? 'You' : 'Enemy'}</span><h2>${esc(c.name)}</h2></div>
      <div class="stats"><div><small>Cost</small><b>${c.cost}</b></div><div><small>Power</small><b>${pwText(c)}</b></div><div><small>Timer</small><b>${timer}</b></div></div>
      <p>${esc(Core.cardText(c))}</p><p class="note">${esc(when)}</p>${live.map(t => `<p class="fcast">${esc(t)}</p>`).join('')}${fcast}${note}${help ? `<ul class="kwhelp">${help}</ul>` : ''}`;
  }

  function renderLog() {
    const rows = G.log.slice(-40).reverse().map(l => `<div class="ln ${l.side}"><i></i><span>R${l.round}</span><div>${esc(l.text)}</div></div>`).join('');
    $('#log').innerHTML = `<h2>Log</h2>${rows}`;
  }

  // card library: this game's deck, then every card grouped by mechanic (new cards are numbered 1-24)
  function renderLib() {
    const inDeck = new Set(G.deckDefs.map(d => d.id));
    const entry = d => {
      const stats = `${d.cost}c &middot; ${d.kw.indexOf('ephemeral') >= 0 ? 'spell' : d.power + 'p'}${d.timer ? ' &middot; T' + d.timer : ''}`;
      return `<li><b>${d.num ? '#' + d.num + ' ' : ''}${esc(d.name)}</b>${inDeck.has(d.id) ? ' <i class="indeck">in this deck</i>' : ''} <span class="st">${stats}</span><br><span class="tx">${esc(Core.cardText(d))}</span></li>`;
    };
    const groups = [['Original 12', Core.CLASSIC], ['Shield', Core.NEW.slice(0, 3)], ['Ephemeral', Core.NEW.slice(3, 6)], ['Haste', Core.NEW.slice(6, 9)],
      ['Destroy', Core.NEW.slice(9, 12)], ['Glass', Core.NEW.slice(12, 15)], ['Consume', Core.NEW.slice(15, 18)], ['Edible', Core.NEW.slice(18, 21)], ['Silence', Core.NEW.slice(21, 24)]];
    $('#kwlist').innerHTML = Object.values(Core.KW_HELP).map(t => '<li>' + esc(t) + '</li>').join('');
    $('#libbody').innerHTML =
      `<h3>This game’s deck (both sides)</h3><ul>${G.deckDefs.map(entry).join('')}</ul>` +
      groups.map(([name, list]) => `<h3>${name}</h3><ul>${list.map(entry).join('')}</ul>`).join('');
  }

  function renderControls() {
    $('#end').disabled = ui.busy || G.phase !== 'plan';
    $('#end').textContent = ui.busy ? 'Resolving…' : 'End round';
    $('#undo').disabled = ui.busy || G.phase !== 'plan' || !G.undo.length;
  }

  function render() {
    ui.fc = (ui.showFc && G.phase === 'plan' && !ui.busy) ? Core.forecast(G) : null;
    renderScores(); renderIntent(); renderBoards(); renderStatus(); renderHand(); renderInspect(); renderLog(); renderControls();
    applyHl();
  }

  // ---------- input ----------
  function addFlash(map, marks) {
    for (const m of marks || []) {
      const key = m.side + ':' + m.cell;
      const f = map[key] || (map[key] = { kinds: [], text: '' });
      if (!f.kinds.includes(m.kind)) f.kinds.push(m.kind);
      if (m.text) f.text = m.text;
    }
  }

  // On touch screens there is no hover, so the first tap on a cell previews the placement and the second tap confirms it.
  const noHover = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: none)').matches;

  function onCell(side, i) {
    ui.tip = '';
    ui.hover = { side, i };
    if (side === 'you' && ui.sel != null && G.phase === 'plan' && !ui.busy) {
      const key = side + ':' + i;
      if (noHover() && ui.armed !== key) {
        ui.armed = key;
        ui.tip = G.boards.you[i] ? 'Tap the cell again to replace the card there.' : 'Tap the cell again to place it here.';
        renderStatus(); applyHl();
        return;
      }
      ui.armed = null;
      const r = Core.playCard(G, ui.sel, i);
      if (r) {
        ui.sel = null;
        ui.inspect = G.boards.you[i] ? { k: 'cell', side, i } : null;
        ui.flash = {};
        addFlash(ui.flash, r.marks);
        render();
        ui.flash = {};
        return;
      }
    }
    if (G.boards[side][i] || (side === 'foe' && ghostAt(i))) { ui.inspect = { k: 'cell', side, i }; renderInspect(); }
    applyHl();
  }
  function onHand(uid) {
    const c = G.side.you.hand.find(h => h.uid === uid);
    if (!c) return;
    ui.inspect = { k: 'hand', uid };
    ui.armed = null;
    if (G.phase === 'plan' && !ui.busy) {
      if (c.cost > G.side.you.energy) { ui.sel = null; ui.tip = `${c.name} costs ${c.cost} energy and you have ${G.side.you.energy}.`; }
      else { ui.sel = ui.sel === uid ? null : uid; ui.tip = ''; }
    }
    render();
  }

  async function endRound() {
    if (ui.busy || G.phase !== 'plan') return;
    ui.busy = true; ui.sel = null; ui.gain = null; ui.tip = ''; ui.hover = null; ui.armed = null;
    render();
    for (const ev of Core.resolveRound(G)) {
      ui.flash = {};
      addFlash(ui.flash, ev.marks);
      if (ev.gain) ui.gain = ev.gain;
      render();
      if (ev.ms) await sleep(ui.fast ? 90 : DELAY[ev.ms] || 600);
    }
    ui.flash = {};
    ui.busy = false;
    render();
  }

  for (const side of ['foe', 'you']) {
    const b = $('#board-' + side);
    b.addEventListener('click', e => { const el = e.target.closest('[data-cell]'); if (el) onCell(side, +el.dataset.cell); });
    for (const ev of ['mouseover', 'focusin']) {
      b.addEventListener(ev, e => {
        const el = e.target.closest('[data-cell]'); if (!el) return;
        const i = +el.dataset.cell;
        if (G.boards[side][i] || (side === 'foe' && ghostAt(i))) { ui.inspect = { k: 'cell', side, i }; renderInspect(); }
        setHover(side, i);
      });
    }
    for (const ev of ['mouseleave']) b.addEventListener(ev, clearHover);
  }
  $('#hand').addEventListener('click', e => { const b = e.target.closest('[data-hand]'); if (b) onHand(+b.dataset.hand); });
  $('#intent').addEventListener('click', e => {
    if (e.target.closest('#again')) { start(); return; }
    const b = e.target.closest('[data-plan]');
    if (b) { ui.inspect = { k: 'plan', i: +b.dataset.plan }; renderInspect(); }
  });
  for (const ev of ['mouseover', 'focusin']) {
    $('#hand').addEventListener(ev, e => {
      const b = e.target.closest('[data-hand]'); if (!b) return;
      ui.inspect = { k: 'hand', uid: +b.dataset.hand }; renderInspect();
    });
    $('#intent').addEventListener(ev, e => {
      const b = e.target.closest('[data-plan]'); if (!b) return;
      const k = +b.dataset.plan;
      ui.inspect = { k: 'plan', i: k }; renderInspect();
      if (G.plan[k] && !G.plan[k].placed) setHover('foe', G.plan[k].cell);
    });
  }
  for (const ev of ['mouseleave']) $('#intent').addEventListener(ev, clearHover);
  $('#end').addEventListener('click', endRound);
  $('#undo').addEventListener('click', () => { if (Core.undoPlay(G)) { ui.sel = null; ui.tip = ''; render(); } });
  $('#newgame').addEventListener('click', start);
  $('#diff').addEventListener('change', e => { ui.diff = +e.target.value; start(); });
  $('#deck').addEventListener('change', e => { ui.deck = e.target.value; start(); });
  $('#fast').addEventListener('change', e => { ui.fast = e.target.checked; });
  $('#showfc').addEventListener('change', e => { ui.showFc = e.target.checked; render(); });

  start();
})();
