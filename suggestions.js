import { GAMES, choose, generateNumbers, validateNumbers } from './core.js';
import { refineIncremental } from './incremental-coverage.js?v=0.7.0';

export const METHOD_VERSION = 'cobertura-exata-2-faixas-busca';
const LOTOMANIA_METHOD_VERSION = 'lotomania-cobertura-exata-2-busca';
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

// Interseção dos eventos de acerto com até uma dezena fora de cada jogo.
function oneMissIntersection(patternCounts, subset, commonCount, drawn) {
  const groups = new Map();
  for (const [pattern, count] of patternCounts) {
    const misses = pattern & subset;
    if (misses) groups.set(misses, (groups.get(misses) || 0) + count);
  }

  // Dois grupos só podem contribuir juntos se afetarem jogos distintos.
  // Cada grupo não vazio fornece no máximo uma dezena.
  let states = new Map([[0, [1n]]]);
  for (const [misses, count] of groups) {
    const next = new Map([...states].map(([used, ways]) => [used, [...ways]]));
    for (const [used, ways] of states) {
      if (used & misses) continue;
      const combined = used | misses;
      const updated = next.get(combined) || [];
      for (let outside = 0; outside < ways.length && outside < drawn; outside++) {
        if (!ways[outside]) continue;
        updated[outside + 1] = (updated[outside + 1] || 0n) + ways[outside] * BigInt(count);
      }
      next.set(combined, updated);
    }
    states = next;
  }

  const commonChoices = Array.from({ length: Math.min(drawn, 8) + 1 }, (_, outside) => choose(commonCount, drawn - outside));
  let total = 0n;
  for (const ways of states.values()) {
    for (let outside = 0; outside < ways.length; outside++) {
      if (ways[outside]) total += ways[outside] * commonChoices[outside];
    }
  }
  return total;
}

export function exactOneMissUnion(masks, universeSize, drawn) {
  if (masks.length > 8 || !Number.isInteger(universeSize) || universeSize < 1 || universeSize > 100 ||
      !Number.isInteger(drawn) || drawn < 1 || drawn > universeSize) throw new Error('Parâmetros de cobertura inválidos.');
  const universe = (1n << BigInt(universeSize)) - 1n;
  if (masks.some(mask => typeof mask !== 'bigint' || mask < 0n || mask > universe)) throw new Error('Máscara inválida.');

  const patternCounts = new Map();
  for (let number = 0; number < universeSize; number++) {
    const bit = 1n << BigInt(number);
    let missing = 0;
    for (let i = 0; i < masks.length; i++) {
      if (!(masks[i] & bit)) missing |= 1 << i;
    }
    patternCounts.set(missing, (patternCounts.get(missing) || 0) + 1);
  }

  const intersections = [universe];
  const sizes = [0];
  let total = 0n;
  for (let subset = 1; subset < (1 << masks.length); subset++) {
    const previous = subset & (subset - 1);
    const added = 31 - Math.clz32(subset ^ previous);
    const common = intersections[subset] = intersections[previous] & masks[added];
    const size = sizes[subset] = sizes[previous] + 1;
    const commonCount = countBits(common);
    // Toda dezena fora da interseção consome pelo menos uma das tolerâncias.
    if (commonCount + size < drawn) continue;
    const intersection = oneMissIntersection(patternCounts, subset, commonCount, drawn);
    total += size % 2 ? intersection : -intersection;
  }
  return total;
}
function isExcluded(numbers, exclusions) { return exclusions.some(existing=>numbers.every(n=>existing.includes(n))); }

export function portfolioCoverage(game, tickets) {
  const g=GAMES[game];
  if(!g || !tickets.length || tickets.length>batchLimit(game) || tickets.some(t=>!validateNumbers(game,t) || t.length!==g.min)) throw new Error('Lote de apostas simples inválido.');
  const masks=tickets.map(numberMask);
  if(new Set(masks).size!==masks.length) throw new Error('O lote contém apostas repetidas.');
  const total=choose(g.last-g.first+1,g.drawn);
  if (game === 'lotomania') {
    const mainPerTicket = choose(g.min, g.drawn);
    const nearPerTicket = mainPerTicket + choose(g.min, g.drawn - 1) * BigInt(g.last - g.first + 1 - g.min);
    return {
      main: exactContainedUnion(masks, g.drawn), total,
      near: exactOneMissUnion(masks, g.last + 1, g.drawn), nearHits: g.drawn - 1,
      mainUpperBound: BigInt(tickets.length) * mainPerTicket,
      nearUpperBound: BigInt(tickets.length) * nearPerTicket,
    };
  }
  const outcomes=new Set();
  for(const ticket of tickets) for(const mask of nearWinningMasks(ticket,g.first,g.last)) outcomes.add(mask);
  const nearUpper=BigInt(tickets.length*(1+g.drawn*(g.last-g.first+1-g.drawn)));
  const coverage = { main:BigInt(tickets.length), total, near:BigInt(outcomes.size), nearHits:g.drawn-1,
    mainUpperBound:BigInt(tickets.length), nearUpperBound:nearUpper<total?nearUpper:total };
  if (game === 'duplasena') {
    const pairs = total ** 2n;
    const atLeastOne = covered => pairs - (total - covered) ** 2n;
    coverage.contest = {
      draws: 2,
      total: pairs,
      main: atLeastOne(coverage.main),
      near: atLeastOne(coverage.near),
    };
  }
  return coverage;
}
function lotomaniaTotals(masks) {
  return { main: exactContainedUnion(masks, 20), near: exactOneMissUnion(masks, 100, 20) };
}

function betterCoverage(candidate, current) {
  return candidate.main > current.main || (candidate.main === current.main && candidate.near > current.near);
}

async function refineLotomania(registered, original, pools, checkpoint) {
  const existing = [...new Set(registered.map(numberMask))];
  const before = lotomaniaTotals(existing);
  const alternative = [...existing], baseline = [...existing];
  const selected = new Set(alternative);
  const reserved = new Set(original.map(numberMask));
  const originalRows = [], alternativeRows = [], tickets = [];
  for (let slot = 0; slot < original.length; slot++) {
    const originalMask = numberMask(original[slot]);
    reserved.delete(originalMask);
    const candidates = [original[slot], ...pools[slot]];
    for (const ticket of registered) {
      const numbers = new Set(ticket);
      candidates.push(Array.from({ length: 100 }, (_, i) => i).filter(n => !numbers.has(n)));
    }

    let best, bestScore;
    const seen = new Set();
    for (const ticket of candidates) {
      const mask = numberMask(ticket);
      if (selected.has(mask) || reserved.has(mask) || seen.has(mask)) continue;
      seen.add(mask);
      const masks = [...alternative, mask];
      const main = exactContainedUnion(masks, 20);
      if (!bestScore || main >= bestScore.main) {
        const score = { main, near: exactOneMissUnion(masks, 100, 20) };
        if (!bestScore || betterCoverage(score, bestScore)) {
          best = { ticket, mask };
          bestScore = score;
        }
      }
      await checkpoint(false);
    }
    tickets.push(best.ticket);
    selected.add(best.mask);
    alternative.push(best.mask);
    baseline.push(originalMask);
    originalRows.push(lotomaniaTotals(baseline));
    alternativeRows.push(bestScore);
    await checkpoint(true, slot + 1);
  }

  const improved = betterCoverage(alternativeRows.at(-1), originalRows.at(-1));
  const prefixes = improved ? alternativeRows : originalRows;
  const after = prefixes.at(-1);
  return {
    tickets: improved ? tickets : original,
    incremental: {
      registeredCount: registered.length, total: choose(100, 20), before, after, prefixes,
      added: { main: after.main - before.main, near: after.near - before.near },
      baseline: originalRows.at(-1), improved,
    },
  };
}

function incrementalUpperBound(coverage, incremental) {
  const cap = value => value > coverage.total ? coverage.total : value;
  return {
    main: cap(incremental.before.main + coverage.mainUpperBound),
    near: cap(incremental.before.near + coverage.nearUpperBound),
  };
}

export async function generatePortfolio(game, count, options = {}) {
  const { exclusions = [], nextTicket, signal, onProgress } = options;
  const registered = new Set(exclusions.map(numberMask)).size;
  let best, evaluated = 0, attempts = 0;
  const limit = nextTicket || count === 1 ? 1 : 3;
  for (let attempt = 1; attempt <= limit; attempt++) {
    checkAbort(signal);
    const result = await generatePortfolioAttempt(game, count, {
      ...options, onProgress: progress => onProgress?.({ ...progress, attempt }),
    });
    attempts++;
    evaluated += result.candidatesEvaluated;
    const score = result.incremental?.after ?? result.coverage;
    if (!best || betterCoverage(score, best.incremental?.after ?? best.coverage)) best = result;
    const upper = result.incremental
      ? incrementalUpperBound(result.coverage, result.incremental)
      : { main: result.coverage.mainUpperBound, near: result.coverage.nearUpperBound };
    if (score.main === upper.main && score.near === upper.near) break;
  }
  const progress = [];
  for (let i = 1; i <= best.tickets.length; i++) {
    checkAbort(signal);
    progress.push(i === best.tickets.length ? best.coverage : portfolioCoverage(game, best.tickets.slice(0, i)));
  }
  const incrementalUnavailable = game === 'lotomania' && registered > 0 && registered + count > 8;
  const incremental = best.incremental && {
    ...best.incremental, upper: incrementalUpperBound(best.coverage, best.incremental),
  };
  return { ...best, ...(incremental ? { incremental } : {}), candidatesEvaluated: evaluated, attempts, progress, incrementalUnavailable };
}

async function generatePortfolioAttempt(game, count, { exclusions=[], candidateCount=32, nextTicket, signal, onProgress=()=>{} }) {
  const g=GAMES[game];
  if(!g || !Number.isInteger(count) || count<1 || count>batchLimit(game) || !Number.isInteger(candidateCount) || candidateCount<1 || candidateCount>128 || exclusions.some(t=>!validateNumbers(game,t))) throw new Error('Parâmetros de geração inválidos.');
  const draw=nextTicket || (()=>generateNumbers(game,g.min));
  const tickets=[], selected=new Set(), near=new Set(), uses=new Map(), pools=[];
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
    pools.push(pool);
    let best=null,bestScore=-1n,bestOverlap=Infinity,bestOutcomes=null,bestNear=null;
    const selectedMasks = game === 'lotomania' ? [...selected] : [];
    for(const candidate of pool) {
      checkAbort(signal);candidatesEvaluated++;
      let score,outcomes=null;
      if(game==='lotomania') {
        const mask=numberMask(candidate);
        const alreadyCovered=terms.reduce((sum,t)=>sum+BigInt(t.sign)*choose(countBits(t.mask & mask),g.drawn),0n);
        score=choose(g.min,g.drawn)-alreadyCovered;
      } else { outcomes=nearWinningMasks(candidate,g.first,g.last);score=BigInt(outcomes.filter(mask=>!near.has(mask)).length); }
      const overlap=candidate.reduce((sum,n)=>sum+(uses.get(n)||0),0);
      let winsTie = false;
      let candidateNear = null;
      if (score === bestScore) {
        if (game === 'lotomania' && selectedMasks.length) {
          bestNear ??= exactOneMissUnion([...selectedMasks, numberMask(best)], g.last + 1, g.drawn);
          candidateNear = exactOneMissUnion([...selectedMasks, numberMask(candidate)], g.last + 1, g.drawn);
          winsTie = candidateNear > bestNear || (candidateNear === bestNear && overlap < bestOverlap);
        } else {
          winsTie = overlap < bestOverlap;
        }
      }
      if (score > bestScore || winsTie) {
        best = candidate;
        bestScore = score;
        bestOverlap = overlap;
        bestOutcomes = outcomes;
        bestNear = candidateNear;
      }
    }
    tickets.push(best);const mask=numberMask(best);selected.add(mask);
    if(game==='lotomania') terms=addTerms(terms,mask,g.drawn);else for(const outcome of bestOutcomes)near.add(outcome);
    for(const n of best)uses.set(n,(uses.get(n)||0)+1);
    onProgress({done:step+1,total:count});await yieldUI();
  }
  checkAbort(signal);
  let chosenTickets = tickets, incremental = null;
  const canCompare = game !== 'lotomania' || new Set(exclusions.map(numberMask)).size + count <= 8;
  if (exclusions.length && canCompare) {
    let lastYield = performance.now();
    const checkpoint = async (force = true, step) => {
      if (step !== undefined) onProgress({ done: step, total: count, phase: 'incremental' });
      checkAbort(signal);
      if (force || performance.now() - lastYield >= 12) {
        await yieldUI();
        lastYield = performance.now();
        checkAbort(signal);
      }
    };
    onProgress({ done: 0, total: count, phase: 'incremental' });
    await checkpoint();
    const refined = game === 'lotomania'
      ? await refineLotomania(exclusions, tickets, pools, checkpoint)
      : await refineIncremental(game, exclusions, tickets, pools, {
      checkpoint,
      progress: done => onProgress({ done, total: count, phase: 'incremental' }),
    });
    chosenTickets = refined.tickets;
    incremental = refined.incremental;
  }
  checkAbort(signal);
  const method = incremental ? `${game}-cobertura-incremental-2-faixas` : game === 'lotomania' ? LOTOMANIA_METHOD_VERSION : METHOD_VERSION;
  return { tickets:chosenTickets, coverage:portfolioCoverage(game,chosenTickets), method, candidatesEvaluated, candidateCount, ...(incremental ? { incremental } : {}) };
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
