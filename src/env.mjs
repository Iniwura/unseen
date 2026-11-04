import { existsSync, readFileSync } from 'node:fs';

/** Load the optional local environment file without replacing real shell env. */
export function loadLocalEnv(filePath = '.env.local') {
  if (!existsSync(filePath)) return false;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
  return true;
}
