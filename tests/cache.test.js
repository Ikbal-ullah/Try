import { describe, expect, it } from 'vitest';
import { createCache } from '../server/cache.js';

describe('createCache', () => {
  it('returns what was stored', () => {
    const cache = createCache();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('forgets entries after their time is up', () => {
    let time = 0;
    const cache = createCache({ ttlMs: 1000, now: () => time });
    cache.set('a', 1);
    time = 999;
    expect(cache.get('a')).toBe(1);
    time = 1000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry when full', () => {
    const cache = createCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' was just used, so 'b' is now the oldest
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});
