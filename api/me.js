// /api/me — the signed-in customer's profile.
//   GET     profile
//   PUT     { name?, phone?, addresses?, defaultAddress? }
//   DELETE  delete the account: profile and addresses go at once; past orders keep only what a tax invoice needs.
import { api, need, fail } from './_lib/core.js';
import { readDoc, updateDoc, ACTIVE } from './_lib/docs.js';

const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const num = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
function cleanAddress(a, i) {
  return {
    id: s(a.id, 24) || 'addr' + Date.now().toString(36) + i, label: s(a.label, 20) || 'Home',
    house: s(a.house, 80), street: s(a.street, 80), district: s(a.district, 60), city: s(a.city, 40) || 'Riyadh', notes: s(a.notes, 200),
    lat: num(a.lat), lng: num(a.lng),
  };
}

export default api({
  GET: async ({ user }) => {
    need(user, 'customer');
    const c = (await readDoc('customers')).byId[user.sub];
    if (!c) fail(401, 'Please sign in again');
    return c;
  },
  PUT: async ({ user, body }) => {
    need(user, 'customer');
    return updateDoc('customers', (doc) => {
      const c = doc.byId[user.sub]; if (!c) fail(401, 'Please sign in again');
      if (body.name != null) { if (!s(body.name, 60)) fail(400, 'Enter your name'); c.name = s(body.name, 60); }
      if (body.phone != null) c.phone = s(body.phone, 20);
      if (Array.isArray(body.addresses)) c.addresses = body.addresses.slice(0, 10).map(cleanAddress);
      if (body.defaultAddress !== undefined) c.defaultAddress = s(body.defaultAddress, 24) || null;
      if (!c.addresses.some((a) => a.id === c.defaultAddress)) c.defaultAddress = c.addresses[0] ? c.addresses[0].id : null;
      return c;
    });
  },
  DELETE: async ({ user }) => {
    need(user, 'customer');
    await updateDoc('customers', (doc) => { delete doc.byId[user.sub]; });
    await updateDoc('orders', (doc) => {
      doc.orders.forEach((o) => {
        if (o.customerId !== user.sub) return;
        if (ACTIVE.includes(o.status) && o.status !== 'out') { o.status = 'cancelled'; o.cancelReason = 'Customer deleted their account'; o.history.push({ s: 'cancelled', at: new Date().toISOString(), by: 'customer' }); }
        o.customerId = null; o.customer = { name: 'Deleted customer', phone: '' };
        if (o.status !== 'out') o.address = { district: o.address && o.address.district || '' };
      });
    });
    return { deleted: true };
  },
});
