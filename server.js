'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.opus': 'audio/ogg',
};

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': typeof body === 'string'
    ? 'text/plain; charset=utf-8'
    : MIME['.html'] });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch { send(res, 400, 'Bad path'); return; }
  if (urlPath.split(/[\\/]/).some(p => p.startsWith('.') || ['data', 'node_modules'].includes(p))) { send(res, 403, 'Forbidden'); return; }
  if (urlPath === '/' ) {
    try {
      send(res, 200, fs.readFileSync(path.join(ROOT, 'index.html')));
    } catch (_e) {
      send(res, 404, 'Not found');
    }
    return;
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT + path.sep)) {
    send(res, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const code = err.code === 'ENOENT' ? 404 : 500;
      send(res, code, code === 404 ? 'Not found' : 'Internal server error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(MIME, ext)) {
      res.setHeader('Content-Type', MIME[ext]);
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    res.writeHead(200);
    res.end(data);
  });
});

module.exports = server;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Spade Contract listening on http://localhost:${PORT}`);
  });
}
