import { GAMES, choose, generateNumbers, validateNumbers } from './core.js';

export const METHOD_VERSION = 'cobertura-exata-1';
export const SIMPLE_PRICES = { megasena:600, megadavirada:600, lotofacil:350, quina:300, lotomania:300, duplasena:300 };
export const PRICE_CHECKED = '2026-11-10';
export const PRICE_SOURCES = Object.freeze({megasena:'Mega-Sena',megadavirada:'Mega-Sena',lotofacil:'Lotofacil',quina:'Quina',lotomania:'Lotomania',duplasena:'Dupla-Sena'});
export const batchLimit = game => game === 'lotomania' ? 8 : 20;
const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Geração cancelada', 'AbortError'); };
export function numberMask(numbers) { if(!Array.isArray(numbers)||numbers.some(n=>!Number.isInteger(n)||n<0||n>99))throw new Error('Dezenas inválidas');return numbers.reduce((mask, n) => mask | (1n << BigInt(n)), 0n); }
export function countBits(mask) { if(typeof mask!=='bigint'||mask<0n)throw new Error('Máscara inválida');let count=0; while(mask) { mask &= mask-1n; count++; } return count; }
export function planBudget(game, budgetCents, priceCents, remainingCents = null) {
  if (!GAMES[game] || !Number.isSafeInteger(budgetCents) || budgetCents <= 0 || !Number.isSafeInteger(priceCents) || priceCents <= 0) throw new Error('Informe orçamento e preço válidos, com até duas casas decimais.');
  if (remainingCents !== null && (!Number.isSafeInteger(remainingCents) || remainingCents < 0)) throw new Error('Saldo mensal inválido.');
  const effective = Math.min(budgetCents, remainingCents ?? budgetCents);
  const affordable = Math.floor(effective / priceCents), count = Math.min(affordable, batchLimit(game));
  if (!count) throw new Error('O limite disponível não comporta uma aposta simples dessa modalidade.');
  return { count, budgetCents, priceCents, effectiveCents:effective, costCents:count * priceCents, unusedCents:effective - count * priceCents, limited:affordable > count };
}
export function nearWinningMasks(ticket, first, last) {
  if(!Array.isArray(ticket)||!ticket.length||new Set(ticket).size!==ticket.length||!Number.isInteger(first)||!Number.isInteger(last)||first<0||last>99||first>last||ticket.some(n=>!Number.isInteger(n)||n<first||n>last))throw new Error('Parâmetros de cobertura inválidos.');
  const mask=numberMask(ticket), included=new Set(ticket), outcomes=[mask];
  for (const removed of ticket) for (let added=first; added<=last; added++) if (!included.has(added)) outcomes.push((mask ^ (1n << BigInt(removed))) | (1n << BigInt(added)));
  return outcomes;
}
function addTerms(terms, mask, drawn) {
  const grouped=new Map();
  const add=(m,sign)=>{ if(countBits(m)>=drawn) grouped.set(m,(grouped.get(m)||0)+sign); };
  for(const term of terms) { add(term.mask,term.sign); add(term.mask & mask,-term.sign); }
  add(mask,1);
  return [...grouped].filter(([,sign])=>sign).map(([mask,sign])=>({mask,sign}));
}
export function exactContainedUnion(masks, drawn) {
  if(masks.length>8 || !Number.isInteger(drawn) || drawn<1) throw new Error('Limite da inclusão-exclusão excedido.');
  let terms=[];
  for(const mask of masks) terms=addTerms(terms,mask,drawn);
  return terms.reduce((sum,t)=>sum+BigInt(t.sign)*choose(countBits(t.mask),drawn),0n);
}
function isExcluded(numbers, exclusions) { return exclusions.some(existing=>numbers.every(n=>existing.includes(n))); }
export function portfolioCoverage(game, tickets) {
  const g=GAMES[game];
  if(!g || !tickets.length || tickets.length>batchLimit(game) || tickets.some(t=>!validateNumbers(game,t) || t.length!==g.min)) throw new Error('Lote de apostas simples inválido.');
  const masks=tickets.map(numberMask);
  if(new Set(masks).size!==masks.length) throw new Error('O lote contém apostas repetidas.');
  const total=choose(g.last-g.first+1,g.drawn);
  if(game==='lotomania') return { main:exactContainedUnion(masks,g.drawn), total, near:null, nearHits:null, mainUpperBound:BigInt(tickets.length)*choose(50,20), nearUpperBound:null };
  const outcomes=new Set();
  for(const ticket of tickets) for(const mask of nearWinningMasks(ticket,g.first,g.last)) outcomes.add(mask);
  const nearUpper=BigInt(tickets.length*(1+g.drawn*(g.last-g.first+1-g.drawn)));
  return { main:BigInt(tickets.length), total, near:BigInt(outcomes.size), nearHits:g.drawn-1,
    mainUpperBound:BigInt(tickets.length), nearUpperBound:nearUpper<total?nearUpper:total };
}
export async function generatePortfolio(game, count, { exclusions=[], candidateCount=32, nextTicket, signal, onProgress=()=>{} } = {}) {
  const g=GAMES[game];
  if(!g || !Number.isInteger(count) || count<1 || count>batchLimit(game) || !Number.isInteger(candidateCount) || candidateCount<1 || candidateCount>128 || exclusions.some(t=>!validateNumbers(game,t))) throw new Error('Parâmetros de geração inválidos.');
  const draw=nextTicket || (()=>generateNumbers(game,g.min));
  const tickets=[], selected=new Set(), near=new Set(), uses=new Map();
  let terms=[], candidatesEvaluated=0;
  for(let step=0;step<count;step++) {
    checkAbort(signal);
    const pool=[], poolKeys=new Set();
    const add=t=>{
      if(!validateNumbers(game,t) || t.length!==g.min) throw new Error('O gerador produziu uma aposta inválida.');
      t=[...t].sort((a,b)=>a-b);const mask=numberMask(t);
      if(selected.has(mask)||poolKeys.has(mask)||isExcluded(t,exclusions)) return;
      poolKeys.add(mask);pool.push(t);
    };
    // Aposta-espelho oferece a cobertura máxima de 20 acertos para o par.
    if(game==='lotomania' && tickets.length===1) { const first=new Set(tickets[0]);add(Array.from({length:100},(_,i)=>i).filter(n=>!first.has(n))); }
    for(let attempt=0;pool.length<candidateCount && attempt<candidateCount*20;attempt++) { checkAbort(signal);add(draw()); }
    if(!pool.length) throw new Error('Não foi possível obter uma combinação distinta. Tente gerar novamente.');
    let best=null,bestScore=-1n,bestOverlap=Infinity,bestOutcomes=null;
    for(const candidate of pool) {
      checkAbort(signal);candidatesEvaluated++;
      let score,outcomes=null;
      if(game==='lotomania') {
        const mask=numberMask(candidate);
        const alreadyCovered=terms.reduce((sum,t)=>sum+BigInt(t.sign)*choose(countBits(t.mask & mask),g.drawn),0n);
        score=choose(g.min,g.drawn)-alreadyCovered;
      } else { outcomes=nearWinningMasks(candidate,g.first,g.last);score=BigInt(outcomes.filter(mask=>!near.has(mask)).length); }
      const overlap=candidate.reduce((sum,n)=>sum+(uses.get(n)||0),0);
      if(score>bestScore || (score===bestScore && overlap<bestOverlap)) { best=candidate;bestScore=score;bestOverlap=overlap;bestOutcomes=outcomes; }
    }
    tickets.push(best);const mask=numberMask(best);selected.add(mask);
    if(game==='lotomania') terms=addTerms(terms,mask,g.drawn);else for(const outcome of bestOutcomes)near.add(outcome);
    for(const n of best)uses.set(n,(uses.get(n)||0)+1);
    onProgress({done:step+1,total:count});await yieldUI();
  }
  checkAbort(signal);
  return { tickets, coverage:portfolioCoverage(game,tickets), method:METHOD_VERSION, candidatesEvaluated, candidateCount };
}
export function retrospective(tickets, records, drawn) {
  const masks=tickets.map(numberMask), histogram=Array(drawn+1).fill(0);
  for(const record of records)for(const draw of record.draws) {
    const mask=numberMask(draw);let best=0;
    for(const ticket of masks)best=Math.max(best,countBits(mask & ticket));
    histogram[best]++;
  }
  return { histogram, draws:histogram.reduce((a,b)=>a+b,0), near:histogram.slice(drawn-1).reduce((a,b)=>a+b,0), main:histogram[drawn] };
}
export async function historicalAudit(game, tickets, history, { exclusions=[], signal, baselines=32, nextTicket } = {}) {
  if(!Number.isInteger(baselines) || baselines<1 || baselines>64)throw new Error('Quantidade de comparações inválida.');
  const g=GAMES[game], records=[...history.records].sort((a,b)=>a.contest-b.contest);
  const tail=records.slice(Math.floor(records.length*0.8));
  const observed=retrospective(tickets,tail,g.drawn), baselineNear=[];
  const draw=nextTicket || (()=>generateNumbers(game,g.min));
  for(let i=0;i<baselines;i++) {
    checkAbort(signal);const batch=[],keys=new Set();
    for(let attempt=0;batch.length<tickets.length && attempt<10000;attempt++) {
      const t=draw();if(!validateNumbers(game,t)||t.length!==g.min)throw new Error('Comparador aleatório inválido.');
      const key=numberMask(t);if(!keys.has(key)&&!isExcluded(t,exclusions)){keys.add(key);batch.push(t);}
    }
    if(batch.length!==tickets.length)throw new Error('Não foi possível completar o lote de comparação.');
    baselineNear.push(retrospective(batch,tail,g.drawn).near);await yieldUI();
  }
  baselineNear.sort((a,b)=>a-b);
  const middle=Math.floor(baselines/2);
  const frequency=new Map(Array.from({length:g.last-g.first+1},(_,i)=>[i+g.first,0]));
  let fullDraws=0;
  for(const record of records)for(const draw of record.draws){fullDraws++;for(const n of draw)frequency.set(n,frequency.get(n)+1);}
  return { observed, baseline:{ count:baselines,min:baselineNear[0],max:baselineNear.at(-1),median:baselines%2?baselineNear[middle]:(baselineNear[middle-1]+baselineNear[middle])/2 },
    from:tail[0]?.contest,to:tail.at(-1)?.contest, frequencies:[...frequency].map(([number,count])=>({number,count})).sort((a,b)=>b.count-a.count||a.number-b.number), fullDraws };
}
export function oddsLabel(numerator, denominator) {
  if(numerator<=0n)return 'Não calculada';
  const oneIn=Number(denominator)/Number(numerator);
  return '1 em '+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(oneIn);
}
