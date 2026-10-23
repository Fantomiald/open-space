import { copyFileSync } from 'node:fs';

for (const file of ['preload.cjs']) copyFileSync(new URL(`../desktop/${file}`, import.meta.url), new URL(`../out/desktop/${file}`, import.meta.url));
