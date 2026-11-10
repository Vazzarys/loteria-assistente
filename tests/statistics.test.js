import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeStatistics} from '../statistics.js';
import {GAMES} from '../core.js';
const history=game=>JSON.parse(readFileSync(new URL(`../data/history/${game}.json`,import.meta.url),'utf8'));
const sample={schemaVersion:1,game:'megasena',importedAt:'2026-11-10T12:00:00Z',records:[
 {contest:1,date:'2026-01-01',draws:[[1,2,3,4,5,6]],special:false},
 {contest:2,date:'2026-01-02',draws:[[2,3,4,5,6,7]],special:false},
 {contest:3,date:'2026-01-03',draws:[[3,4,5,6,7,8]],special:false},
]};
test('ranking inclui todas as dezenas, zera ausentes e trata empates corretamente',()=>{
 const result=analyzeStatistics(sample,'megasena');
 assert.equal(result.ranking.length,60);assert.equal(result.drawCount,3);
 assert.deepEqual(result.ranking.slice(0,4).map(x=>[x.number,x.count,x.rank]),[[3,3,1],[4,3,1],[5,3,1],[6,3,1]]);
 assert.equal(result.ranking.find(x=>x.number===2).rank,5);
 assert.ok(Math.abs(result.ranking.find(x=>x.number===1).percent-100/3)<1e-10);
 assert.equal(result.ranking.find(x=>x.number===60).count,0);
 assert.equal(result.expectedPercent,10);assert.equal(result.expectedCount,0.3);
 assert.equal(result.ranking.reduce((sum,x)=>sum+x.count,0),18);
});
test('últimos concursos respeitam a ordem numérica, sem usar amostra cumulativa',()=>{
 const recent=analyzeStatistics(sample,'megasena',{limit:1});
 assert.equal(recent.from,3);assert.equal(recent.to,3);assert.equal(recent.contestCount,1);
 assert.equal(recent.ranking.find(x=>x.number===1).count,0);
 assert.equal(recent.ranking.find(x=>x.number===8).percent,100);
});
test('duplas e paridade contam uma ocorrência por sorteio',()=>{
 const result=analyzeStatistics(sample,'megasena');
 assert.deepEqual(result.pairs[0].numbers,[3,4]);assert.equal(result.pairs[0].count,3);
 assert.equal(result.pairs[0].percent,100);assert.equal(result.parity[3],3);
 assert.equal(result.parity.reduce((a,b)=>a+b,0),result.drawCount);
});
test('Dupla Sena separa filtros e o denominador do percentual é sorteios, não concursos',()=>{
 const data=history('duplasena');
 const both=analyzeStatistics(data,'duplasena'),first=analyzeStatistics(data,'duplasena',{draw:'1'}),second=analyzeStatistics(data,'duplasena',{draw:'2'});
 assert.equal(both.contestCount,3030);assert.equal(both.drawCount,6060);assert.equal(first.drawCount,3030);
 for(const row of both.ranking){assert.equal(row.count,first.ranking.find(x=>x.number===row.number).count+second.ranking.find(x=>x.number===row.number).count);assert.equal(row.percent,row.count/6060*100);}
});
test('zero da Lotomania é incluído como número par e entra no ranking',()=>{
 const result=analyzeStatistics(history('lotomania'),'lotomania');
 assert.equal(result.ranking.length,100);assert.ok(result.ranking.find(x=>x.number===0).count>0);
 assert.equal(result.expectedPercent,20);
});
test('Mega da Virada é separada da Mega-Sena e permite selecionar a base toda',()=>{
 const data=history('megasena');
 assert.equal(analyzeStatistics(data,'megadavirada').contestCount,17);
 assert.equal(analyzeStatistics(data,'megadavirada',{scope:'all'}).contestCount,3083);
});
test('totais das cinco modalidades reconciliam com o número de dezenas de cada sorteio',()=>{
 for(const game of ['megasena','lotofacil','quina','lotomania','duplasena']){
  const result=analyzeStatistics(history(game),game);
  assert.equal(result.ranking.reduce((sum,x)=>sum+x.count,0),result.drawCount*GAMES[game].drawn);
  assert.ok(result.ranking.every(x=>x.percent>=0&&x.percent<=100));
 }
});
test('recorte sem dados é explícito e filtros inválidos são rejeitados',()=>{
 const empty=analyzeStatistics(sample,'megadavirada');
 assert.equal(empty.drawCount,0);assert.ok(empty.ranking.every(x=>x.percent===null));
 assert.throws(()=>analyzeStatistics(sample,'megasena',{draw:'2'}));
 assert.throws(()=>analyzeStatistics(sample,'megasena',{limit:-1}));
});
