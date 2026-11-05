// Reproduce the full local protocol harness, then show the exact resulting
// decisions in the read-only board. Never load or overwrite live Switch state.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const demoState = resolve(root, '.unseen', 'local-harness-board.json');
rmSync(demoState, { force: true });

console.log('UNSEEN: running a LOCAL PROTOCOL HARNESS (not live Switch traffic).');
const result = spawnSync(process.execPath, [resolve(root, 'demo/recovery.mjs')], {
  cwd: root,
  env: { ...process.env, UNSEEN_DEMO_STATE_PATH: demoState },
  stdio: 'inherit',
  windowsHide: true
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

console.log('\nShowing the actual locally executed harness decisions.');
console.log('The dashboard is read-only. No live Switch event or deployment is claimed.');
const child = spawn(process.execPath, [resolve(root, 'src/server.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    UNSEEN_STATE_PATH: demoState,
    UNSEEN_BOARD_SOURCE: 'local-protocol-harness'
  },
  stdio: 'inherit',
  windowsHide: true
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => { process.exitCode = code ?? 0; });
