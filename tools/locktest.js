const Core=require('../src/core.js');
// ---- scenario: an earlier effect in the tick changes who is strongest ----
{
  const G=Core.newGame(Core.mulberry32(1)); Core.startRound(G); G.plan=[];
  const mk=(id,owner,timer)=>{const d=(owner==='you'?Core.HEROES:Core.VILLAINS).find(x=>x.id===id);return {uid:++G.uid,name:d.name,cost:d.cost,base:d.power,power:d.power,timerBase:d.timer,timer:timer==null?d.timer:timer,fx:d.fx,owner,seq:++G.seq};};
  // enemy: Ultron(3) at A1 (idx0), Mystique(2) at C1 (idx2)
  G.boards.foe[0]=mk('warlord','foe',9); G.boards.foe[2]=mk('herald','foe',9);
  // your Misty at A1 (idx0) hits opposite (Ultron) for 2 -> placed first, fires first; Hawkeye placed after
  G.boards.you[0]=mk('duelist','you',1);
  G.boards.you[5]=mk('marksman','you',1);
  G.phase='plan'; G.targetLog=new Map();
  for(const ev of Core.resolveRound(G)){ if(ev.type==='score') break; }
  const hk=G.boards.you[5]; 
  console.log('Hawkeye locked onto:',(G.targetLog.get(hk.uid)||[]).join(',')||'(none)','(expected foe:0 = Ultron, locked before Misty hit it)');
  console.log('Ultron on board after tick:',!!G.boards.foe[0],'Mystique power:',G.boards.foe[2]&&G.boards.foe[2].power);
}
// ---- random games: actual locked targets must be a subset of the hover prediction ----
let checked=0, bad=0, exact=0;
for(let k=0;k<300;k++){
  const G=Core.newGame(Core.mulberry32(500+k)); G.foeBonus=0; Core.startRound(G);
  let guard=0;
  while(G.phase!=='over'&&guard++<30){
    for(const p of Core.aiPlan(G,'you')) Core.playCard(G,p.card.uid,p.cell);
    const B=Core.previewBoards(G); const pred=new Map();
    for(const s of ['you','foe']) B[s].forEach((c,i)=>{ if(c&&c.fx){ pred.set(c.uid,new Set(Core.effectArea(G,s,i,c,B).filter(a=>B[a.side][a.cell]).map(a=>a.side+':'+a.cell))); }});
    G.targetLog=new Map();
    for(const ev of Core.resolveRound(G)){}
    for(const [uid,t] of G.targetLog){ const p=pred.get(uid); if(!p) continue; checked++; if(!t.every(x=>p.has(x))) bad++; else if(t.length===p.size) exact++; }
  }
}
console.log('checked',checked,'not-subset',bad,'exact matches',exact);
