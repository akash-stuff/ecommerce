import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    // Wildcard subdomains must reach the dev server so tenant resolution can be
    // exercised locally: northwind.platform.localhost:5173
    host: true,
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
