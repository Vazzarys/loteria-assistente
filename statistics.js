import { GAMES } from './core.js';
import { validateHistory, baseGame, coverage } from './history.js';

export function analyzeStatistics(data, game, { limit=0, scope=game==='megadavirada'?'special':'all', draw='all' } = {}) {
  const actual=baseGame(game), g=GAMES[game];
  if(!g || !Number.isInteger(limit) || limit<0 || limit>100000 || !['all','special'].includes(scope) || (scope==='special'&&actual!=='megasena') || !['all','1','2'].includes(draw) || (draw!=='all'&&actual!=='duplasena')) throw new Error('Filtro de estatísticas inválido.');
  data=validateHistory(data,actual);
  let records=data.records.filter(r=>scope==='all'||r.special);
  if(limit)records=records.slice(-limit);
  const counts=new Map(Array.from({length:g.last-g.first+1},(_,i)=>[g.first+i,0]));
  const pairs=new Map(), parity=Array(g.drawn+1).fill(0);
  let drawCount=0;
  for(const record of records)for(let position=0;position<record.draws.length;position++) {
    if(draw!=='all'&&position+1!==Number(draw))continue;
    const numbers=[...record.draws[position]].sort((a,b)=>a-b);
    drawCount++;
    parity[numbers.filter(n=>n%2!==0).length]++;
    for(const n of numbers)counts.set(n,counts.get(n)+1);
    for(let i=0;i<numbers.length;i++)for(let j=i+1;j<numbers.length;j++) {
      const key=numbers[i]*100+numbers[j];
      const previous=pairs.get(key);
      if(previous)previous.count++;else pairs.set(key,{numbers:[numbers[i],numbers[j]],count:1});
    }
  }
  const ordered=[...counts].map(([number,count])=>({number,count,percent:drawCount?count/drawCount*100:null})).sort((a,b)=>b.count-a.count||a.number-b.number);
  let rank=0,previousCount=null;
  const ranking=ordered.map((entry,index)=>{if(entry.count!==previousCount)rank=index+1;previousCount=entry.count;return {...entry,rank};});
  const pairRanking=[...pairs.values()].map(pair=>({...pair,percent:drawCount?pair.count/drawCount*100:null})).sort((a,b)=>b.count-a.count||a.numbers[0]-b.numbers[0]||a.numbers[1]-b.numbers[1]);
  const universe=g.last-g.first+1;
  return {game,scope,limit,draw,ranking,pairs:pairRanking.slice(0,10),parity,
    contestCount:records.length,drawCount,from:records[0]?.contest||null,to:records.at(-1)?.contest||null,
    fromDate:records[0]?.date||null,toDate:records.at(-1)?.date||null,
    expectedCount:drawCount*g.drawn/universe,expectedPercent:g.drawn/universe*100,
    expectedPairPercent:g.drawn*(g.drawn-1)/(universe*(universe-1))*100,
    coverage:data.coverage||coverage(data.records),currentConfirmed:data.currentConfirmed===true,checkedAt:data.checkedAt||null};
}
