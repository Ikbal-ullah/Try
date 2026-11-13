import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Never embed small files as data: URLs. The Content-Security-Policy only
    // allows fonts from our own origin, so an embedded font would be blocked.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    // In development the browser talks to Vite (5173) and Vite forwards
    // /api/* to our Express server (3001). The API key never leaves the server.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'node',
  },
});
