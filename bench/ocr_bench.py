#!/usr/bin/env python3
"""Benchmark a vision model on the Receive stock OCR test set (ocr-test/).

Each delivery photo is sent to an OpenAI-compatible chat endpoint (NVIDIA build by
default). The model returns the delivered lines as JSON, matched to our catalog, and
the result is scored against ocr-test/answer-key.csv.

    export NVIDIA_API_KEY=nvapi-...        # never commit the key
    pip install requests pillow
    python bench/ocr_bench.py                     # all 10 documents
    python bench/ocr_bench.py --docs D04 D10      # a subset
    python bench/ocr_bench.py --model other/model --runs 3
"""
import argparse, base64, csv, io, json, os, re, sys, time
from datetime import datetime
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEST = ROOT / 'ocr-test'
URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
B64_LIMIT = 180_000  # NVIDIA's hosted endpoints reject larger inline images

PROMPT = """This is a photo of a supplier delivery note for a Saudi grocery shop. It may be in English, Arabic or both, typed or handwritten.

Read every delivered product line. For each line give:
- "printed": the line text as printed
- "barcode": the barcode on the line, or null
- "qty": the quantity in single units. Convert packs: 2 DZN = 24, 4 ctn x 12 = 48. If a number is struck through and corrected, use the correction. Arabic-Indic digits count too.
- "product_id": the matching id from the catalog below, or null if the product is not in the catalog. Trust the product name over a barcode that looks misprinted.

Catalog:
{catalog}

Reply with only this JSON, no other text:
{{"supplier": "...", "lines": [{{"printed": "...", "barcode": null, "qty": 0, "product_id": "p1"}}]}}"""


def load_key():
    rows = list(csv.DictReader(open(TEST / 'answer-key.csv', encoding='utf-8')))
    docs = {}
    for r in rows:
        docs.setdefault(r['doc'], {'file': r['file'], 'supplier': r['supplier'], 'lines': []})['lines'].append(
            {'pid': r['product_id'] or None, 'qty': float(r['expected_qty']), 'name': r['catalog_name'], 'printed': r['as_printed']})
    catalog = {}
    for r in rows:
        if r['product_id']:
            catalog[r['product_id']] = (r['catalog_name'], r['barcode'])
    return docs, catalog


def encode(path):
    """Shrink the photo until its base64 fits the inline limit."""
    img = Image.open(path).convert('RGB')
    side, q = 2000, 88
    while True:
        im = img.copy(); im.thumbnail((side, side))
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q)
        b64 = base64.b64encode(buf.getvalue()).decode()
        if len(b64) <= B64_LIMIT or side < 500:
            return b64, im.size
        side, q = int(side * 0.85), max(60, q - 4)


def call(args, key, b64, catalog_txt):
    payload = {
        'model': args.model,
        'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': PROMPT.format(catalog=catalog_txt)},
            {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + b64}},
        ]}],
        'max_tokens': args.max_tokens, 'temperature': args.temperature, 'top_p': 0.95, 'stream': False,
    }
    if args.think:
        payload['reasoning_budget'] = args.reasoning_budget
        payload['chat_template_kwargs'] = {'enable_thinking': True}
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json'}
    for attempt in range(4):
        t0 = time.time()
        r = requests.post(args.url, headers=headers, json=payload, timeout=args.timeout)
        dt = time.time() - t0
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(2 ** (attempt + 1)); continue
        r.raise_for_status()
        return r.json(), dt


def parse(text):
    text = re.sub(r'<think>.*?</think>', '', text or '', flags=re.S)
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def num(v):
    try:
        return float(str(v).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')).replace(',', ''))
    except (TypeError, ValueError):
        return None


def score(expected, got):
    """Per expected line: was the product found, and was the quantity right."""
    preds = [{'pid': (l.get('product_id') or None), 'qty': num(l.get('qty'))} for l in (got or {}).get('lines', []) if isinstance(l, dict)]
    used, found, qty_ok, detail = set(), 0, 0, []
    for e in expected:
        hit = None
        for i, p in enumerate(preds):
            if i in used or p['pid'] != e['pid']:
                continue
            if e['pid'] is None and p['qty'] != e['qty']:
                continue  # an unknown product only counts when its quantity also lines up
            hit = i; break
        if hit is not None:
            used.add(hit); found += 1
            ok = preds[hit]['qty'] == e['qty']; qty_ok += ok
            detail.append({'expected': e, 'got': preds[hit], 'found': True, 'qty_ok': ok})
        else:
            detail.append({'expected': e, 'got': None, 'found': False, 'qty_ok': False})
    extra = [p for i, p in enumerate(preds) if i not in used]
    return {'lines': len(expected), 'found': found, 'qty_ok': qty_ok, 'extra': len(extra), 'detail': detail, 'extra_lines': extra}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--model', default=MODEL)
    ap.add_argument('--url', default=URL)
    ap.add_argument('--docs', nargs='*', help='e.g. D01 D04 (default: all)')
    ap.add_argument('--runs', type=int, default=1, help='repeat each document to check consistency')
    ap.add_argument('--think', action=argparse.BooleanOptionalAction, default=True, help='reasoning on/off')
    ap.add_argument('--reasoning-budget', type=int, default=16384)
    ap.add_argument('--max-tokens', type=int, default=32768)
    ap.add_argument('--temperature', type=float, default=0.6)
    ap.add_argument('--timeout', type=int, default=300)
    ap.add_argument('--out', default=str(ROOT / 'bench' / 'results'))
    args = ap.parse_args()

    key = os.environ.get('NVIDIA_API_KEY')
    if not key:
        sys.exit('Set NVIDIA_API_KEY first (export NVIDIA_API_KEY=nvapi-...).')

    docs, catalog = load_key()
    catalog_txt = '\n'.join(f'{pid}: {n} (barcode {b})' for pid, (n, b) in sorted(catalog.items(), key=lambda x: int(x[0][1:])))
    names = args.docs or sorted(docs)
    out = Path(args.out) / (datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + args.model.split('/')[-1])
    out.mkdir(parents=True, exist_ok=True)

    rows = []
    print(f'{args.model}  ·  {len(names)} docs × {args.runs} run(s)  ·  thinking {"on" if args.think else "off"}\n')
    print(f'{"doc":5} {"run":>3} {"found":>7} {"qty ok":>7} {"extra":>5} {"secs":>6} {"tokens":>7}  note')
    for d in names:
        doc = docs[d]
        b64, size = encode(TEST / doc['file'])
        for run in range(1, args.runs + 1):
            rec = {'doc': d, 'run': run, 'model': args.model, 'image_px': f'{size[0]}x{size[1]}'}
            try:
                resp, dt = call(args, key, b64, catalog_txt)
                msg = resp['choices'][0]['message']
                got = parse(msg.get('content'))
                s = score(doc['lines'], got)
                usage = resp.get('usage') or {}
                rec.update(secs=round(dt, 1), tokens=usage.get('total_tokens'), parsed=got is not None, **{k: s[k] for k in ('lines', 'found', 'qty_ok', 'extra')})
                note = '' if got is not None else 'reply was not valid JSON'
                (out / f'{d}-run{run}.json').write_text(json.dumps({'response': resp, 'parsed': got, 'score': s}, ensure_ascii=False, indent=2), encoding='utf-8')
            except Exception as e:  # keep going; one bad call should not sink the run
                rec.update(secs=None, tokens=None, parsed=False, lines=len(doc['lines']), found=0, qty_ok=0, extra=0)
                note = f'error: {e}'[:80]
            rec['note'] = note
            rows.append(rec)
            print(f'{d:5} {run:>3} {rec["found"]:>3}/{rec["lines"]:<3} {rec["qty_ok"]:>3}/{rec["lines"]:<3} {rec["extra"]:>5} {"-" if rec["secs"] is None else rec["secs"]:>6} {rec["tokens"] or "-":>7}  {note}')

    tot = sum(r['lines'] for r in rows) or 1
    found = sum(r['found'] for r in rows); qty = sum(r['qty_ok'] for r in rows); extra = sum(r['extra'] for r in rows)
    secs = [r['secs'] for r in rows if r['secs'] is not None]
    perfect = sum(1 for r in rows if r['qty_ok'] == r['lines'] and r['extra'] == 0)
    summary = (f'\nLines found      {found}/{tot}  ({found / tot:.0%})\n'
               f'Quantity right   {qty}/{tot}  ({qty / tot:.0%})\n'
               f'Extra lines      {extra}\n'
               f'Perfect docs     {perfect}/{len(rows)}\n'
               f'Avg seconds/doc  {sum(secs) / len(secs):.1f}' if secs else '\nNo successful calls.')
    print(summary)
    with open(out / 'summary.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    (out / 'summary.txt').write_text(summary.strip() + '\n', encoding='utf-8')
    print(f'\nSaved to {out}')


if __name__ == '__main__':
    main()
