import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, Vite serves the UI (port 5174) and hands the WebSocket, the /pair link, the sounds and the pictures sent with messages to the bridge (port 4848).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:4848', ws: true }, '/pair': { target: 'http://127.0.0.1:4848' }, '/sounds': { target: 'http://127.0.0.1:4848' }, '/attachments': { target: 'http://127.0.0.1:4848' }, '/upload': { target: 'http://127.0.0.1:4848' } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
