// Copies SQL migrations next to the compiled output so dist/ can run them.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const from = join(root, 'src', 'db', 'migrations');
const to = join(root, 'dist', 'db', 'migrations');
if (!existsSync(from)) { console.error(`missing migrations dir: ${from}`); process.exit(1); }
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`copied migrations -> ${to}`);
