// Local server for the web apps and the API (no Vercel CLI needed). Data is kept in memory.
//   npm install && npm run dev  →  http://localhost:8000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.jpg': 'image/jpeg' };
const handlers = {};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (m) {
    if (!handlers[m[1]]) { try { handlers[m[1]] = (await import(path.join(root, 'api', m[1] + '.js'))).default; } catch (e) { res.writeHead(404); return res.end('{}'); } }
    let raw = ''; for await (const c of req) raw += c;
    req.body = raw ? (() => { try { return JSON.parse(raw); } catch (e) { return raw; } })() : {};
    req.query = Object.fromEntries(url.searchParams);
    res.status = (s) => { res.statusCode = s; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return handlers[m[1]](req, res);
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 8000, () => console.log('http://localhost:' + (process.env.PORT || 8000)));
