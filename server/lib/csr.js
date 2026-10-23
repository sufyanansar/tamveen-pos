// EGS key pair and certificate signing request (CSR) for ZATCA onboarding, built with Node's crypto only,
// so the POS machine does not need OpenSSL installed.
'use strict';
const crypto = require('crypto');
const D = require('./der');

const TEMPLATE = { sandbox: 'TSTZATCA-Code-Signing', simulation: 'PREZATCA-Code-Signing', production: 'ZATCA-Code-Signing' };
const rdn = (type, value, printable) => D.set(D.seq(D.oid(type), printable ? D.printable(value) : D.utf8(value)));

function generateKey() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  return privateKey.export({ type: 'sec1', format: 'pem' });
}

// egs: { commonName, serialNumber, vatNumber, orgName, branchName, invoiceType, location, industry }
function createCSR(privateKeyPem, egs, env) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const spki = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
  const subject = D.seq(
    rdn('2.5.4.3', egs.commonName), // CN
    rdn('2.5.4.11', egs.branchName), // OU
    rdn('2.5.4.10', egs.orgName), // O
    rdn('2.5.4.6', 'SA', true), // C
  );
  const dirName = D.seq(
    rdn('2.5.4.4', egs.serialNumber), // SN: 1-Solution|2-Model|3-Serial
    rdn('0.9.2342.19200300.100.1.1', egs.vatNumber), // UID: VAT number
    rdn('2.5.4.12', egs.invoiceType || '0100'), // title: invoice types (standard, simplified, -, -)
    rdn('2.5.4.26', egs.location), // registeredAddress
    rdn('2.5.4.15', egs.industry), // businessCategory
  );
  const extensions = D.seq(
    D.seq(D.oid('1.3.6.1.4.1.311.20.2'), D.octet(D.utf8(TEMPLATE[env] || TEMPLATE.sandbox))),
    D.seq(D.oid('2.5.29.17'), D.octet(D.seq(D.ctx(4, dirName)))),
  );
  const attributes = D.ctx(0, D.seq(D.oid('1.2.840.113549.1.9.14'), D.set(extensions)));
  const info = D.seq(D.int(0), subject, spki, attributes);
  const signature = crypto.sign('sha256', info, key);
  const der = D.seq(info, D.seq(D.oid('1.2.840.10045.4.3.2')), D.bitString(signature));
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN CERTIFICATE REQUEST-----\n${b64}\n-----END CERTIFICATE REQUEST-----\n`;
}

module.exports = { generateKey, createCSR };
