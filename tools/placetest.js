const Core=require('../src/core.js');
const G=Core.newGame(Core.mulberry32(3)); Core.startRound(G);
const wolv={uid:999,name:'Wolverine',fx:Core.HEROES.find(h=>h.id==='pikeman').fx,power:3,timerBase:3,timer:3,owner:'you'};
const names=a=>a.map(x=>x.side+':'+Core.cellName(x.cell)).join(', ');
console.log('Wolverine placed at your B2 would affect:',names(Core.effectArea(G,'you',5,wolv,Core.previewBoards(G))));
console.log('Wolverine placed at your D3 would affect:',names(Core.effectArea(G,'you',11,wolv,Core.previewBoards(G))));
