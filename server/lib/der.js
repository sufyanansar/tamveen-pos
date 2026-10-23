// Minimal DER (ASN.1) writer and reader: enough to build a CSR and pull the signature out of a certificate.
'use strict';

function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const int = (n) => tlv(0x02, Buffer.from([n]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const printable = (s) => tlv(0x13, Buffer.from(s, 'ascii'));
const octet = (b) => tlv(0x04, b);
const bitString = (b) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
const ctx = (n, body, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, body);
function oid(dotted) {
  const parts = dotted.split('.').map(Number);
  const out = [40 * parts[0] + parts[1]];
  parts.slice(2).forEach((p) => {
    const stack = [p & 0x7f]; p >>= 7;
    while (p > 0) { stack.unshift((p & 0x7f) | 0x80); p >>= 7; }
    out.push(...stack);
  });
  return tlv(0x06, Buffer.from(out));
}

// Reads one element at offset: { tag, start (of contents), end }.
function read(buf, off = 0) {
  const tag = buf[off]; let l = buf[off + 1], p = off + 2;
  if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = l * 256 + buf[p + i]; p += n; }
  return { tag, start: p, end: p + l };
}
function children(buf, node) {
  const out = []; let p = node.start;
  while (p < node.end) { const c = read(buf, p); out.push(c); p = c.end; }
  return out;
}

module.exports = { tlv, seq, set, int, utf8, printable, octet, bitString, ctx, oid, read, children };
