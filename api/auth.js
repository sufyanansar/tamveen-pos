// POST /api/auth — sign in and get a token.
//   customer: { provider: 'apple' | 'google', idToken, nonce?, name?, email? }  (demo mode: { provider, demo: true, name, email })
//   staff (POS): { role: 'staff', pin }
//   driver: { role: 'driver', username, password }
// GET /api/auth — which sign-in modes are live, so the app knows whether to show real or demo buttons.
import crypto from 'node:crypto';
import { api, fail, sign, staffByPin, DRIVERS, STORE_ID } from './_lib/core.js';
import { verifyIdToken, isLive, clientIds } from './_lib/social.js';
import { updateDoc } from './_lib/docs.js';

const clean = (s, n = 80) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

export default api({
  GET: () => ({
    google: isLive('google') ? { live: true, clientId: clientIds('google')[0] } : { live: false },
    apple: isLive('apple') ? { live: true, clientId: clientIds('apple')[0] } : { live: false },
  }),
  POST: async ({ body }) => {
    if (body.role === 'staff') {
      const s = staffByPin(body.pin);
      if (!s) fail(401, 'Wrong PIN');
      return { token: sign({ role: 'staff', sub: s.id, name: s.name, staffRole: s.role, store: STORE_ID }, 2), name: s.name };
    }
    if (body.role === 'driver') {
      const d = DRIVERS.find((x) => x.username === clean(body.username).toLowerCase() && x.password === String(body.password || ''));
      if (!d) fail(401, 'Wrong username or password');
      return { token: sign({ role: 'driver', sub: d.id, name: d.name }, 30), driver: { id: d.id, name: d.name, nameAr: d.nameAr } };
    }
    const provider = body.provider;
    if (provider !== 'apple' && provider !== 'google') fail(400, 'Choose Apple or Google');
    let who;
    if (isLive(provider)) {
      who = await verifyIdToken(provider, body.idToken, body.nonce);
      if (!who) fail(401, 'Sign-in could not be confirmed. Please try again.');
      // Apple sends the name only to the app (on the first sign-in), never inside the token.
      if (!who.name) who.name = clean(body.name);
    } else {
      if (!body.demo) fail(400, 'Sign-in is in demo mode');
      const email = clean(body.email, 120).toLowerCase();
      if (!clean(body.name) && !email) fail(400, 'Enter your name');
      who = { sub: 'demo-' + crypto.createHash('sha256').update(provider + ':' + (email || clean(body.name).toLowerCase())).digest('hex').slice(0, 16), email, name: clean(body.name) };
    }
    const id = (provider === 'apple' ? 'a_' : 'g_') + who.sub;
    const profile = await updateDoc('customers', (doc) => {
      const now = new Date().toISOString();
      const c = doc.byId[id] || (doc.byId[id] = { id, provider, createdAt: now, name: '', email: '', phone: '', addresses: [], defaultAddress: null });
      if (who.name && !c.name) c.name = clean(who.name);
      if (who.email) c.email = who.email;
      c.lastSignIn = now;
      return c;
    });
    return { token: sign({ role: 'customer', sub: id }, 180), profile, needsName: !profile.name };
  },
});
