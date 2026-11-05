import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// In development, Vite serves the UI (port 5174) and hands the WebSocket, the /pair link, the sounds and the pictures sent with messages to the bridge (PORT, 4848 by default).
const bridge = `127.0.0.1:${process.env.PORT ?? 4848}`;

export default defineConfig({
  plugins: [react()],
  // the version shown in the settings' About
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/ws': { target: `ws://${bridge}`, ws: true }, '/pair': { target: `http://${bridge}` }, '/sounds': { target: `http://${bridge}` }, '/attachments': { target: `http://${bridge}` }, '/upload': { target: `http://${bridge}` }, '/browser': { target: `http://${bridge}` } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
