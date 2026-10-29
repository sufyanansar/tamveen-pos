// Map tiles for every Tamveen map (POS delivery map, customer app, driver app).
// Maps start on OpenStreetMap (no key) and switch to Google Maps once /api/maps hands out a Google
// tile session, which it does when GOOGLE_MAPS_KEY is set in Vercel. The key is never in this repo.
(function () {
  var OSM = {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  };
  window.TAMVEEN_TILES = OSM;
  var pending = {};
  function load(api, lang) {
    var k = 'tamveen.tiles.' + lang;
    try { var c = JSON.parse(localStorage.getItem(k) || 'null'); if (c && c.until > Date.now()) return Promise.resolve(c.tiles); } catch (e) { /* no storage */ }
    if (!pending[lang]) {
      pending[lang] = fetch(api + '/maps?lang=' + lang).then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
        if (t && t.provider === 'google') { try { localStorage.setItem(k, JSON.stringify({ tiles: t, until: Date.now() + 12 * 36e5 })); } catch (e) { /* fine */ } return t; }
        return null;
      }).catch(function () { return null; });
    }
    return pending[lang];
  }
  // Adds the tile layer to a Leaflet map: OpenStreetMap at once, swapped for Google when it is available.
  window.tamveenTiles = function (map, api, lang) {
    var layer = L.tileLayer(OSM.url, OSM.options).addTo(map);
    load(api, lang === 'ar' ? 'ar' : 'en').then(function (t) {
      if (!t) return;
      // Keep OpenStreetMap underneath until Google's first tiles arrive; drop Google if its key is refused.
      var g = L.tileLayer(t.url, t.options).addTo(map), shown = false;
      g.once('load', function () { shown = true; map.removeLayer(layer); });
      g.once('tileerror', function () { if (!shown) map.removeLayer(g); });
    });
    return layer;
  };
})();
