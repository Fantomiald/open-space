import { copyFileSync, existsSync } from 'node:fs';

// A feature may add a preload or Windows icon without requiring the other desktop integrations.
for (const [source, target] of [['preload.cjs', 'preload.cjs'], ['build/icon.png', 'icon.png'], ['build/icon.ico', 'icon.ico']]) {
  const input = new URL(`../desktop/${source}`, import.meta.url);
  if (existsSync(input)) copyFileSync(input, new URL(`../out/desktop/${target}`, import.meta.url));
}
