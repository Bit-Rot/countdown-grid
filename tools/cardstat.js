const Core=require('../src/core.js');
const played={}; // id -> [games played by winner, games played by loser]
let games=0;
for(let k=0;k<1500;k++){
  const G=Core.newGame(Core.mulberry32(9000+k)); G.foeBonus=0; Core.startRound(G);
  const seen={you:new Set(),foe:new Set()}; let guard=0;
  while(G.phase!=='over'&&guard++<30){
    for(const p of Core.aiPlan(G,'you')) Core.playCard(G,p.card.uid,p.cell);
    for(const p of G.plan) seen.foe.add(p.card.def);
    for(const c of G.boards.you) if(c) seen.you.add(c.def);
    for(const ev of Core.resolveRound(G)){}
  }
  if(!G.over||G.over.winner==='draw') continue; games++;
  const w=G.over.winner, l=w==='you'?'foe':'you';
  for(const id of seen[w]) (played[id]=played[id]||[0,0])[0]++;
  for(const id of seen[l]) (played[id]=played[id]||[0,0])[1]++;
}
console.log('games',games);
const rows=Object.entries(played).map(([id,[w,l]])=>({id,w,l,wr:(w/(w+l)*100).toFixed(0)+'%',n:w+l})).sort((a,b)=>parseInt(b.wr)-parseInt(a.wr));
for(const r of rows) console.log(r.id.padEnd(13),'win rate when played:',r.wr,' (n='+r.n+')');
