// /api/fleet — where the delivery agents are.
//   POST  driver: { onDuty, lat?, lng?, acc?, heading? } — sent every ~15 s while on duty; off duty clears the position
//   GET   staff: the shop, every agent with status and position, and the orders out for delivery
import { api, need, fail, SHOP } from './_lib/core.js';
import { readDoc, updateDoc, agentView } from './_lib/docs.js';

const n = (v) => (v == null || !isFinite(Number(v)) ? null : Number(v));

export default api({
  POST: async ({ user, body }) => {
    need(user, 'driver');
    const lat = n(body.lat), lng = n(body.lng);
    if (body.onDuty && (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180)) fail(400, 'Location missing');
    await updateDoc('fleet', (doc) => {
      doc.agents[user.sub] = body.onDuty
        ? { id: user.sub, onDuty: true, lat, lng, acc: n(body.acc), heading: n(body.heading), at: new Date().toISOString() }
        : { id: user.sub, onDuty: false, at: new Date().toISOString() };
    });
    return { ok: true };
  },
  GET: async ({ user }) => {
    need(user, 'staff');
    const [fleet, { orders }] = await Promise.all([readDoc('fleet'), readDoc('orders')]);
    const out = orders.filter((o) => o.status === 'out').map((o) => ({ id: o.id, agentId: o.agentId, customer: o.customer.name, district: o.address.district, lat: o.address.lat, lng: o.address.lng, payment: o.payment, total: o.billedTotal != null ? o.billedTotal : o.total }));
    return { shop: SHOP, agents: Object.values(fleet.agents).map((a) => agentView(a, orders)), deliveries: out };
  },
});
