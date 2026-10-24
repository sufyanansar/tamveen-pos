// Reads a delivery photo with NVIDIA Nemotron. The key lives in the Vercel env var NVIDIA_API_KEY.
const URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

const PROMPT = `This is a photo of a supplier delivery note for a Saudi grocery shop. It may be in English, Arabic or both, typed or handwritten.

Read every delivered product line. For each line give:
- "printed": the line text as printed
- "barcode": the barcode on the line, or null
- "qty": the quantity in single units. Convert packs: 2 DZN = 24, 4 ctn x 12 = 48. If a number is struck through and corrected, use the correction. Arabic-Indic digits count too.
- "product_id": the matching id from the catalog below, or null if the product is not in the catalog. Trust the product name over a barcode that looks misprinted.

Catalog:
{catalog}

Reply with only this JSON, no other text:
{"supplier": "...", "lines": [{"printed": "...", "barcode": null, "qty": 0, "product_id": "p1"}]}`;

function parse(text) {
  const m = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = String(process.env.NVIDIA_API_KEY || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').replace(/^NVIDIA_API_KEY=/, '');
  if (!key) return res.status(503).json({ error: 'NVIDIA_API_KEY is not set' });
  const { image, catalog } = req.body || {};
  if (!image || !/^data:image\/(jpeg|png);base64,/.test(image) || image.length > 400000) return res.status(400).json({ error: 'Bad image' });
  const payload = {
    model: MODEL,
    messages: [{ role: 'user', content: [
      { type: 'text', text: PROMPT.replace('{catalog}', String(catalog || '').slice(0, 20000)) },
      { type: 'image_url', image_url: { url: image } },
    ] }],
    max_tokens: 32768, temperature: 0.6, top_p: 0.95, stream: false,
    reasoning_budget: 16384, chat_template_kwargs: { enable_thinking: true },
  };
  const t0 = Date.now();
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    if (![429, 500, 502, 503, 504].includes(r.status)) break;
    await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
  }
  if (!r.ok) {
    console.error('nvidia', r.status, 'key', key.slice(0, 6) + '…', key.length, (await r.text()).slice(0, 500));
    return res.status(502).json({ error: 'NVIDIA ' + r.status });
  }
  const j = await r.json();
  const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
  const got = parse(msg.content);
  if (!got || !Array.isArray(got.lines)) return res.status(502).json({ error: 'Unreadable reply' });
  res.status(200).json({ engine: 'Nemotron', secs: Math.round((Date.now() - t0) / 1000), supplier: got.supplier || '', lines: got.lines });
};
