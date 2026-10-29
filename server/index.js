// Tamveen POS local service: serves the POS app and the ZATCA API from the same address on the POS machine.
//   npm start                      start the service
//   npm run onboard -- --otp 123   onboard this device with ZATCA (once per device)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./lib/config');
const { service } = require('./lib/service');

const config = loadConfig();
const svc = service(config);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };
// Only the app's own files are served; never this folder or the data folder.
const PUBLIC = /^\/(index\.html|favicon\.ico|version\.json|css\/[\w.-]+|js\/[\w.-]+|assets\/[\w.-]+)$/;

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let s = ''; req.setEncoding('utf8');
  req.on('data', (c) => { s += c; if (s.length > 2e6) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } });
  req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(Object.assign(new Error('Body is not JSON'), { status: 400 })); } });
});

async function api(req, res, url) {
  const m = url.pathname.match(/^\/api\/zatca\/invoices\/([^/]+)(\/xml)?$/);
  if (req.method === 'GET' && url.pathname === '/api/zatca/status') return send(res, 200, svc.status());
  if (req.method === 'POST' && url.pathname === '/api/zatca/invoices') return send(res, 200, await svc.issue(await readBody(req)));
  if (req.method === 'POST' && url.pathname === '/api/zatca/retry') return send(res, 200, await svc.retryPending());
  if (req.method === 'POST' && url.pathname === '/api/zatca/onboard') {
    const { otp } = await readBody(req);
    if (!otp) return send(res, 400, { error: 'otp is required' });
    return send(res, 200, await svc.onboard(otp));
  }
  if (req.method === 'GET' && m) {
    const id = decodeURIComponent(m[1]);
    if (m[2]) { const xml = svc.xml(id); return xml ? send(res, 200, xml, 'application/xml; charset=utf-8') : send(res, 404, { error: 'Not found' }); }
    const r = svc.record(id); return r ? send(res, 200, r) : send(res, 404, { error: 'Not found' });
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (req.method !== 'GET' || !PUBLIC.test(p)) return send(res, 404, 'Not found', 'text/plain');
    const file = path.join(config.appDir, p);
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.message });
  }
});

server.listen(config.port, config.host, () => {
  const s = svc.status();
  console.log(`Tamveen POS on http://${config.host}:${config.port} · ZATCA ${config.env} · ${s.onboarded ? `onboarded, ICV ${s.icv}` : 'NOT onboarded yet (npm run onboard -- --otp <OTP>)'}`);
});
// Report anything that is waiting (internet outage, ZATCA down) every few minutes.
setInterval(() => { svc.retryPending().catch((e) => console.error('Retry failed:', e.message)); }, config.retryMinutes * 60 * 1000).unref();
