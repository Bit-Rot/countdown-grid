const Core=require('../src/core.js');
let rounds=0,bad=0,powerBad=0;
for(let k=0;k<200;k++){
  const G=Core.newGame(Core.mulberry32(77+k),{deckMode:process.env.DECK||'mixed'}); G.foeBonus=0; Core.startRound(G);
  let guard=0;
  while(G.phase!=='over'&&guard++<30){
    for(const p of Core.aiPlan(G,'you')) Core.playCard(G,p.card.uid,p.cell);
    const fc=Core.forecast(G);
    const snapshot=JSON.stringify([G.boards.you.map(c=>c&&c.uid),G.boards.foe.map(c=>c&&c.uid)]);
    for(const ev of Core.resolveRound(G)){ if(ev.type==='score'){ rounds++; if(ev.gain.you!==fc.gain.you||ev.gain.foe!==fc.gain.foe){bad++;} 
      // per-card power check
      for(const s of ['you','foe']) G.boards[s].forEach(c=>{ if(c&&fc.byUid[c.uid]&&fc.byUid[c.uid].p1!==c.power) powerBad++; });
      break; } }
    // finish the round
    let more=true; // consume rest
    // (generator was abandoned at score; re-run is not possible, so just advance manually)
    G.side.you.score+=0;
    // manually finish: replicate remaining steps by starting a fresh round
    // simplest: score already added in generator before yield; emulate rest
    const y=G.side.you.score,f=G.side.foe.score;
    if(y>=100||f>=100){G.phase='over';} else Core.startRound(G);
  }
}
console.log('rounds checked',rounds,'gain mismatches',bad,'power mismatches',powerBad);
