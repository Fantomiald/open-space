import { defineConfig } from 'vite';

// The macOS app's code (npm run app): the bridge and the app's main process, each bundled into one file with its
// dependencies, in out/ beside the UI (out/dist). The bridge serves out/dist, so the live dist/ of npm start is left alone.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'out',
    emptyOutDir: false,
    target: 'node24',
    rollupOptions: {
      input: { 'server/index': 'server/index.ts', 'desktop/main': 'desktop/main.ts' },
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name].js' },
    },
  },
  ssr: { noExternal: true, external: ['electron'] },
});
