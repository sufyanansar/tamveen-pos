// ZATCA Fatoora API client (API version V2).
'use strict';

const BASE = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

class FatooraError extends Error {
  constructor(status, body) {
    super(`ZATCA replied ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status; this.body = body;
  }
}

function client(env, baseUrl) {
  const base = baseUrl || BASE[env];
  if (!base) throw new Error(`Unknown ZATCA environment "${env}" (use sandbox, simulation or production)`);
  const basic = (cred) => 'Basic ' + Buffer.from(`${cred.token}:${cred.secret}`).toString('base64');

  async function post(path, body, headers) {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Version': 'V2', 'Accept-Language': 'en', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch (e) { json = text; }
    // 202 = accepted with warnings; 400 on reporting/clearance still carries validationResults.
    if (res.status >= 500 || res.status === 401 || res.status === 403 || res.status === 429) throw new FatooraError(res.status, json);
    return { status: res.status, body: json };
  }
  const invoiceBody = (signed, uuid) => ({ invoiceHash: signed.hash, uuid, invoice: Buffer.from(signed.xml, 'utf8').toString('base64') });

  return {
    env, base,
    // Step 1: CSR + OTP from the Fatoora portal -> compliance CSID.
    complianceCSID: (csrPem, otp) => post('/compliance', { csr: Buffer.from(csrPem, 'utf8').toString('base64') }, { OTP: String(otp) }),
    // Step 2: sample documents signed with the compliance CSID.
    complianceCheck: (cred, signed, uuid) => post('/compliance/invoices', invoiceBody(signed, uuid), { Authorization: basic(cred) }),
    // Step 3: production CSID (the "PCSID") used for real invoices.
    productionCSID: (cred, requestId) => post('/production/csids', { compliance_request_id: String(requestId) }, { Authorization: basic(cred) }),
    // Simplified (B2C) invoices and their notes: report within 24 hours.
    report: (cred, signed, uuid) => post('/invoices/reporting/single', invoiceBody(signed, uuid), { Authorization: basic(cred), 'Clearance-Status': '0' }),
    // Standard (B2B) invoices and their notes: cleared before they are given to the buyer.
    clear: (cred, signed, uuid) => post('/invoices/clearance/single', invoiceBody(signed, uuid), { Authorization: basic(cred), 'Clearance-Status': '1' }),
  };
}

// ZATCA returns the certificate as base64(base64 DER); keep the inner base64 text.
const certFromToken = (binarySecurityToken) => Buffer.from(binarySecurityToken, 'base64').toString('utf8');

module.exports = { client, certFromToken, FatooraError, BASE };
