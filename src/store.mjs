import { dirname } from 'node:path';
import { mkdirSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/**
 * A tiny synchronous store keeps the decision engine deterministic while still
 * making every state transition durable before it is reported to a caller.
 * The interface is deliberately small so a database-backed store can replace
 * it without changing the policy model.
 */
export function createMemoryStore(initial = {}) {
  let state = structuredClone(initial);
  return {
    load() { return structuredClone(state); },
    save(next) { state = structuredClone(next); }
  };
}

export function createJsonStore(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new TypeError('A state file path is required');
  }
  mkdirSync(dirname(filePath), { recursive: true });
  return {
    load() {
      if (!existsSync(filePath)) return {};
      const raw = readFileSync(filePath, 'utf8');
      if (!raw.trim()) return {};
      return JSON.parse(raw);
    },
    save(next) {
      const temporary = `${filePath}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      renameSync(temporary, filePath);
    }
  };
}
