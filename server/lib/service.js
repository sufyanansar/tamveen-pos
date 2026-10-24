// The EGS unit: owns the invoice chain, signs invoices and sends them to ZATCA.
'use strict';
const crypto = require('crypto');
const Z = require('../../js/zatca');
const { sign } = require('./signer');
const { generateKey, createCSR } = require('./csr');
const { client, certFromToken } = require('./fatoora');
const { store } = require('./store');

function service(config) {
  const db = store(config.dataDir);
  const api = client(config.env, config.baseUrl);
  const egsCfg = config.egs;
  let queue = Promise.resolve();
  // Signing must be strictly one at a time: each invoice carries the previous one's hash.
  const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

  const onboarded = () => { const e = db.egs(); return !!(e.production && e.production.token); };
  const chain = () => db.chain() || { icv: 0, pih: Z.PIH0 };
  const publicRecord = (r) => r && ({ id: r.id, uuid: r.uuid, icv: r.icv, hash: r.hash, qr: r.qr, status: r.status, kind: r.kind, simplified: r.simplified,
    signedAt: r.signedAt, submittedAt: r.submittedAt, warnings: r.warnings || [], errors: r.errors || [] });

  function check(doc) {
    if (!doc || !doc.id || !Array.isArray(doc.lines) || !doc.lines.length) throw Object.assign(new Error('An invoice needs an id and at least one line'), { status: 400 });
    if (!doc.seller || doc.seller.vat !== egsCfg.vatNumber) throw Object.assign(new Error(`Seller VAT number must be ${egsCfg.vatNumber}, the one this device is onboarded with`), { status: 400 });
  }

  async function submit(rec) {
    const egs = db.egs();
    const signed = { xml: rec.xml, hash: rec.hash };
    try {
      const res = rec.simplified ? await api.report(egs.production, signed, rec.uuid) : await api.clear(egs.production, signed, rec.uuid);
      const v = (res.body && res.body.validationResults) || {};
      rec.warnings = (v.warningMessages || []).map((m) => m.message || m);
      rec.errors = (v.errorMessages || []).map((m) => m.message || m);
      rec.submittedAt = new Date().toISOString();
      rec.zatcaStatus = res.body && (res.body.reportingStatus || res.body.clearanceStatus);
      if (res.status === 200 || res.status === 202) {
        rec.status = rec.simplified ? 'reported' : 'cleared';
        // For standard invoices the cleared XML from ZATCA (with its QR) is the legal invoice.
        if (res.body && res.body.clearedInvoice) {
          rec.xml = Buffer.from(res.body.clearedInvoice, 'base64').toString('utf8');
          const m = rec.xml.match(/<cbc:ID>QR<\/cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</);
          if (m) rec.qr = m[1];
        }
      } else rec.status = 'rejected';
    } catch (e) {
      rec.status = 'pending'; rec.lastError = e.message; // network trouble: try again later
    }
    db.saveInvoice(rec);
    return rec;
  }

  const self = {
    config, db,
    status() {
      const e = db.egs(), c = chain(), all = db.invoices();
      return {
        env: config.env, onboarded: onboarded(), vatNumber: egsCfg.vatNumber, icv: c.icv,
        pending: all.filter((r) => r.status === 'pending').length, rejected: all.filter((r) => r.status === 'rejected').length,
        certificateExpires: e.production && e.production.expires, demoCertificate: !!(e.production && e.production.demo),
      };
    },

    // Signs and submits one invoice. Sending the same invoice id again returns the first result and never signs twice.
    issue(doc) {
      return serial(async () => {
        const existing = db.invoice(doc && doc.id);
        if (existing) return publicRecord(existing.status === 'pending' ? await submit(existing) : existing);
        if (!onboarded()) throw Object.assign(new Error('This device is not onboarded with ZATCA yet. Run: npm run onboard -- --otp <OTP>'), { status: 409 });
        check(doc);
        const egs = db.egs(), c = chain();
        // The legal seller details come from this device's config, not from the till.
        const seller = { name: config.seller.name, vat: egsCfg.vatNumber, crn: config.seller.crn, address: config.seller.address };
        const full = Object.assign({}, doc, { seller, uuid: crypto.randomUUID(), icv: c.icv + 1, pih: c.pih });
        const signed = sign(full, { certBody: egs.production.cert, privateKeyPem: egs.privateKey });
        const rec = { id: doc.id, uuid: full.uuid, icv: full.icv, pih: full.pih, hash: signed.hash, qr: signed.qr, xml: signed.xml,
          kind: full.kind || 'invoice', simplified: !!full.simplified, signedAt: new Date().toISOString(), status: 'pending', doc: full };
        // Save the record and move the chain on before talking to ZATCA, so a crash cannot reuse a counter.
        db.saveInvoice(rec);
        db.saveChain({ icv: rec.icv, pih: rec.hash });
        return publicRecord(await submit(rec));
      }).then((out) => {
        // ZATCA answered, so send anything still waiting from when it did not, without waiting for the timer.
        if (out.status !== 'pending' && db.invoices().some((r) => r.status === 'pending')) self.retryPending().catch(() => {});
        return out;
      });
    },

    retryPending() {
      return serial(async () => {
        if (!onboarded()) return { tried: 0 };
        const pending = db.invoices().filter((r) => r.status === 'pending').sort((a, b) => a.icv - b.icv);
        for (const r of pending) await submit(r);
        return { tried: pending.length, stillPending: db.invoices().filter((r) => r.status === 'pending').length };
      });
    },

    record: (id) => publicRecord(db.invoice(id)),
    xml: (id) => { const r = db.invoice(id); return r && r.xml; },

    // Onboarding: key + CSR -> compliance CSID -> compliance checks -> production CSID.
    onboard(otp, log = () => {}) {
      return serial(async () => {
        const egs = db.egs();
        if (!egs.privateKey) { egs.privateKey = generateKey(); log('Created a new secp256k1 key'); }
        egs.csr = createCSR(egs.privateKey, egsCfg, config.env);
        egs.env = config.env;
        db.saveEgs(egs);

        log(`Requesting a compliance CSID from ZATCA (${config.env})`);
        const cc = await api.complianceCSID(egs.csr, otp);
        if (cc.status !== 200 || !cc.body.binarySecurityToken) throw new Error('Compliance CSID refused: ' + JSON.stringify(cc.body));
        egs.compliance = { token: cc.body.binarySecurityToken, secret: cc.body.secret, requestId: cc.body.requestID, cert: certFromToken(cc.body.binarySecurityToken) };
        db.saveEgs(egs);

        const samples = complianceSamples(egsCfg, config.seller);
        let pih = Z.PIH0;
        const results = [];
        for (let i = 0; i < samples.length; i++) {
          const doc = Object.assign(samples[i], { uuid: crypto.randomUUID(), icv: i + 1, pih });
          const signed = sign(doc, { certBody: egs.compliance.cert, privateKeyPem: egs.privateKey });
          pih = signed.hash;
          const res = await api.complianceCheck(egs.compliance, signed, doc.uuid);
          const v = (res.body && res.body.validationResults) || {};
          const ok = res.status === 200 || res.status === 202;
          results.push({ sample: doc.id, ok, status: res.status, errors: (v.errorMessages || []).map((m) => m.message), warnings: (v.warningMessages || []).map((m) => m.message) });
          log(`Compliance check ${doc.id}: ${ok ? 'passed' : 'FAILED'} (${res.status})`);
        }
        if (results.some((r) => !r.ok)) { egs.complianceResults = results; db.saveEgs(egs); return { ok: false, results }; }

        log('Requesting the production CSID');
        const pc = await api.productionCSID(egs.compliance, egs.compliance.requestId);
        if (pc.status !== 200 || !pc.body.binarySecurityToken) throw new Error('Production CSID refused: ' + JSON.stringify(pc.body));
        const cert = certFromToken(pc.body.binarySecurityToken);
        const x509 = new crypto.X509Certificate(require('./signer').certPem(cert));
        const ownKey = x509.publicKey.export({ type: 'spki', format: 'der' }).equals(crypto.createPublicKey(egs.privateKey).export({ type: 'spki', format: 'der' }));
        // The developer-portal sandbox hands every caller the same demo certificate (another VAT number and key),
        // so invoices signed with it are always rejected. Keep it only for the sandbox and say so.
        if (!ownKey && config.env !== 'sandbox') throw new Error('ZATCA returned a production certificate that does not match this device\'s key');
        egs.production = { token: pc.body.binarySecurityToken, secret: pc.body.secret, requestId: pc.body.requestID, cert, expires: x509.validTo, demo: !ownKey };
        egs.complianceResults = results;
        db.saveEgs(egs);
        if (!ownKey) log('Onboarded with the sandbox demo certificate. Compliance checks passed, but reporting will be rejected in the sandbox; use the simulation environment for real reporting tests.');
        else log('Onboarded. This device can now sign and report invoices.');
        return { ok: true, results, demoCertificate: !ownKey };
      });
    },
  };
  return self;
}

// The sample documents ZATCA wants to see before it issues a production CSID: one of each invoice kind
// for every invoice type the CSR says the device issues (title: 1 = standard, 2nd digit = simplified).
function complianceSamples(egs, seller) {
  const types = egs.invoiceType || '0100';
  const sellerDoc = { name: seller.name, vat: egs.vatNumber, crn: seller.crn, address: seller.address };
  const buyer = { name: 'Sample Buyer Co.', vat: '399999999800003', address: { street: 'King Fahd Road', building: '1111', district: 'Al-Malaz', city: 'Riyadh', postal: '12345', country: 'SA' } };
  const lines = [{ name: 'Sample item', qty: 2, unit: 'piece', priceIncl: 11.5, discountIncl: 0, vat: 'standard' }];
  const out = [];
  const add = (simplified) => ['invoice', 'credit', 'debit'].forEach((kind) => out.push({
    id: `COMPLIANCE-${simplified ? 'S' : 'T'}-${kind}`, issuedAt: new Date().toISOString(), kind, simplified, payment: 'cash',
    ref: kind === 'invoice' ? undefined : `COMPLIANCE-${simplified ? 'S' : 'T'}-invoice`, reason: kind === 'invoice' ? undefined : 'Compliance check',
    seller: sellerDoc, buyer: simplified ? null : buyer, lines,
  }));
  if (types[0] === '1') add(false);
  if (types[1] === '1') add(true);
  return out;
}

module.exports = { service, complianceSamples };
