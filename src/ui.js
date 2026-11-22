(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cn = Core.cellName;
  const DELAY = { place: 650, tick: 500, fire: 800, fizzle: 650, score: 1100 };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let G = null;
  const ui = { sel: null, inspect: null, flash: {}, busy: false, gain: null, fast: false, showFc: true, diff: 0, tip: '', fc: null, hover: null };

  function start() {
    G = Core.newGame(Math.random);
    G.foeBonus = ui.diff;
    Core.startRound(G);
    Object.assign(ui, { sel: null, inspect: null, flash: {}, busy: false, gain: null, tip: '', fc: null, hover: null });
    render();
  }

  // ---------- hover highlights: cells a card affects, and cards that affect it ----------
  // Classes are toggled on the existing cells (no re-render), so hovering never disturbs the DOM under the pointer.
  function applyHl() {
    const cells = document.querySelectorAll('.cell');
    const h = ui.hover;
    let out = null, inn = null, srcKey = null, placing = null;
    if (h && !ui.busy && !G.over) {
      srcKey = h.side + ':' + h.i;
      const c = G.boards[h.side][h.i];
      const gh = !c && h.side === 'foe' ? ghostAt(h.i) : null;
      // with a hand card selected, hovering an empty cell of your grid previews that card placed there
      if (!c && h.side === 'you' && ui.sel != null && G.phase === 'plan') placing = G.side.you.hand.find(x => x.uid === ui.sel) || null;
      const card = c || (gh && gh.card) || placing;
      out = new Set();
      if (card) for (const a of Core.effectArea(G, h.side, h.i, card, Core.previewBoards(G))) out.add(a.side + ':' + a.cell);
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
      if (k === srcKey && placing) el.setAttribute('data-hl', 'place here');
      else if (labels.length && k !== srcKey) el.setAttribute('data-hl', labels.join(' + '));
    });
  }
  function setHover(side, i) { ui.hover = { side, i }; applyHl(); }
  function clearHover() { ui.hover = null; applyHl(); }

  const ghostAt = i => G.plan.find(p => p.cell === i && !p.placed) || null;

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
    const chips = G.plan.map((p, k) =>
      `<button class="chip${p.placed ? ' done' : ''}" type="button" data-plan="${k}"><b>${k + 1}</b>${esc(p.card.name)} <span>to ${cn(p.cell)}</span></button>`).join('');
    el.innerHTML = lead + chips;
  }

  function badge(f) {
    if (!f) return '';
    if (f.dies) return '<span class="fc bad">✕ dies</span>';
    const d = f.p1 - f.p0;
    if (!d) return '';
    return `<span class="fc ${d > 0 ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>`;
  }

  function cellHTML(side, i) {
    const c = G.boards[side][i];
    const fl = ui.flash[side + ':' + i];
    const flc = fl ? fl.kinds.map(k => 'f-' + k).join(' ') : '';
    const pop = fl && fl.text ? `<span class="pop ${fl.kinds[fl.kinds.length - 1]}">${esc(fl.text)}</span>` : '';
    const placing = side === 'you' && G.phase === 'plan' && ui.sel != null && !ui.busy;
    const fc = ui.fc;
    const attrs = `data-side="${side}" data-cell="${i}"`;
    if (c) {
      const f = fc && fc.byUid[c.uid];
      const soon = c.timer != null && (f ? f.fires : c.timer === 1);
      const t = c.timer == null ? '' : `<span class="tm${soon ? ' soon' : ''}" title="Fires at the end of round ${G.round + c.timer - 1}">${c.timer}</span>`;
      return `<button class="cell card ${side} ${flc}" type="button" ${attrs} aria-label="${esc(c.name)}, power ${c.power}, ${side === 'you' ? 'yours' : 'enemy'}, ${cn(i)}">
        <span class="nm">${esc(c.name)}</span>${t}<span class="fx">${esc(Core.fxShort(c))}</span>
        <span class="bot"><span class="pw">${c.power}</span><span class="rt">${badge(f)}</span></span>${pop}</button>`;
    }
    const gh = side === 'foe' ? ghostAt(i) : null;
    if (gh) {
      const k = G.plan.indexOf(gh) + 1;
      const f = fc && fc.byUid[gh.card.uid];
      const soon = f ? f.fires : gh.card.timerBase === 1;
      return `<button class="cell ghost ${flc}" type="button" ${attrs} aria-label="Enemy intends to play ${esc(gh.card.name)} at ${cn(i)}">
        <span class="nm">${esc(gh.card.name)}</span><span class="tm${soon ? ' soon' : ''}" title="Timer">${gh.card.timerBase}</span><span class="fx">${esc(Core.fxShort(gh.card))}</span>
        <span class="bot"><span class="pw">${gh.card.power}</span><span class="rt"><span class="next">NEXT ${k}</span>${badge(f)}</span></span>${pop}</button>`;
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
      if (c) tip = `Choose an empty cell on your grid for ${c.name}.`;
    }
    $('#status').innerHTML = G.over ? `<span>Game over.</span>` :
      `<span>Round <b>${G.round}</b></span><span>Energy <span class="pips" aria-label="${Y.energy} of ${max} energy">${pips}</span> <b>${Y.energy}</b></span><span>Deck <b>${Y.deck.length}</b> &middot; Discard <b>${Y.discard.length}</b></span>${tip ? `<span class="tip">${esc(tip)}</span>` : ''}`;
  }

  function renderHand() {
    const Y = G.side.you;
    if (!Y.hand.length) { $('#hand').innerHTML = `<div class="empty-hand">Your hand is empty. End the round to draw.</div>`; return; }
    $('#hand').innerHTML = Y.hand.map(c => {
      const poor = c.cost > Y.energy;
      return `<button class="hcard${ui.sel === c.uid ? ' sel' : ''}${poor ? ' poor' : ''}" type="button" data-hand="${c.uid}" aria-pressed="${ui.sel === c.uid}">
        <span class="hhead"><span class="cost" title="Energy cost">${c.cost}</span><span class="hn">${esc(c.name)}</span></span>
        <span class="hmeta"><span class="pw">${c.power}</span><span class="tm" title="Timer (ticks between effects)">${c.timerBase}</span></span>
        <span class="hfx">${esc(Core.fxText(c))}</span></button>`;
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
    const c = m.card, owner = c.owner;
    const timer = c.timerBase == null ? 'None' : (m.kind === 'board' ? `${c.timer} / ${c.timerBase}` : `${c.timerBase}`);
    let when = '';
    if (c.timerBase == null) when = 'It has no effect. It just adds its power.';
    else if (m.kind === 'board') when = c.timer === 1 ? `Fires at the end of this round (round ${G.round}).` : `Fires at the end of round ${G.round + c.timer - 1}.`;
    else when = `If placed this round, it first fires at the end of round ${G.round + c.timerBase - 1}.`;
    let note = '';
    if (m.kind === 'ghost') note = `<p class="note">The enemy intends to play this at ${m.where}. It can't be blocked, so use the forecast to see what it will hit and arrange your own cards around it.</p>`;
    if (m.kind === 'hand') note = `<p class="note">Select it, then choose an empty cell on your grid. Cost ${c.cost} of your ${G.side.you.energy} energy.</p>`;
    let fcast = '';
    const f = ui.fc && ui.fc.byUid[c.uid];
    if (f) {
      const bits = [];
      if (f.dies) bits.push('destroyed this round');
      else if (f.p1 !== f.p0) bits.push(`power ${f.p0} → ${f.p1}`);
      else bits.push('power unchanged');
      if (f.fires) bits.push('fires');
      fcast = `<p class="fcast">Forecast: ${bits.join(', ')}.</p>`;
    }
    el.innerHTML = `<div class="ih"><span class="tag ${owner}">${owner === 'you' ? 'You' : 'Enemy'}</span><h2>${esc(c.name)}</h2></div>
      <div class="stats"><div><small>Cost</small><b>${c.cost}</b></div><div><small>Power</small><b>${c.power}</b></div><div><small>Timer</small><b>${timer}</b></div></div>
      <p>${esc(Core.fxText(c))}</p><p class="note">${esc(when)}</p>${fcast}${note}`;
  }

  function renderLog() {
    const rows = G.log.slice(-40).reverse().map(l => `<div class="ln ${l.side}"><i></i><span>R${l.round}</span><div>${esc(l.text)}</div></div>`).join('');
    $('#log').innerHTML = `<h2>Log</h2>${rows}`;
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
    if (side === 'you' && !G.boards.you[i] && ui.sel != null && G.phase === 'plan' && !ui.busy) {
      const key = side + ':' + i;
      if (noHover() && ui.armed !== key) {
        ui.armed = key;
        ui.tip = 'Tap the cell again to place it here.';
        renderStatus(); applyHl();
        return;
      }
      ui.armed = null;
      const r = Core.playCard(G, ui.sel, i);
      if (r) {
        ui.sel = null;
        ui.inspect = { k: 'cell', side, i };
        ui.flash = { [side + ':' + i]: { kinds: ['place'], text: '' } };
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
    ui.busy = true; ui.sel = null; ui.gain = null; ui.tip = ''; ui.hover = null;
    render();
    for (const ev of Core.resolveRound(G)) {
      ui.flash = {};
      addFlash(ui.flash, ev.marks);
      if (ev.gain) ui.gain = ev.gain;
      render();
      if (ev.ms) await sleep(ui.fast ? 90 : DELAY[ev.ms]);
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
  $('#fast').addEventListener('change', e => { ui.fast = e.target.checked; });
  $('#showfc').addEventListener('change', e => { ui.showFc = e.target.checked; render(); });

  start();
})();
