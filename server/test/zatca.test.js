// Offline tests: run with `npm test`. ZATCA itself is replaced by a small fake server, so these prove the
// service's own logic (chain, signing, idempotency, retry), not that ZATCA accepts the documents.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Z = require('../../js/zatca');
const { sign, certInfo } = require('../lib/signer');
const { createCSR, generateKey } = require('../lib/csr');
const { service } = require('../lib/service');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const KEY = fx('test-key.pem');
const CERT = fx('test-cert.pem').replace(/-----[^-]+-----|\s/g, '');
const seller = { name: 'تموين ميني ماركت', crn: '1010123456', address: { street: 'Olaya Street', building: '1234', district: 'Al-Olaya', city: 'Riyadh', postal: '12211', country: 'SA' } };
const egs = { commonName: 'TST-1-300012345600003', serialNumber: '1-Tamveen|2-POS|3-test', vatNumber: '300012345600003', orgName: 'Tamveen', branchName: 'Branch 1', invoiceType: '0100', location: 'Riyadh', industry: 'Grocery' };
const doc = (id, extra) => Object.assign({ id, issuedAt: '2026-10-23T12:00:00.000Z', kind: 'invoice', simplified: true, payment: 'cash',
  seller: Object.assign({ vat: egs.vatNumber }, seller), buyer: null,
  lines: [{ name: 'حليب طازج', qty: 2, unit: 'piece', priceIncl: 6.5, discountIncl: 0, vat: 'standard' }, { name: 'طماطم', qty: 1.25, unit: 'kg', priceIncl: 4.8, vat: 'standard' }] }, extra);

test('SHA-256 matches Node crypto', () => {
  for (const s of ['', 'abc', 'ق'.repeat(500)]) assert.strictEqual(Buffer.from(Z.sha256(s)).toString('hex'), crypto.createHash('sha256').update(s).digest('hex'));
  assert.strictEqual(Z.PIH0, Buffer.from(crypto.createHash('sha256').update('0').digest('hex')).toString('base64'));
});

test('invoice hash covers the document without signature, QR and UBLExtensions', () => {
  const d = Object.assign(doc('A-1'), { uuid: crypto.randomUUID(), icv: 1, pih: Z.PIH0 });
  const b = Z.build(d);
  const xml = b.xml('QRDATA', '<ext:UBLExtensions><ext:UBLExtension/></ext:UBLExtensions>');
  const stripped = xml.replace(/^<\?xml[^>]*>\n/, '').replace(/<ext:UBLExtensions>.*?<\/ext:UBLExtensions>/, '')
    .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>.*?<\/cac:AdditionalDocumentReference>/, '').replace(/<cac:Signature>.*?<\/cac:Signature>/, '');
  assert.strictEqual(stripped, b.hashInput);
  assert.strictEqual(b.hash, crypto.createHash('sha256').update(stripped).digest('base64'));
});

test('totals: line nets, VAT and payable rounding', () => {
  const t = Z.computeTotals(Object.assign(doc('A-2'), { payable: 19 }));
  assert.deepStrictEqual(t.rows.map((r) => r.net), [11.3, 5.21]);
  assert.strictEqual(t.vat, 2.48);
  assert.strictEqual(t.inclusive, 18.99);
  assert.strictEqual(t.rounding, 0.01);
});

test('CSR is signed by the EGS key and carries the ZATCA fields', () => {
  const k = generateKey();
  const pem = createCSR(k, egs, 'sandbox');
  assert.match(pem, /^-----BEGIN CERTIFICATE REQUEST-----/);
  const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
  assert.ok(der.includes(Buffer.from('TSTZATCA-Code-Signing')));
  assert.ok(der.includes(Buffer.from(egs.serialNumber)));
});

test('signature verifies with the certificate and the QR has 9 tags', () => {
  const d = Object.assign(doc('A-3'), { uuid: crypto.randomUUID(), icv: 1, pih: Z.PIH0 });
  const s = sign(d, { certBody: CERT, privateKeyPem: KEY });
  const pub = crypto.createPublicKey(`-----BEGIN CERTIFICATE-----\n${CERT}\n-----END CERTIFICATE-----`);
  assert.ok(crypto.verify('sha256', Buffer.from(s.hash, 'base64'), pub, Buffer.from(s.signature, 'base64')));
  const q = Buffer.from(s.qr, 'base64'); const tags = []; let p = 0;
  while (p < q.length) { tags.push(q[p]); p += 2 + q[p + 1]; }
  assert.deepStrictEqual(tags, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(s.xml.includes(`<ds:DigestValue>${s.hash}</ds:DigestValue>`));
  assert.ok(s.xml.includes(certInfo(CERT).serial));
});

// A stand-in for the Fatoora API.
function fakeZatca() {
  const calls = []; let down = false;
  const token = Buffer.from(CERT).toString('base64');
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({ path: req.url, headers: req.headers, body: body && JSON.parse(body) });
      if (down) { res.writeHead(503); return res.end('down'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/compliance' || req.url === '/production/csids') return res.end(JSON.stringify({ requestID: 1234, binarySecurityToken: token, secret: 's3cret' }));
      res.end(JSON.stringify({ validationResults: { status: 'PASS', warningMessages: [], errorMessages: [] }, reportingStatus: 'REPORTED' }));
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, calls, url: `http://127.0.0.1:${srv.address().port}`, setDown: (v) => { down = v; } })));
}

test('onboard, issue a chain of invoices, never sign twice, queue and retry when ZATCA is down', async () => {
  const z = await fakeZatca();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zatca-'));
  fs.writeFileSync(path.join(dataDir, 'egs.json'), JSON.stringify({ privateKey: KEY }));
  const svc = service({ env: 'sandbox', baseUrl: z.url, dataDir, egs, seller });
  try {
    const ob = await svc.onboard('123345');
    assert.ok(ob.ok);
    assert.strictEqual(ob.results.length, 3); // simplified invoice, credit note, debit note
    assert.strictEqual(z.calls[0].headers.otp, '123345');

    const a = await svc.issue(doc('INV-1'));
    const b = await svc.issue(doc('INV-2'));
    assert.strictEqual(a.status, 'reported');
    assert.deepStrictEqual([a.icv, b.icv], [1, 2]);
    assert.strictEqual(svc.db.invoice('INV-2').pih, a.hash);
    assert.strictEqual(svc.db.invoice('INV-1').pih, Z.PIH0);
    assert.strictEqual(z.calls.filter((c) => c.path === '/invoices/reporting/single').length, 2);

    const again = await svc.issue(doc('INV-1'));
    assert.strictEqual(again.uuid, a.uuid);
    assert.strictEqual(svc.status().icv, 2);

    z.setDown(true);
    const c = await svc.issue(doc('INV-3'));
    assert.strictEqual(c.status, 'pending');
    assert.strictEqual(svc.status().pending, 1);
    z.setDown(false);
    const r = await svc.retryPending();
    assert.deepStrictEqual(r, { tried: 1, stillPending: 0 });
    assert.strictEqual(svc.record('INV-3').status, 'reported');

    // A new receipt reaching ZATCA also sends the ones still waiting, without waiting for the timer.
    z.setDown(true);
    assert.strictEqual((await svc.issue(doc('INV-5'))).status, 'pending');
    z.setDown(false);
    assert.strictEqual((await svc.issue(doc('INV-6'))).status, 'reported');
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual(svc.record('INV-5').status, 'reported');

    await assert.rejects(svc.issue(doc('INV-4', { seller: { vat: '311111111111113' } })), /Seller VAT/);
  } finally { z.srv.close(); }
});
