import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverLocalSwitch, readLocalSwitchEnv } from '../src/local-switch.mjs';

test('local Switch discovery uses recorded ports and keeps bootstrap values in-process', () => {
  const root = join(tmpdir(), `unseen-switch-${process.pid}-${Date.now()}`);
  const base = join(root, 'Iniwu', 'AppData', 'Roaming', 'switchdash', 'local-switch-server');
  const run = join(base, 'native', 'run');
  mkdirSync(run, { recursive: true });
  writeFileSync(join(base, 'ports.json'), JSON.stringify({ api: 64821, mattermost: 64822 }));
  const envPath = join(run, 'switch-core.env');
  writeFileSync(envPath, 'AGENT_REGISTRATION_TOKEN=do-not-print\nJWT_SECRET_KEY=also-private\n');
  chmodSync(envPath, 0o600);

  try {
    const discovered = discoverLocalSwitch({ usersRoot: root });
    assert.equal(discovered.bridgeUrl, 'http://127.0.0.1:64821');
    assert.equal(discovered.mattermostPort, 64822);
    assert.equal(readLocalSwitchEnv('AGENT_REGISTRATION_TOKEN', { usersRoot: root }), 'do-not-print');
    assert.equal(readLocalSwitchEnv('MISSING_VALUE', { usersRoot: root }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
