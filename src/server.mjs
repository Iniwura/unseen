import { createServer as createHttpServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGate } from './gate.mjs';
import { createJsonStore } from './store.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function staticFile(response, publicDir, pathname) {
  const root = resolve(publicDir);
  const candidate = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  // Use path.relative rather than a hard-coded '/' separator: Windows resolves
  // local paths with '\\', and a string-prefix check would reject valid assets.
  const relativePath = relative(root, candidate);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return json(response, 404, { error: 'not_found' });
  }
  try {
    const stat = statSync(candidate);
    if (!stat.isFile()) return json(response, 404, { error: 'not_found' });
    response.writeHead(200, {
      'content-type': MIME[extname(candidate)] ?? 'application/octet-stream',
      'cache-control': pathname === '/' ? 'no-cache' : 'public, max-age=60',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    response.end(readFileSync(candidate));
  } catch {
    json(response, 404, { error: 'not_found' });
  }
}

export function createUnseenServer({ gate, publicDir = resolve(fileURLToPath(new URL('../public', import.meta.url))), metadata = {}, liveStatusStore = null } = {}) {
  if (!gate || typeof gate.list !== 'function') throw new TypeError('A gate is required');
  const currentMetadata = () => {
    const live = liveStatusStore?.load?.() ?? null;
    return { ...metadata, switch: live?.status ?? metadata.switch ?? 'not connected', switchEvidence: live?.evidence ?? metadata.switchEvidence ?? 'simulated-or-unverified', liveStatus: live };
  };
  return createHttpServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://unseen.local');
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, service: 'unseen', mode: 'read-only-board' });
    if (request.method === 'GET' && url.pathname === '/api/state') {
      return json(response, 200, { decisions: gate.list(), metadata: currentMetadata() });
    }
    const decisionMatch = url.pathname.match(/^\/api\/decisions\/([^/]+)(?:\/(audit|counterfactual))?$/);
    if (request.method === 'GET' && decisionMatch) {
      const id = decodeURIComponent(decisionMatch[1]);
      try {
        if (decisionMatch[2] === 'audit') return json(response, 200, gate.getAudit(id));
        if (decisionMatch[2] === 'counterfactual') return json(response, 200, gate.counterfactual(id));
        return json(response, 200, gate.describe(id));
      } catch (error) {
        return json(response, error.code === 'NOT_FOUND' ? 404 : 400, { error: error.code ?? 'BAD_REQUEST', message: error.message });
      }
    }
    if (request.method !== 'GET') return json(response, 405, { error: 'read_only', message: 'UNSEEN mutations happen through the authenticated Switch and local adapters.' });
    // URL paths are always forward-slash separated. On Windows, path.normalize('/')
    // becomes '\\', breaking the '/' -> index.html mapping in staticFile.
    // Keep the URL pathname intact; staticFile resolves and checks filesystem paths.
    return staticFile(response, publicDir, url.pathname);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const statePath = process.env.UNSEEN_STATE_PATH ?? resolve('.unseen/state.json');
  const liveStatusPath = process.env.UNSEEN_LIVE_STATUS_PATH ?? resolve('.unseen/live-status.json');
  const authorizedHumans = (process.env.UNSEEN_AUTHORIZED_HUMANS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const gate = createGate({ store: createJsonStore(statePath), authorizedHumans });
  const localHarness = process.env.UNSEEN_BOARD_SOURCE === 'local-protocol-harness';
  const server = createUnseenServer({
    gate,
    liveStatusStore: localHarness ? null : createJsonStore(liveStatusPath),
    metadata: {
      boardSource: localHarness ? 'local-protocol-harness' : 'persisted-live-store',
      switchEvidence: localHarness ? 'local-protocol-harness' : 'live status not observed'
    }
  });
  const port = Number(process.env.PORT ?? 4173);
  server.listen(port, '127.0.0.1', () => console.log(`UNSEEN board listening at http://127.0.0.1:${port}`));
}
