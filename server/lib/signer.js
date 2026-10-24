// Signs a ZATCA invoice: invoice hash, ECDSA (secp256k1) signature, XAdES signed properties and the Phase 2 QR.
// Follows the ZATCA "Electronic Invoice Security Features Implementation Standards".
'use strict';
const crypto = require('crypto');
const Z = require('../../js/zatca');
const D = require('./der');

const certPem = (body) => `-----BEGIN CERTIFICATE-----\n${body.replace(/(.{64})/g, '$1\n').trim()}\n-----END CERTIFICATE-----\n`;

// certBody: the certificate as ZATCA returns it once binarySecurityToken is base64-decoded (base64 DER, no PEM header).
function certInfo(certBody) {
  const x509 = new crypto.X509Certificate(certPem(certBody));
  const der = x509.raw;
  const parts = D.children(der, D.read(der, 0)); // tbsCertificate, signatureAlgorithm, signatureValue
  const sigBits = parts[2];
  return {
    // ZATCA's certificate digest: base64 of the hex text of SHA-256 over the base64 certificate text.
    hash: Buffer.from(crypto.createHash('sha256').update(certBody).digest('hex')).toString('base64'),
    issuer: x509.issuer.split('\n').reverse().join(', '),
    serial: BigInt('0x' + x509.serialNumber).toString(10),
    publicKey: x509.publicKey.export({ type: 'spki', format: 'der' }),
    certSignature: der.subarray(sigBits.start + 1, sigBits.end), // skip the unused-bits byte
  };
}

// The validator digests SignedProperties exactly as laid out below, whitespace included, so this text is also
// what goes into the document.
function signedProperties({ time, certHash, issuer, serial }) {
  const x = Z.escText;
  return `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
                                    <xades:SignedSignatureProperties>
                                        <xades:SigningTime>${time}</xades:SigningTime>
                                        <xades:SigningCertificate>
                                            <xades:Cert>
                                                <xades:CertDigest>
                                                    <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                                                    <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certHash}</ds:DigestValue>
                                                </xades:CertDigest>
                                                <xades:IssuerSerial>
                                                    <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${x(issuer)}</ds:X509IssuerName>
                                                    <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serial}</ds:X509SerialNumber>
                                                </xades:IssuerSerial>
                                            </xades:Cert>
                                        </xades:SigningCertificate>
                                    </xades:SignedSignatureProperties>
                                </xades:SignedProperties>`;
}

function ublExtensions({ hash, propsHash, signature, certBody, props }) {
  return '<ext:UBLExtensions><ext:UBLExtension>'
    + '<ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>'
    + '<ext:ExtensionContent>'
    + '<sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">'
    + '<sac:SignatureInformation>'
    + '<cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>'
    + '<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>'
    + '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">'
    + '<ds:SignedInfo>'
    + '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>'
    + '<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>'
    + '<ds:Reference Id="invoiceSignedData" URI="">'
    + '<ds:Transforms>'
    + '<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath></ds:Transform>'
    + '<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath></ds:Transform>'
    + '<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID=\'QR\'])</ds:XPath></ds:Transform>'
    + '<ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>'
    + '</ds:Transforms>'
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>'
    + `<ds:DigestValue>${hash}</ds:DigestValue>`
    + '</ds:Reference>'
    + '<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">'
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>'
    + `<ds:DigestValue>${propsHash}</ds:DigestValue>`
    + '</ds:Reference>'
    + '</ds:SignedInfo>'
    + `<ds:SignatureValue>${signature}</ds:SignatureValue>`
    + `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certBody}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`
    + '<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">'
    + props
    + '</xades:QualifyingProperties></ds:Object>'
    + '</ds:Signature></sac:SignatureInformation></sig:UBLDocumentSignatures>'
    + '</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>';
}

// doc: the document shape js/zatca.js build() takes, with uuid, icv and pih already set.
// Returns { xml, hash, qr, signature }.
function sign(doc, { certBody, privateKeyPem, now = new Date() }) {
  const built = Z.build(doc);
  const key = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign('sha256', Buffer.from(built.hash, 'base64'), key).toString('base64');
  const cert = certInfo(certBody);
  const props = signedProperties({ time: now.toISOString().slice(0, 19) + 'Z', certHash: cert.hash, issuer: cert.issuer, serial: cert.serial });
  const propsHash = Buffer.from(crypto.createHash('sha256').update(props).digest('hex')).toString('base64');
  const qr = Z.qr(doc, built, { signature, publicKey: cert.publicKey, certSignature: cert.certSignature });
  const xml = built.xml(qr, ublExtensions({ hash: built.hash, propsHash, signature, certBody, props }));
  return { xml, hash: built.hash, qr, signature, totals: built.totals };
}

module.exports = { sign, certInfo, certPem };
