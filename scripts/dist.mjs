// Copies the built site (page, assets, compiled TypeScript) into dist/, the
// folder Vercel publishes. Run after `tsc` via `npm run dist`.
import { cpSync, rmSync } from 'node:fs';

const FILES = ['index.html', 'favicon.ico', 'manifest.json', 'css', 'fonts', 'images', 'soundfonts', 'build'];

rmSync('dist', { recursive: true, force: true });
for (const f of FILES) cpSync(f, `dist/${f}`, { recursive: true });
