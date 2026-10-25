// /api/voice — voice notes customers record at checkout, played back by the shop.
//   POST  customer: { audio: base64, type: 'audio/mp4' | 'audio/webm' | 'audio/ogg', secs } → { id }
//   GET   ?id=  the audio itself; for staff, and for the customer who recorded it
import crypto from 'node:crypto';
import { api, need, fail } from './_lib/core.js';
import { putFile, getFile } from './_lib/store.js';

const TYPES = { 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' };
const MAX_BYTES = 1.5 * 1024 * 1024; // about 2 minutes of speech
const ID = /^([ag]_[\w.-]{1,80})\/[a-f0-9]{24}\.(m4a|webm|ogg)$/;

export default api({
  POST: async ({ user, body }) => {
    need(user, 'customer');
    const type = String(body.type || '').split(';')[0].trim();
    if (!TYPES[type]) fail(400, 'This recording format is not supported');
    const buf = Buffer.from(String(body.audio || ''), 'base64');
    if (buf.length < 200) fail(400, 'The recording is empty');
    if (buf.length > MAX_BYTES) fail(413, 'The recording is too long');
    const id = `${user.sub}/${crypto.randomBytes(12).toString('hex')}.${TYPES[type]}`;
    await putFile('voice/' + id, buf, type);
    return { id, secs: Math.min(600, Math.max(0, Math.round(Number(body.secs) || 0))) };
  },
  GET: async ({ user, query, res }) => {
    need(user, 'staff', 'customer', 'driver');
    const m = ID.exec(String(query.id || ''));
    if (!m) fail(404, 'Not found');
    if (user.role === 'customer' && m[1] !== user.sub) fail(404, 'Not found');
    const f = await getFile('voice/' + query.id);
    if (!f) fail(404, 'Not found');
    res.setHeader('Content-Type', f.type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.statusCode = 200; res.end(f.buf);
  },
});
