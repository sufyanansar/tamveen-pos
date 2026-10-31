// Copies the customer web app and the files it uses into www/, keeping the same relative paths
// (shop/ refers to ../assets and ../js/leaflet), so the store app runs the exact same code as the web.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const www = path.join(here, 'www');
const copy = (rel) => fs.cpSync(path.join(root, rel), path.join(www, rel), { recursive: true });

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
copy('shop');
copy('js/leaflet');
copy('js/map-tiles.js');
if (fs.existsSync(path.join(root, 'assets/products'))) copy('assets/products');
for (const f of ['logo.svg', 'vision-2030.png', 'flag.png', 'flag.mp4', 'sora.woff2']) copy('assets/' + f);
fs.writeFileSync(path.join(www, 'index.html'), '<!doctype html><meta charset="utf-8"><script>location.replace("shop/index.html")</script>\n');
console.log('www ready');
