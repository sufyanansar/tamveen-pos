// The five documents the online-order API keeps, with their empty shapes.
import { read, update } from './store.js';
import { seedCatalog, SHOP, DRIVERS, metres } from './core.js';

const empty = {
  catalog: () => seedCatalog(),
  orders: () => ({ seq: 1100, orders: [] }),
  customers: () => ({ byId: {} }),
  fleet: () => ({ agents: {} }),
  shop: () => ({}),
};
export const readDoc = (name) => read(name, empty[name]);
export const updateDoc = (name, fn) => update(name, empty[name], fn);

// The shop's details, with the location a manager set in the POS (if any) over the built-in one.
export async function shopInfo() {
  const d = await readDoc('shop');
  return { ...SHOP, ...(d.lat != null ? { lat: d.lat, lng: d.lng } : {}), ...(d.address ? { address: d.address } : {}) };
}

// Order statuses: new → preparing → ready → out → delivered, or cancelled.
export const ACTIVE = ['new', 'preparing', 'ready', 'out'];

// What a delivery agent's live position looks like to the store, with a status worked out from it.
export function agentView(a, orders, shop = SHOP) {
  const d = DRIVERS.find((x) => x.id === a.id) || {};
  const carrying = orders.filter((o) => o.agentId === a.id && o.status === 'out').map((o) => o.id);
  const fresh = a.at && Date.now() - Date.parse(a.at) < 120e3;
  const atStore = a.lat != null && metres(a, shop) < 150;
  const status = !a.onDuty ? 'off' : !fresh ? 'nosignal' : carrying.length ? 'delivering' : atStore ? 'store' : 'returning';
  return { id: a.id, name: d.name || a.id, nameAr: d.nameAr || '', phone: d.phone || '', onDuty: !!a.onDuty, lat: a.lat, lng: a.lng, acc: a.acc, heading: a.heading, at: a.at, status, carrying };
}
