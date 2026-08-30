import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const TAILWIND_CONFIG = path.resolve(__dirname, 'tailwind.config.js');

/**
 * Restarts the dev server when tailwind.config.js changes.
 *
 * Tailwind is supposed to notice this itself, and on this project it does not
 * reliably — the running server keeps the config it booted with. That failure
 * is silent and badly misleading: a class the config no longer generates does
 * not error, it produces *no declarations at all*. A new colour therefore shows
 * up as an element with no background, which is how the marketing page's
 * primary button spent a session rendering white on white and reading as
 * "the button is hidden" rather than as "the stylesheet is stale".
 *
 * Vite already restarts for its own config; this extends that to the one other
 * file that decides what the CSS contains.
 */
function restartOnTailwindConfig(): Plugin {
  return {
    name: 'restart-on-tailwind-config',
    configureServer(server) {
      server.watcher.add(TAILWIND_CONFIG);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) !== TAILWIND_CONFIG) return;
        server.config.logger.info('tailwind.config.js changed — restarting the dev server');
        void server.restart();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), restartOnTailwindConfig()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    // Wildcard subdomains must reach the dev server so tenant resolution can be
    // exercised locally: northwind.platform.localhost:5173
    host: true,
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
});
