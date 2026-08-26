import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

/**
 * The storefront server.
 *
 * Section 26 asks for SEO-friendly product pages, and a client-rendered bundle
 * cannot deliver them: social scrapers read the bytes the server sent and never
 * run the script, so Open Graph previews come back blank. This process renders
 * the public storefront to HTML first and hands the browser a page that is
 * already complete.
 *
 * It is deliberately small. Everything that knows about React, routing or the
 * store lives in `src/entry-server.tsx`; this file only decides which requests
 * are worth rendering and what to do when a render fails.
 */

const root = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const port = Number(process.env.PORT ?? 5173);

/**
 * Where the renderer reaches the API — not the URL the browser uses.
 *
 * The browser talks to `northwind.example`; this process talks to the API
 * directly, on a network where a tenant's public hostname need not resolve at
 * all. Which store a request is for travels as a header instead.
 */
const apiBaseUrl = process.env.SSR_API_URL ?? 'http://127.0.0.1:4000/api/v1';

const app = express();
app.disable('x-powered-by');

let vite = null;
let productionTemplate = '';
let productionEntry = null;

if (isDev) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  const clientDir = path.join(root, 'dist/client');
  // Hashed filenames, so they can be cached until the heat death of the sun.
  app.use(
    '/assets',
    express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }),
  );
  // Everything else in the client build: favicon, robots, images.
  app.use(express.static(clientDir, { index: false }));

  productionTemplate = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
  productionEntry = await import('./dist/server/entry-server.js');
}

/**
 * The empty shell: the client boots and fetches for itself, as it always did.
 *
 * Every placeholder has to go, not just the state one. An HTML comment left
 * inside `#root` is a child node, and the client entry would read that as
 * "the server rendered something here" and try to hydrate an empty container.
 *
 * `head` is for the cases where the shell still needs to say something to a
 * crawler — a hostname that belongs to no store, for instance.
 */
function shell(template, head = '') {
  return template
    .replace('<!--app-head-->', head)
    .replace('<!--app-html-->', '')
    .replace('<!--app-state-->', '');
}

app.use('*', async (req, res) => {
  const url = req.originalUrl;
  const pathname = url.split('?')[0];

  // A proxy in front of this process reports the hostname the shopper actually
  // used; without one, the Host header is that hostname.
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  const hostname = forwardedHost.split(':')[0];
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const origin = proto + '://' + forwardedHost;

  let template;
  let entry;

  try {
    if (isDev) {
      template = await vite.transformIndexHtml(
        url,
        fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
      );
      entry = await vite.ssrLoadModule('/src/entry-server.tsx');
    } else {
      template = productionTemplate;
      entry = productionEntry;
    }
  } catch (error) {
    if (vite) vite.ssrFixStacktrace(error);
    console.error('[ssr] could not load the renderer:', error);
    return res.status(500).set({ 'Content-Type': 'text/html' }).end('Internal Server Error');
  }

  if (!entry.shouldServerRender(pathname, hostname)) {
    return res.status(200).set({ 'Content-Type': 'text/html' }).end(shell(template));
  }

  try {
    const result = await entry.render({ url, origin, apiBaseUrl, forwardedHost });

    const html = template
      // The static fallback title would otherwise sit alongside the real one,
      // and a document with two titles is a document with an arbitrary title.
      .replace('<title>Store</title>', '')
      .replace('<!--app-head-->', result.head)
      .replace('<!--app-html-->', result.html)
      .replace(
        '<!--app-state-->',
        '<script>window.__SSR__=true;window.__QUERY_STATE__=' + result.state + '</script>',
      );

    res.status(result.status).set({ 'Content-Type': 'text/html' }).end(html);
  } catch (error) {
    if (vite) vite.ssrFixStacktrace(error);

    // No store answers to this hostname. That is a definite answer, not a
    // failure, so it must not be served as a 200: a crawler would file the
    // empty shell away as a real page titled "Store".
    if (error && error.code === 'TENANT_NOT_RESOLVED') {
      return res
        .status(404)
        .set({ 'Content-Type': 'text/html' })
        .end(shell(template, '<meta name="robots" content="noindex,nofollow" />'));
    }

    console.error('[ssr] render failed for ' + url + ':', error);

    // Anything else is our problem, not the visitor's. A failed render must not
    // take a store offline: the shell still works, so the shopper gets a
    // client-rendered page and only the crawler loses out.
    res.status(200).set({ 'Content-Type': 'text/html' }).end(shell(template));
  }
});

app.listen(port, () => {
  const mode = isDev ? 'development' : 'production';
  console.log('storefront (' + mode + ', ssr) listening on http://localhost:' + port);
  console.log('renderer reaches the API at ' + apiBaseUrl);
});
