import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const publicRoot = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
export function createAppServer(root = publicRoot) {
  const resolvedRoot = resolve(root);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(400); res.end('Bad request'); return; }
    const path = resolve(resolvedRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(resolvedRoot + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      if (!(await stat(path)).isFile() || !types[extname(path)]) { res.writeHead(404); res.end('Not found'); return; }
      const content = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)], 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT должен быть от 1 до 65535');
  const server = createAppServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Порт ${port} занят. Укажите другой через PORT.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`WiFiGuard: http://127.0.0.1:${port}`));
}
