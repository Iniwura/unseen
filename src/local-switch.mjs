import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const windowsUsersRoot = '/mnt/c/Users';

function candidateUserRoots(root = windowsUsersRoot) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

/** Discover Switch Console's local Core metadata without reading credentials. */
export function discoverLocalSwitch({ usersRoot = windowsUsersRoot } = {}) {
  for (const userRoot of candidateUserRoots(usersRoot)) {
    const base = join(userRoot, 'AppData', 'Roaming', 'switchdash', 'local-switch-server');
    const portsPath = join(base, 'ports.json');
    try {
      const ports = JSON.parse(readFileSync(portsPath, 'utf8'));
      if (!Number.isInteger(ports.api) || ports.api < 1 || ports.api > 65535) continue;
      return {
        bridgeUrl: `http://127.0.0.1:${ports.api}`,
        apiPort: ports.api,
        mattermostPort: Number.isInteger(ports.mattermost) ? ports.mattermost : null,
        portsPath,
        coreEnvPath: join(base, 'native', 'run', 'switch-core.env'),
        runtimePath: join(base, 'runtime.json')
      };
    } catch {
      // Another Windows profile or a partially-created Console state may be present.
    }
  }
  return null;
}

/** Read one local Core value for an in-process operation; callers must not log it. */
export function readLocalSwitchEnv(name, options) {
  const local = discoverLocalSwitch(options);
  if (!local) return null;
  return parseEnvFile(local.coreEnvPath)[name] ?? null;
}
