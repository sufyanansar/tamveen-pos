# ZATCA e-invoicing (Fatoora Phase 2)

Tamveen POS issues Phase 2 e-invoices through a small service that runs on the POS machine. That service is the
"EGS unit" in ZATCA's terms. It serves the POS app and the ZATCA API from one address, keeps the signing key and the
CSID on the machine, and reports every simplified invoice to ZATCA.

```
 POS machine
 ┌──────────────────────────────────────────────────────────────┐
 │  browser ── http://127.0.0.1:8080 ──►  server/ (Node, no deps) │ ──► ZATCA Fatoora API
 │  (the POS app)                          sign · chain · queue   │     (sandbox / simulation / core)
 │                                         data/ (key, CSID, XML) │
 └──────────────────────────────────────────────────────────────┘
```

The GitHub Pages demo has no service. There the app builds the same XML and keeps its own invoice chain, but nothing is
signed or sent, and the QR has tags 1–6 only.

## What happens to an invoice

1. The cashier completes a sale. The app sends the invoice to `POST /api/zatca/invoices`.
2. The service gives it a UUID, the next invoice counter (ICV) and the previous invoice hash (PIH), then builds the
   UBL 2.1 XML (`js/zatca.js`, shared with the browser).
3. It hashes the invoice (SHA-256, without UBLExtensions, cac:Signature and the QR), signs the hash with the
   secp256k1 key, adds the XAdES signature and the QR with all 9 tags (`server/lib/signer.js`).
4. It saves the signed invoice and moves the chain on. Only then does it send the invoice to ZATCA: simplified (B2C)
   invoices go to `/invoices/reporting/single`, standard (B2B) invoices to `/invoices/clearance/single`.
5. If ZATCA or the internet is down, the invoice stays `pending`. The service retries every 5 minutes, and the app's
   **Sync now** button retries right away. Sending the same invoice twice returns the first result; nothing is signed twice.

Credit notes from **Returns** go the same way (type 381, linked to the original invoice, with the reason).

## Setting up a POS machine

Needs Node.js 20 or newer (or Docker). There are no npm dependencies.

1. Copy `server/zatca.config.example.json` to `server/zatca.config.json` and fill it in:
   - `env`: `sandbox` (developer portal), `simulation`, then `production`.
   - `egs`: what goes in the certificate request. `serialNumber` is `1-<solution>|2-<model>|3-<device serial>` and
     must be unique per machine. `vatNumber` is the shop's 15-digit VAT number. `invoiceType` is `0100` for
     simplified invoices only, `1100` for simplified and standard.
   - `seller`: the legal name (Arabic), commercial registration number and national address that go on every invoice.
2. Onboard once per machine, with an OTP from the Fatoora portal (in the developer sandbox, `123345` works):
   ```sh
   cd server
   npm run onboard -- --otp 123345
   ```
   This creates the key, sends the CSR, gets the compliance CSID, passes the compliance checks with sample
   invoice, credit note and debit note, then gets the production CSID. Everything is saved in `server/data/`.
3. Start it and open the app at http://127.0.0.1:8080:
   ```sh
   npm start
   ```
   Or use Docker (see the top of `Dockerfile`). Keep port 8080 bound to `127.0.0.1` so only the POS machine can reach it.

**Back up `server/data/`.** It holds the private key, the CSIDs and the invoice chain. If the chain is lost, the next
invoice's PIH will not match and ZATCA will flag it.

## Service API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/zatca/status` | Environment, onboarded or not, current ICV, pending and rejected counts |
| POST | `/api/zatca/invoices` | Sign and submit one invoice (the document shape in `js/zatca.js` `build()`) |
| GET | `/api/zatca/invoices/:id` | The stored result: UUID, ICV, hash, QR, status, ZATCA warnings and errors |
| GET | `/api/zatca/invoices/:id/xml` | The signed (or, for B2B, ZATCA-cleared) XML |
| POST | `/api/zatca/retry` | Send everything still pending |
| POST | `/api/zatca/onboard` | Same as `npm run onboard`, with `{ "otp": "…" }` |

## Tests

`cd server && npm test` checks the hashing, totals, CSR, signature and the whole flow (onboarding, chain,
idempotency, queue and retry) against a fake ZATCA server.

## Not verified yet

Everything above is built from ZATCA's published specs and has only been tested against a fake ZATCA. These need
checking with the ZATCA SDK (`fatoora -validate`) and the developer sandbox before going further:

- **Signed properties digest.** ZATCA digests the XAdES SignedProperties with a fixed layout, whitespace included.
  The layout in `server/lib/signer.js` follows the one known to pass validation, but needs confirming.
- **QR timestamp (tag 3).** Uses the invoice's Riyadh date and time with a trailing `Z`. Easy to change in `qrTimestamp()`.
- **Rounding.** Shelf prices include VAT. Line amounts are worked out excluding VAT to 2 decimals, so totals can
  differ from the till by a few halalas; the difference goes in `PayableRoundingAmount`. ZATCA may prefer a different approach.
- **Zero-rated and exempt items.** The exemption reason codes (`VATEX-…`) are placeholders.
- **Standard (B2B) invoices.** Clearance needs the buyer's full national address, and customers don't have addresses
  in the app yet. Onboard with `invoiceType` `0100` (simplified only) until that is added.
- **Certificate renewal.** The production CSID expires. Renewal is not built yet; `/api/zatca/status` shows the expiry date.
