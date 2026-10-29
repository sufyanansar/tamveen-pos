// Map tiles for every Tamveen map (POS delivery map, customer app, driver app).
// Change the provider here only. OpenStreetMap needs no key; it is fine for a single shop's traffic.
// To move to Google Maps later, put the key in `google` and set `use: 'google'`.
window.TAMVEEN_TILES = (function () {
  var google = ''; // Google Maps Tiles API key
  var providers = {
    osm: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    google: {
      url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=' + google,
      options: { maxZoom: 20, subdomains: '0123', attribution: '&copy; Google' },
    },
  };
  var use = google ? 'google' : 'osm';
  return providers[use];
})();
