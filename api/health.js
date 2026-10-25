// GET /api/health — checks that the order store can be written and read back.
import { api } from './_lib/core.js';
import { read, update } from './_lib/store.js';

export default api({
  GET: async () => {
    const t0 = Date.now();
    const n = await update('health', () => ({ n: 0 }), (doc) => { doc.n += 1; doc.at = new Date().toISOString(); return doc.n; });
    const back = await read('health', () => ({ n: 0 }));
    return { ok: back.n >= n, store: process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'memory', writes: n, ms: Date.now() - t0 };
  },
});
