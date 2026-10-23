import { copyFileSync } from 'node:fs';

for (const [source, target] of [['preload.cjs', 'preload.cjs'], ['build/icon.png', 'icon.png']]) {
  copyFileSync(new URL(`../desktop/${source}`, import.meta.url), new URL(`../out/desktop/${target}`, import.meta.url));
}
