import { GAMES, choose } from './core.js';

const TIER_KEYS = ['main', 'near', 'third'];
const tierCounts = counts => Object.fromEntries(counts.map((count, i) => [TIER_KEYS[i], BigInt(count)]));

function visitDraws(ticket, minHits, { universe, drawn, ranks }, visit) {
  const selected = new Set(ticket);
  const inside = universe.filter(n => selected.has(n));
  const outside = universe.filter(n => !selected.has(n));
  const hitNumbers = [], missNumbers = [];
  for (let hits = drawn; hits >= minHits; hits--) {
    const misses = drawn - hits;
    function pickOutside(start, depth) {
      if (depth === misses) {
        let a = 0, b = 0, rank = 0;
        for (let position = 0; position < drawn; position++) {
          const takeHit = b === misses || (a < hits && hitNumbers[a] < missNumbers[b]);
          rank += ranks[position][takeHit ? hitNumbers[a++] : missNumbers[b++]];
        }
        visit(rank, hits);
        return;
      }
      for (let i = start; i <= outside.length - misses + depth; i++) {
        missNumbers[depth] = outside[i];
        pickOutside(i + 1, depth + 1);
      }
    }
    function pickInside(start, depth) {
      if (depth === hits) {
        pickOutside(0, 0);
        return;
      }
      for (let i = start; i <= inside.length - hits + depth; i++) {
        hitNumbers[depth] = inside[i];
        pickInside(i + 1, depth + 1);
      }
    }
    pickInside(0, 0);
  }
}

function emptyCoverage({ total, tiers }) {
  return { bits: Array.from({ length: tiers }, () => new Uint32Array(Math.ceil(total / 32))), counts: Array(tiers).fill(0) };
}

function addTicket(coverage, ticket, rules) {
  const { drawn, tiers } = rules;
  visitDraws(ticket, drawn - tiers + 1, rules, (rank, hits) => {
    const word = rank >>> 5;
    const bit = 1 << (rank & 31);
    for (let tier = drawn - hits; tier < tiers; tier++) {
      if (coverage.bits[tier][word] & bit) continue;
      coverage.bits[tier][word] |= bit;
      coverage.counts[tier]++;
    }
  });
}

function gain(coverage, ticket, requiredHits, rules) {
  const bits = coverage.bits[rules.drawn - requiredHits];
  let count = 0;
  visitDraws(ticket, requiredHits, rules, rank => {
    if (!(bits[rank >>> 5] & (1 << (rank & 31)))) count++;
  });
  return count;
}

function key(ticket) {
  return [...ticket].sort((a, b) => a - b).join(',');
}

function beats(a, b) {
  for (let tier = 0; tier < a.length; tier++) {
    if (a[tier] !== b[tier]) return a[tier] > b[tier];
  }
  return false;
}

// Registros e pools já validados pelo gerador. Cada sorteio ocupa uma posição
// única no mapa de bits, inclusive quando pertence a apostas ampliadas.
export async function refineIncremental(game, registered, original, pools, { checkpoint, progress }) {
  const { first, last, drawn } = GAMES[game];
  const universe = Array.from({ length: last - first + 1 }, (_, i) => i + first);
  const ranks = Array.from({ length: drawn }, (_, position) =>
    Uint32Array.from({ length: last + 1 }, (_, number) => Number(choose(number - first, position + 1))));
  const total = Number(choose(universe.length, drawn));
  const rules = { universe, drawn, ranks, total, tiers: game === 'quina' ? 3 : 2 };
  const coverage = emptyCoverage(rules);
  const ordered = [...registered].sort((a, b) => b.length - a.length);
  const included = [];
  for (const ticket of ordered) {
    if (included.some(other => ticket.every(n => other.has(n)))) continue;
    addTicket(coverage, ticket, rules);
    included.push(new Set(ticket));
    await checkpoint();
  }

  const before = coverage.counts.slice();
  const alternative = { bits: coverage.bits.map(bits => bits.slice()), counts: before.slice() };
  const reserve = new Set(original.map(key));
  const selected = new Set();
  const tickets = [];

  for (let slot = 0; slot < original.length; slot++) {
    reserve.delete(key(original[slot]));
    const candidates = new Map([[key(original[slot]), original[slot]]]);
    for (const ticket of pools[slot]) {
      const id = key(ticket);
      if (!reserve.has(id) && !selected.has(id)) candidates.set(id, ticket);
    }
    // Os candidatos já excluem as combinações principais cobertas.
    // Avalia a segunda faixa em todos os candidatos e, na Quina,
    // usa até oito empatados para avaliar a terceira.
    let finalists = [], bestNear = -1;
    for (const [id, ticket] of candidates) {
      const near = gain(alternative, ticket, drawn - 1, rules);
      if (near > bestNear) {
        bestNear = near;
        finalists = [];
      }
      if (near === bestNear && finalists.length < 8) finalists.push({ id, ticket });
    }
    let best = finalists[0], bestThird = -1;
    for (const candidate of rules.tiers === 3 ? finalists : []) {
      const third = gain(alternative, candidate.ticket, drawn - 2, rules);
      if (third > bestThird) {
        best = candidate;
        bestThird = third;
      }
      await checkpoint(false);
    }
    selected.add(best.id);
    tickets.push(best.ticket);
    addTicket(alternative, best.ticket, rules);
    addTicket(coverage, original[slot], rules);
    progress(slot + 1);
    await checkpoint();
  }

  const improved = beats(alternative.counts, coverage.counts);
  const after = improved ? alternative.counts : coverage.counts;
  return {
    tickets: improved ? tickets : original,
    incremental: {
      registeredCount: registered.length,
      total: BigInt(total),
      before: tierCounts(before),
      after: tierCounts(after),
      added: tierCounts(after.map((count, tier) => count - before[tier])),
      baseline: tierCounts(coverage.counts),
      improved,
    },
  };
}
