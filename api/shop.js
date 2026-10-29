// /api/shop — where the store is.
//   GET  public: the shop details, with the location a manager set
//   PUT  staff, manager or owner only: { lat, lng, address? } — moves the store pin
import { api, need, fail } from './_lib/core.js';
import { updateDoc, shopInfo } from './_lib/docs.js';

export default api({
  GET: async () => shopInfo(),
  PUT: async ({ user, body }) => {
    need(user, 'staff');
    if (!['manager', 'owner'].includes(user.staffRole)) fail(403, 'Only a manager or the owner can change the store location');
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'Pick a point on the map');
    await updateDoc('shop', (doc) => {
      doc.lat = Math.round(lat * 1e6) / 1e6; doc.lng = Math.round(lng * 1e6) / 1e6;
      if (body.address != null) doc.address = String(body.address).trim().slice(0, 200) || undefined;
      doc.updatedAt = new Date().toISOString(); doc.by = user.name;
    });
    return shopInfo();
  },
});
