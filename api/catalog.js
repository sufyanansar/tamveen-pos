// /api/catalog — the products the customer app shows.
//   GET  public: shop details, categories, active products with price and stock
//   PUT  staff (POS): { categories, products } — the POS publishes its catalog whenever products change
import { api, need, fail, SHOP, slimProduct } from './_lib/core.js';
import { readDoc, updateDoc } from './_lib/docs.js';

export default api({
  GET: async ({ res }) => {
    const c = await readDoc('catalog');
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10, stale-while-revalidate=30');
    return { shop: SHOP, updatedAt: c.updatedAt, categories: c.categories, products: c.products.filter((p) => p.active) };
  },
  PUT: async ({ user, body }) => {
    need(user, 'staff');
    if (!Array.isArray(body.products) || !Array.isArray(body.categories)) fail(400, 'Send products and categories');
    return updateDoc('catalog', (doc) => {
      doc.categories = body.categories.filter((c) => c && c.id && c.id !== 'fav').slice(0, 100).map((c) => ({ id: String(c.id), en: String(c.en || ''), ar: String(c.ar || '') }));
      doc.products = body.products.slice(0, 5000).map(slimProduct);
      doc.updatedAt = new Date().toISOString();
      return { updatedAt: doc.updatedAt, count: doc.products.length };
    });
  },
});
