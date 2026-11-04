import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const target = join(root, '.unseen');
if (!existsSync(join(root, 'package.json')) || JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== 'unseen') throw new Error('Run this reset from the UNSEEN repository root');
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
console.log(`Reset local UNSEEN state at ${target}`);
