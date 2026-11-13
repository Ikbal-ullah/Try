// A small in-memory cache with a size limit and an expiry time.
//
// Why: every generation costs AI quota and takes seconds. When many people
// ask for the same topic, only the first one needs the model.
//
// A Map remembers insertion order, which gives "least recently used" eviction
// for free: re-insert an entry when it is read, and the first key is always
// the one that has gone unused the longest.

export function createCache({ maxEntries = 200, ttlMs = 60 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map(); // key -> { value, expiresAt }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key); // move to the "most recently used" end
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      if (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value); // evict the least recently used
      }
    },
    get size() {
      return entries.size;
    },
  };
}
