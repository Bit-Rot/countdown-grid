const Core=require('../src/core.js');
const G=Core.newGame(Core.mulberry32(5)); Core.startRound(G);
const mk=(def,owner)=>{ const d=(owner==='you'?Core.HEROES:Core.VILLAINS).find(x=>x.id===def); return {uid:++G.uid,name:d.name,cost:d.cost,base:d.power,power:d.power,timerBase:d.timer,timer:d.timer,fx:d.fx,owner,seq:++G.seq}; };
// your Wolverine at B2 (idx 5: row1 col1) hits facing column (col1 on enemy: idx 1,5,9)
G.boards.you[5]=mk('pikeman','you');
G.boards.you[6]=mk('herald','you'); // C2, adjacent buff
G.boards.foe[5]=mk('duelist','foe');  // drains facing B2
G.boards.foe[2]=mk('chronomancer','foe');   // hits facing row (row0) -> your row 0 cells
const names=a=>a.map(x=>x.side+':'+Core.cellName(x.cell)).sort().join(', ');
console.log('Wolverine area:',names(Core.effectArea(G,'you',5,G.boards.you[5])));
console.log('Medusa(C2) area:',names(Core.effectArea(G,'you',6,G.boards.you[6])));
console.log('Venom area:',names(Core.effectArea(G,'foe',5,G.boards.foe[5])));
console.log('Influences on your B2:',Core.influences(G,'you',5).map(x=>`${x.side}:${Core.cellName(x.cell)}${x.hostile?'(hostile)':'(ally)'}`).join(', '));
console.log('Influences on your empty A1 (idx0):',Core.influences(G,'you',0).map(x=>`${x.side}:${Core.cellName(x.cell)}${x.hostile?'(hostile)':'(ally)'}`).join(', '));
