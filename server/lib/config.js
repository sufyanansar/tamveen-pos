// Loads zatca.config.json (path from ZATCA_CONFIG, else next to package.json).
'use strict';
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const file = path.resolve(process.env.ZATCA_CONFIG || path.join(__dirname, '..', 'zatca.config.json'));
  if (!fs.existsSync(file)) throw new Error(`No config at ${file}. Copy zatca.config.example.json to zatca.config.json and fill it in.`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = path.dirname(file);
  c.env = process.env.ZATCA_ENV || c.env || 'sandbox';
  c.port = Number(process.env.PORT || c.port || 8080);
  c.host = process.env.HOST || c.host || '127.0.0.1';
  c.dataDir = path.resolve(base, process.env.ZATCA_DATA_DIR || c.dataDir || './data');
  c.appDir = path.resolve(base, c.appDir || '..');
  c.retryMinutes = c.retryMinutes || 5;
  const need = ['egs.commonName', 'egs.serialNumber', 'egs.vatNumber', 'egs.orgName', 'egs.branchName', 'egs.location', 'egs.industry', 'seller.name', 'seller.crn', 'seller.address'];
  const missing = need.filter((k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), c) == null);
  if (missing.length) throw new Error(`${file} is missing: ${missing.join(', ')}`);
  if (!/^3\d{13}3$/.test(c.egs.vatNumber)) throw new Error('egs.vatNumber must be 15 digits, starting and ending with 3');
  return c;
}

module.exports = { loadConfig };
