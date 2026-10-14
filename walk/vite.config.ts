import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { watch: { ignored: ['**/artifacts/**', '**/test-results/**', '**/playwright-report/**', '**/data/**'] }, port: 5173, proxy: { '/api': 'http://127.0.0.1:3001', '/socket.io': { target: 'http://127.0.0.1:3001', ws: true } } },
  build: { chunkSizeWarningLimit: 1600, rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } },
});
