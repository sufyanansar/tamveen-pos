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
5. Every receipt is sent the moment it is created; nobody has to press anything.
   - If the POS service does not answer, the app keeps the receipt and sends it again every minute and when the
     browser comes back online.
   - If ZATCA or the internet is down, the invoice stays `pending` in the service. It is sent again as soon as any
     newer receipt gets through to ZATCA, and every 5 minutes in any case.
   - **Sync now** does all of this right away. Sending the same invoice twice returns the first result; nothing is
     signed twice.

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

## Tested against the ZATCA sandbox

Tested on 2026-10-23 against the developer-portal sandbox (`env: sandbox`, OTP `123345`). The ZATCA SDK itself
could not be downloaded from the test environment (it is hosted on SharePoint), so the sandbox's own validator was used:

- **Onboarding.** The CSR is accepted and a compliance CSID issued, for both `0100` (simplified) and `1100`
  (standard + simplified).
- **Compliance checks.** All six samples (invoice, credit and debit note, standard and simplified) return `PASS`
  with no errors or warnings. This confirms the invoice hash, ECDSA signature, signed properties digest, certificate
  digest and QR.
- **Edge cases**, also `PASS`: per-line rounding with a `PayableRoundingAmount`, discounts, zero-rated, exempt and
  out-of-scope lines, card payment.
- **Fixed by the sandbox run:** QR tag 3 is the Riyadh date and time with no trailing `Z` (KSA-25), and QR tag 4 is
  the amount due (`PayableAmount`, BT-115), not the VAT-inclusive total, when there is a rounding amount.
- **Item names** shorter than 3 characters get warning BR-KSA-F-06-C19. It is only a warning, but product names
  should be at least 3 characters.

**The sandbox cannot test reporting.** Its production CSID step returns the same demo certificate to everyone
(VAT number 399999999900003, a different key), so every reported invoice is rejected with "User only allowed to use
the vat number that exists in the authentication certificate". Onboarding now detects this, says so, and
`/api/zatca/status` shows `demoCertificate: true`. In `simulation` and `production` a certificate that does not match
the device's key stops onboarding. To test real reporting, onboard with `env: simulation` and an OTP from the
simulation Fatoora portal (fatoora.zatca.gov.sa, taxpayer login, Simulation).

## Not verified yet

- **Reporting and clearance end to end.** Needs the simulation environment (see above).
- **Zero-rated and exempt items.** Accepted by the validator, but the exemption reason codes (`VATEX-…`) are
  placeholders; pick the right code for the goods actually sold.
- **Standard (B2B) invoices.** Clearance needs the buyer's full national address, and customers don't have addresses
  in the app yet. Onboard with `invoiceType` `0100` (simplified only) until that is added.
- **Certificate renewal.** The production CSID expires. Renewal is not built yet; `/api/zatca/status` shows the expiry date.
