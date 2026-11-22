import { choose } from './core.js';

const UNIVERSE = Array.from({ length: 80 }, (_, i) => i + 1);
const TOTAL = Number(choose(80, 5));
const RANK = Array.from({ length: 5 }, (_, position) =>
  Uint32Array.from({ length: 81 }, (_, number) => Number(choose(number - 1, position + 1))));
const tierCounts = counts => ({ main: BigInt(counts[0]), near: BigInt(counts[1]), third: BigInt(counts[2]) });

function visitDraws(ticket, minHits, visit) {
  const selected = new Set(ticket);
  const inside = UNIVERSE.filter(n => selected.has(n));
  const outside = UNIVERSE.filter(n => !selected.has(n));
  const hitNumbers = [], missNumbers = [];
  for (let hits = 5; hits >= minHits; hits--) {
    const misses = 5 - hits;
    function pickOutside(start, depth) {
      if (depth === misses) {
        let a = 0, b = 0, rank = 0;
        for (let position = 0; position < 5; position++) {
          const takeHit = b === misses || (a < hits && hitNumbers[a] < missNumbers[b]);
          rank += RANK[position][takeHit ? hitNumbers[a++] : missNumbers[b++]];
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

function emptyCoverage() {
  return { bits: Array.from({ length: 3 }, () => new Uint32Array(Math.ceil(TOTAL / 32))), counts: [0, 0, 0] };
}

function addTicket(coverage, ticket) {
  visitDraws(ticket, 3, (rank, hits) => {
    const word = rank >>> 5;
    const bit = 1 << (rank & 31);
    for (let tier = 5 - hits; tier < 3; tier++) {
      if (coverage.bits[tier][word] & bit) continue;
      coverage.bits[tier][word] |= bit;
      coverage.counts[tier]++;
    }
  });
}

function gain(coverage, ticket, requiredHits) {
  const bits = coverage.bits[5 - requiredHits];
  let count = 0;
  visitDraws(ticket, requiredHits, rank => {
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
export async function refineQuinaIncremental(registered, original, pools, { checkpoint, progress }) {
  const coverage = emptyCoverage();
  const ordered = [...registered].sort((a, b) => b.length - a.length);
  const included = [];
  for (const ticket of ordered) {
    if (included.some(other => ticket.every(n => other.has(n)))) continue;
    addTicket(coverage, ticket);
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
    // Avalia 4+ em todos e usa até oito empatados para calcular 3+.
    let finalists = [], bestNear = -1;
    for (const [id, ticket] of candidates) {
      const near = gain(alternative, ticket, 4);
      if (near > bestNear) {
        bestNear = near;
        finalists = [];
      }
      if (near === bestNear && finalists.length < 8) finalists.push({ id, ticket });
    }
    let best = finalists[0], bestThird = -1;
    for (const candidate of finalists) {
      const third = gain(alternative, candidate.ticket, 3);
      if (third > bestThird) {
        best = candidate;
        bestThird = third;
      }
      await checkpoint(false);
    }
    selected.add(best.id);
    tickets.push(best.ticket);
    addTicket(alternative, best.ticket);
    addTicket(coverage, original[slot]);
    progress(slot + 1);
    await checkpoint();
  }

  const improved = beats(alternative.counts, coverage.counts);
  const after = improved ? alternative.counts : coverage.counts;
  return {
    tickets: improved ? tickets : original,
    incremental: {
      registeredCount: registered.length,
      total: BigInt(TOTAL),
      before: tierCounts(before),
      after: tierCounts(after),
      added: tierCounts(after.map((count, tier) => count - before[tier])),
      baseline: tierCounts(coverage.counts),
      improved,
    },
  };
}
