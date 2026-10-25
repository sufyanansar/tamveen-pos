// /api/orders — online orders for the shop.
//   GET    customer: their orders (with the agent's live position while one is on the way)
//          staff: active orders and the last 2 days; driver: orders ready for pick-up and their own
//   POST   customer: { lines: [{ pid, qty }], addressId, note, payment: 'cash' | 'card' }
//   PATCH  { id, action, ... }
//          staff:    prepare | ready | billed { invoiceId, total } | cancel { reason }
//          driver:   pickup | delivered { collected } | problem { note } | unassign
//          customer: cancel (only while the order is still new)
import { api, need, fail, r2, SHOP } from './_lib/core.js';
import { readDoc, updateDoc, agentView, ACTIVE } from './_lib/docs.js';

const vatRate = (v) => (v === 'standard' ? 0.15 : 0);
const now = () => new Date().toISOString();

function forCustomer(o, fleet, orders) {
  const out = { ...o };
  delete out.agentNote;
  if (o.status === 'out' && o.agentId && fleet.agents[o.agentId]) {
    const a = agentView(fleet.agents[o.agentId], orders);
    out.agent = { name: a.name, nameAr: a.nameAr, phone: a.phone, lat: a.lat, lng: a.lng, at: a.at, heading: a.heading };
  } else if (o.agentId) {
    const a = fleet.agents[o.agentId];
    out.agent = a ? { name: agentView(a, orders).name } : null;
  }
  return out;
}

export default api({
  GET: async ({ user }) => {
    need(user);
    const { orders } = await readDoc('orders');
    if (user.role === 'customer') {
      const mine = orders.filter((o) => o.customerId === user.sub).slice(-50).reverse();
      const fleet = mine.some((o) => o.status === 'out') ? await readDoc('fleet') : { agents: {} };
      return { orders: mine.map((o) => forCustomer(o, fleet, orders)) };
    }
    const since = Date.now() - 2 * 864e5;
    if (user.role === 'staff') return { orders: orders.filter((o) => ACTIVE.includes(o.status) || Date.parse(o.at) > since).reverse() };
    if (user.role === 'driver') {
      return { orders: orders.filter((o) => (o.status === 'ready' && !o.agentId) || (o.agentId === user.sub && (o.status === 'out' || Date.parse(o.at) > since))).reverse() };
    }
    fail(403, 'Not allowed');
  },

  POST: async ({ user, body }) => {
    need(user, 'customer');
    const [catalog, customers] = await Promise.all([readDoc('catalog'), readDoc('customers')]);
    const c = customers.byId[user.sub];
    if (!c) fail(401, 'Please sign in again');
    if (!c.name) fail(400, 'Add your name first');
    const addr = c.addresses.find((a) => a.id === body.addressId) || c.addresses.find((a) => a.id === c.defaultAddress);
    if (!addr) fail(400, 'Add a delivery address');
    if (!Array.isArray(body.lines) || !body.lines.length) fail(400, 'Your basket is empty');
    // Prices and names always come from the shop's catalog, never from the phone.
    const lines = [];
    for (const l of body.lines.slice(0, 100)) {
      const p = catalog.products.find((x) => x.id === String(l.pid) && x.active);
      if (!p) fail(409, 'An item in your basket is no longer available. Please check your basket.');
      if (p.stock <= 0) fail(409, `${p.en} is out of stock`);
      const qty = p.weighted ? Math.round(Math.max(0.25, Number(l.qty) || 0) * 4) / 4 : Math.max(1, Math.floor(Number(l.qty) || 0));
      lines.push({ pid: p.id, en: p.en, ar: p.ar, unit: p.unit, price: p.price, qty: Math.min(qty, 999), vat: p.vat, weighted: p.weighted, discount: 0, reason: '' });
    }
    const subtotal = r2(lines.reduce((s, l) => s + l.price * l.qty, 0));
    if (subtotal < SHOP.minOrder) fail(400, `Minimum order is ${SHOP.minOrder} SAR`);
    const fee = subtotal >= SHOP.freeDeliveryFrom ? 0 : SHOP.deliveryFee;
    const vat = r2(lines.reduce((s, l) => { const g = l.price * l.qty, rate = vatRate(l.vat); return s + g - g / (1 + rate); }, 0) + fee - fee / 1.15);
    const payment = body.payment === 'card' ? 'card' : 'cash';
    return updateDoc('orders', (doc) => {
      doc.seq += 1;
      const o = {
        id: 'APP-' + doc.seq, at: now(), channel: 'App', type: 'delivery', status: 'new',
        customerId: c.id, customer: { name: c.name, phone: c.phone || '' },
        address: { ...addr }, note: String(body.note || '').slice(0, 300), payment,
        lines, subtotal, deliveryFee: fee, vat, total: r2(subtotal + fee),
        history: [{ s: 'new', at: now(), by: 'customer' }],
      };
      doc.orders.push(o);
      if (doc.orders.length > 2000) doc.orders = doc.orders.filter((x) => ACTIVE.includes(x.status) || Date.parse(x.at) > Date.now() - 90 * 864e5);
      return { order: o };
    });
  },

  PATCH: async ({ user, body }) => {
    need(user);
    const out = await updateDoc('orders', (doc) => {
      const o = doc.orders.find((x) => x.id === body.id);
      if (!o) fail(404, 'Order not found');
      const set = (s) => { o.status = s; o.history.push({ s, at: now(), by: user.role === 'staff' ? user.name : user.role === 'driver' ? user.name : 'customer' }); };
      const a = body.action;
      if (user.role === 'customer') {
        if (o.customerId !== user.sub) fail(404, 'Order not found');
        if (a !== 'cancel') fail(403, 'Not allowed');
        if (o.status !== 'new') fail(409, 'The shop has started on this order. Please call the shop to change it.');
        o.cancelReason = 'Cancelled by customer'; set('cancelled');
      } else if (user.role === 'staff') {
        if (a === 'prepare' && ['new'].includes(o.status)) set('preparing');
        else if (a === 'ready' && ['new', 'preparing'].includes(o.status)) set('ready');
        else if (a === 'billed' && ['new', 'preparing', 'ready'].includes(o.status)) {
          o.invoiceId = String(body.invoiceId || '').slice(0, 40); if (body.total != null) o.billedTotal = r2(body.total);
          if (o.status !== 'ready') set('ready'); else o.history.push({ s: 'billed', at: now(), by: user.name });
        } else if (a === 'cancel' && ACTIVE.includes(o.status)) { o.cancelReason = String(body.reason || 'Cancelled by the shop').slice(0, 200); set('cancelled'); }
        else fail(409, 'That step is not possible now');
      } else if (user.role === 'driver') {
        if (a === 'pickup') {
          if (o.agentId && o.agentId !== user.sub) fail(409, 'Another driver already took this order');
          if (o.status !== 'ready') fail(409, 'This order is not ready yet');
          o.agentId = user.sub; o.agentName = user.name; set('out');
        } else if (o.agentId !== user.sub) fail(403, 'This is not your delivery');
        else if (a === 'delivered' && o.status === 'out') { o.collected = body.collected != null ? r2(body.collected) : null; set('delivered'); }
        else if (a === 'problem' && o.status === 'out') { o.agentNote = String(body.note || '').slice(0, 200); o.history.push({ s: 'problem', at: now(), by: user.name, note: o.agentNote }); }
        else if (a === 'unassign' && o.status === 'out') { o.agentId = null; o.agentName = null; set('ready'); }
        else fail(409, 'That step is not possible now');
      } else fail(403, 'Not allowed');
      return o;
    });
    return { order: out };
  },
});
