// Shared pieces of the online-order API: settings, sign-in tokens, request helpers and the seed catalog.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Online ordering is only switched on for this one shop (the owner's own store), not for other POS tenants.
export const STORE_ID = 'B1-RIYADH';
export const SHOP = {
  id: STORE_ID, en: 'Tamveen Mini Market', ar: 'تَمْوِين ميني ماركت', address: 'Al-Olaya, Riyadh 12211',
  phone: '+966 11 000 0000', lat: 24.6939, lng: 46.6853,
  deliveryFee: 10, freeDeliveryFrom: 100, minOrder: 25, currency: 'SAR',
};

// Demo staff for the POS (same PINs as the POS demo) and delivery agents (username + password).
const STAFF = [
  { id: 'u1', name: 'Khalid', role: 'cashier', pin: '1111' },
  { id: 'u2', name: 'Noura', role: 'manager', pin: '1234' },
  { id: 'u3', name: 'Saad', role: 'owner', pin: '9999' },
];
export const DRIVERS = [
  { id: 'd1', name: 'Faisal', nameAr: 'فيصل', username: 'faisal', password: '2222', phone: '+966 55 010 2020' },
  { id: 'd2', name: 'Omar', nameAr: 'عمر', username: 'omar', password: '3333', phone: '+966 55 030 4040' },
  { id: 'd3', name: 'Yousef', nameAr: 'يوسف', username: 'yousef', password: '4444', phone: '+966 55 050 6060' },
];

// ---------------------------------------------------------------- tokens
// A signed token (HMAC-SHA256), so the API needs no session table. The secret is SESSION_SECRET,
// else derived from the Blob token, so it is never in this public repository.
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('tamveen:' + (process.env.BLOB_READ_WRITE_TOKEN || 'local-dev')).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
export function sign(claims, days = 90) {
  const body = b64u(JSON.stringify({ ...claims, exp: Date.now() + days * 864e5 }));
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
export function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { const c = JSON.parse(Buffer.from(body, 'base64url').toString()); return c.exp > Date.now() ? c : null; } catch (e) { return null; }
}
export function who(req) {
  const h = req.headers.authorization || '';
  return verify(h.startsWith('Bearer ') ? h.slice(7) : '');
}
export function staffByPin(pin) { return STAFF.find((s) => s.pin === String(pin)); }

// ---------------------------------------------------------------- http
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };

// Wraps a handler with CORS (the native app runs from capacitor://localhost), JSON body parsing and errors.
export function api(handlers) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const h = handlers[req.method];
    if (!h) return res.status(405).json({ error: 'Method not allowed' });
    try {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const out = await h({ req, res, body: body || {}, query: req.query || {}, user: who(req) });
      if (!res.headersSent) res.status(200).json(out === undefined ? { ok: true } : out);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong' });
    }
  };
}
export function need(user, ...roles) {
  if (!user) fail(401, 'Please sign in');
  if (roles.length && !roles.includes(user.role)) fail(403, 'Not allowed');
  return user;
}

// ---------------------------------------------------------------- seed catalog
// Until a POS publishes its catalog, the app shows the POS demo's own products (js/data.js).
let seed = null;
export function seedCatalog() {
  if (!seed) {
    const src = fs.readFileSync(path.join(process.cwd(), 'js/data.js'), 'utf8');
    const sandbox = { window: {}, Date };
    vm.runInNewContext(src, sandbox);
    const S = sandbox.window.SEED;
    seed = { updatedAt: null, categories: S.categories.filter((c) => c.id !== 'fav'), products: S.products.map(slimProduct) };
  }
  return JSON.parse(JSON.stringify(seed));
}
export function slimProduct(p) {
  return {
    id: String(p.id), en: String(p.en || ''), ar: String(p.ar || ''), cat: String(p.cat || ''), brand: String(p.brand || ''),
    price: Number(p.price) || 0, unit: String(p.unit || 'piece'), weighted: !!p.weighted, vat: p.vat === 'zero' || p.vat === 'exempt' ? p.vat : 'standard',
    stock: Number(p.stock) || 0, active: p.active !== false && p.online !== false, img: p.img ? String(p.img) : '',
    packs: Array.isArray(p.packs) ? p.packs.slice(0, 6).map((k) => ({ name: String(k.name || ''), qty: Number(k.qty) || 1 })) : [],
  };
}

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const metres = (a, b) => {
  const R = 6371e3, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
