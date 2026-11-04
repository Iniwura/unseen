import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['demo/recovery.mjs'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
