// Everything the service keeps on the POS machine, as plain files under dataDir:
//   egs.json        key, CSR and CSIDs (secret: keep this folder private and backed up)
//   chain.json      invoice counter (ICV) and previous invoice hash (PIH)
//   invoices/       one JSON record per signed invoice, including the signed XML
'use strict';
const fs = require('fs');
const path = require('path');

function store(dataDir) {
  const dir = path.resolve(dataDir);
  const invDir = path.join(dir, 'invoices');
  fs.mkdirSync(invDir, { recursive: true, mode: 0o700 });
  const file = (n) => path.join(dir, n);
  const readJSON = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
  // Write to a temp file then rename, so a power cut never leaves half a file (the chain must not break).
  const writeJSON = (p, v) => { const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 2), { mode: 0o600 }); fs.renameSync(tmp, p); };
  const safe = (id) => String(id).replace(/[^A-Za-z0-9_.-]/g, '_');

  return {
    dir,
    egs: () => readJSON(file('egs.json'), {}),
    saveEgs: (v) => writeJSON(file('egs.json'), v),
    chain: () => readJSON(file('chain.json'), null),
    saveChain: (v) => writeJSON(file('chain.json'), v),
    invoice: (id) => readJSON(path.join(invDir, safe(id) + '.json'), null),
    saveInvoice: (rec) => writeJSON(path.join(invDir, safe(rec.id) + '.json'), rec),
    invoices: () => fs.readdirSync(invDir).filter((f) => f.endsWith('.json')).map((f) => readJSON(path.join(invDir, f), null)).filter(Boolean),
  };
}

module.exports = { store };
