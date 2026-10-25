# Tamveen POS — web proof of concept

A clickable proof of concept of the Tamveen (تموين) grocery point of sale, built from the Bakala POS / TrueGrad UI designs. It is a static site with no backend: all data is sample data kept in the browser's `localStorage`, so it can be hosted on GitHub Pages as is.

**Live demo:** https://sufyanansar.github.io/tamveen-pos/

## Try it

1. Sign in with any store ID and password, and pick who to sign in as (Cashier, Manager or Owner).
2. PINs for *Unlock with PIN*, *Lock · switch employee* and discount approval: Cashier `1111`, Manager `1234`, Owner `9999`.
3. Use **Demo controls** (top bar) to simulate a lost shop server, internet outage, printer out of paper, a card terminal that does not reply, or a shelf price change.
4. **Camera scanning (phones and tablets):** tap **Scan with camera** in the barcode field at checkout and allow camera access. To try it, open **Products → Test barcodes** on another screen (or print it) and point the camera at a barcode.
5. **Settings → Reset demo data** restores the sample shop.

## What is in it

| Area | What works |
| --- | --- |
| Sign in | Store ID + password, PIN unlock, Vision 2030 panel with the animated flag, English / Arabic |
| Checkout | Billing screen laid out like a counter till: the bill table on the left, the last scanned item's details, invoice amount and a big total on the right; keyboard shortcuts F2 customer, F3 find product, F5 settle; a quantity box for the next scan. Camera barcode scanning on phones and tablets (desktop tills use a hardware reader) (continuous: every read adds to the bill), hardware barcode scanners (type + Enter), pack barcodes (a carton adds 12 pieces), scale labels (`21…` barcodes carry the weight), search in Arabic or English, categories, weighed items, stock warnings, line discounts with manager PIN approval, customer select or create |
| Payment | Cash with keypad and quick amounts, card (simulated terminal, incl. "no reply" recovery), bank transfer with reference, sell on credit against the customer's limit, split cash + card |
| Invoice | Simplified / standard tax invoice, bilingual 80 mm receipt, ZATCA TLV QR code, print, send digital copy, offline queueing and sync |
| Returns | Credit note linked to the original invoice, partial quantities, restock, refund to cash / card / account balance |
| Customers & credit | Balances, credit limit and terms, oldest-unpaid ageing, record payment with oldest-first or manual allocation, statement |
| Products | Add / edit product, Arabic and English names, VAT category (locked for cashiers), packs and barcodes with duplicate detection, VAT-inclusive price breakdown, margin preview |
| Receive stock | Photo of a delivery note or invoice read by DeepSeek-OCR-2 (else in the browser with Tesseract.js). On phones and tablets a guided camera takes the photo: a frame shaped like a full A4 page or a long receipt turns green when the paper fills it and the phone is steady, then shoots by itself; long receipts are taken in parts from the top down, each lined up with a faded strip of the previous part, and read as one document. Desktop picks a file. Lines are matched by barcode, saved supplier code or name, reviewed, then added to stock; confirmed matches are remembered per supplier |
| Also | Orders (WhatsApp / phone / app) loaded into checkout, inventory with receiving by pack, suppliers, daily reports, audit history, close shift with cash count |

Everything is in English and Arabic (right-to-left), switchable from the top bar.

## Run locally

Any static file server works, for example:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Structure

```
index.html        page shell
css/app.css       design tokens and layout
js/data.js        sample shop data (products, customers, invoices, orders…)
js/i18n-ar.js     Arabic strings
js/app.js         the app: routing, views, actions
js/camera.js      camera barcode scanner (BarcodeDetector, else zxing-wasm, else ZXing JS)
js/docscan.js     guided camera for delivery documents (A4 page or long receipt in parts)
js/zxing-wasm-reader.js, js/zxing_reader.wasm  ZXing-C++ as WebAssembly (zxing-wasm 3.1.4, MIT), loaded only when needed
js/zxing.min.js   ZXing barcode reader (@zxing/library 0.21.3, Apache-2.0), loaded only when needed
js/qrcode.js      QR code generator (qrcode-generator 1.4.4, MIT)
assets/           Sora font, Vision 2030 artwork, flag animation
```

This is a proof of concept: there is no server, no real payment terminal or ZATCA integration, and data stays in the browser that created it.
