// A small seeded random number generator (mulberry32), so every seed run produces the same sample data.

export function createRandom(seed = 20261111) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    between: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (probability) => next() < probability,
    pick: (list) => list[Math.floor(next() * list.length)],
  };
}

/** Fisher-Yates shuffle that returns a new array and uses the seeded generator. */
export function shuffle(list, rand) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Rounds a Taka amount the way price lists usually do: to 10 below 1,000, to 50 below 5,000, otherwise to 100. */
export function roundTaka(amount) {
  const step = amount < 1000 ? 10 : amount < 5000 ? 50 : 100;
  return Math.max(step, Math.round(amount / step) * step);
}

export const daysAgo = (days, now = Date.now()) => new Date(now - days * 24 * 60 * 60 * 1000);
