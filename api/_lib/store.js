// Small JSON document store for the online-order demo.
// Each document (catalog, orders, customers, fleet) is one private JSON file in Vercel Blob.
// Writes use the blob's ETag so two devices writing at once never overwrite each other.
// Without BLOB_READ_WRITE_TOKEN (local dev and tests) the documents live in memory.
// To move to a database later, only this file changes.
import { get, put, del, list, BlobPreconditionFailedError } from '@vercel/blob';

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const memory = new Map(); // name -> data (memory mode)
const cache = new Map(); // name -> { etag, data, at } (blob mode, per function instance)
const FRESH_MS = 1500;

const path = (name) => `db/${name}.json`;
const clone = (o) => JSON.parse(JSON.stringify(o));

async function readBlob(name) {
  const c = cache.get(name);
  if (c && Date.now() - c.at < FRESH_MS) return c;
  const r = await get(path(name), { access: 'private', useCache: false, ifNoneMatch: c ? c.etag : undefined });
  if (!r) { cache.delete(name); return null; }
  if (r.statusCode === 304) { c.at = Date.now(); return c; }
  const data = JSON.parse(await new Response(r.stream).text());
  const next = { etag: r.blob.etag, data, at: Date.now() };
  cache.set(name, next);
  return next;
}

export async function read(name, fallback) {
  if (!useBlob) return clone(memory.has(name) ? memory.get(name) : fallback());
  const c = await readBlob(name);
  return clone(c ? c.data : fallback());
}

// fn(doc) changes doc in place and may return a value, which update() returns.
export async function update(name, fallback, fn) {
  if (!useBlob) {
    const doc = clone(memory.has(name) ? memory.get(name) : fallback());
    const out = await fn(doc);
    memory.set(name, doc);
    return out;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const stale = cache.get(name); if (stale) stale.at = 0; // revalidate against the store before writing
    const c = await readBlob(name);
    const doc = clone(c ? c.data : fallback());
    const out = await fn(doc);
    try {
      const res = await put(path(name), JSON.stringify(doc), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60,
        ...(c ? { ifMatch: c.etag } : { allowOverwrite: false }),
      });
      cache.set(name, { etag: res.etag, data: doc, at: Date.now() });
      return out;
    } catch (e) {
      // Someone else wrote first (or created the file first): read again and retry.
      if (e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(e.message || '')) {
        await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Busy, please try again');
}

// Binary files (customers' voice notes). Same private store, under files/.
const files = new Map(); // key -> { buf, type } (memory mode)
export async function putFile(key, buf, type) {
  if (!useBlob) { files.set(key, { buf, type }); return; }
  await put('files/' + key, buf, { access: 'private', addRandomSuffix: false, contentType: type, allowOverwrite: false });
}
export async function getFile(key) {
  if (!useBlob) return files.get(key) || null;
  const r = await get('files/' + key, { access: 'private' });
  if (!r || r.statusCode !== 200) return null;
  return { buf: Buffer.from(await new Response(r.stream).arrayBuffer()), type: r.blob.contentType };
}
export async function deleteFiles(prefix) {
  if (!useBlob) { for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k); return; }
  let cursor;
  do {
    const page = await list({ prefix: 'files/' + prefix, cursor });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
}

export function _resetMemory() { memory.clear(); files.clear(); }
