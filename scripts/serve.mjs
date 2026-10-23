import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const siteRoot = fileURLToPath(new URL('../prototype/', import.meta.url));
const port = Number(process.env.PORT || 18423);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(siteRoot, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!target.startsWith(siteRoot) || !(await stat(target)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const payload = await readFile(target);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : payload);
  } catch (error) {
    const status = error instanceof URIError ? 400 : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500;
    response.writeHead(status).end(status === 404 ? 'Not found' : 'Request failed');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已使用，請設定 PORT 後再啟動。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Mycopunk checklist: http://127.0.0.1:${port} (PID ${process.pid})`));
