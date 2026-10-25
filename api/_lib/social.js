// Checks a Google or Apple ID token (a JWT signed by Google or Apple) and returns who signed in.
// Client IDs come from GOOGLE_CLIENT_IDS / APPLE_CLIENT_IDS (comma separated: web, iOS, Android).
// While those are not set, sign-in runs in demo mode: the app asks for a name and no token is checked.
import crypto from 'node:crypto';

const ISSUERS = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', iss: ['https://accounts.google.com', 'accounts.google.com'], env: 'GOOGLE_CLIENT_IDS' },
  apple: { jwks: 'https://appleid.apple.com/auth/keys', iss: ['https://appleid.apple.com'], env: 'APPLE_CLIENT_IDS' },
};
const keyCache = new Map(); // url -> { at, keys }

export const clientIds = (provider) => String(process.env[ISSUERS[provider].env] || '').split(',').map((s) => s.trim()).filter(Boolean);
export const isLive = (provider) => clientIds(provider).length > 0;

async function keys(url) {
  const c = keyCache.get(url);
  if (c && Date.now() - c.at < 6 * 3600e3) return c.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not load sign-in keys');
  const { keys: k } = await r.json();
  keyCache.set(url, { at: Date.now(), keys: k });
  return k;
}

export async function verifyIdToken(provider, idToken, nonce) {
  const cfg = ISSUERS[provider];
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, claims;
  try { header = JSON.parse(Buffer.from(h, 'base64url')); claims = JSON.parse(Buffer.from(p, 'base64url')); } catch (e) { return null; }
  if (header.alg !== 'RS256') return null;
  const jwk = (await keys(cfg.jwks)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const ok = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) return null;
  if (!cfg.iss.includes(claims.iss) || !clientIds(provider).includes(claims.aud) || claims.exp * 1000 < Date.now()) return null;
  if (nonce && claims.nonce && claims.nonce !== nonce && claims.nonce !== crypto.createHash('sha256').update(nonce).digest('hex')) return null;
  return { sub: claims.sub, email: claims.email || '', name: claims.name || '', privateEmail: claims.is_private_email === 'true' || claims.is_private_email === true };
}
