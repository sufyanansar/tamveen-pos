"""DeepSeek-OCR-2 server for Tamveen POS on Modal.

    pip install modal
    modal setup                      # one-time login in the browser
    modal deploy bench/modal_ocr.py  # prints the https://…modal.run address

Paste the printed address into the POS under Settings > Scanning > OCR server.
The GPU only runs while scanning and shuts down 5 minutes after the last photo.
"""
import modal

MODEL = 'deepseek-ai/DeepSeek-OCR-2'
PROMPT = '<image>\nFree OCR. '

image = (
    modal.Image.debian_slim(python_version='3.12')
    .pip_install(
        'torch==2.6.0', 'torchvision==0.21.0', 'transformers==4.46.3', 'tokenizers==0.20.3',
        'einops', 'easydict', 'addict', 'Pillow', 'numpy', 'safetensors', 'accelerate',
        'huggingface_hub[hf_transfer]', 'fastapi[standard]', 'python-multipart',
    )
    .env({'HF_HOME': '/cache', 'HF_HUB_ENABLE_HF_TRANSFER': '1'})
)
cache = modal.Volume.from_name('deepseek-ocr2-cache', create_if_missing=True)
app = modal.App('tamveen-ocr', image=image)


def clean(text):
    """Plain lines for the POS parser: drop grounding tags, turn table rows into lines."""
    import re
    text = re.sub(r'<\|ref\|>(.*?)<\|/ref\|>', r'\1', text or '')
    text = re.sub(r'<\|det\|>.*?<\|/det\|>', '', text)
    text = re.sub(r'</tr>|<br\s*/?>', '\n', text)
    text = re.sub(r'</t[dh]>', ' ', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('|', ' ')
    return '\n'.join(re.sub(r'[ \t]+', ' ', l).strip() for l in text.splitlines() if l.strip())


@app.cls(gpu='L4', volumes={'/cache': cache}, scaledown_window=300, timeout=600, max_containers=1)
class OCR:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoModel, AutoTokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
        model = AutoModel.from_pretrained(MODEL, _attn_implementation='eager', trust_remote_code=True, use_safetensors=True)
        self.model = model.eval().cuda().to(torch.bfloat16)
        cache.commit()

    def read(self, path):
        import contextlib, glob, io, os, tempfile
        out = tempfile.mkdtemp()
        buf = io.StringIO()
        args = dict(prompt=PROMPT, image_file=path, output_path=out, base_size=1024, image_size=768, crop_mode=True, save_results=True)
        with contextlib.redirect_stdout(buf):
            try:
                res = self.model.infer(self.tokenizer, eval_mode=True, **args)
            except TypeError:  # older remote code without eval_mode
                res = self.model.infer(self.tokenizer, **args)
        if not isinstance(res, str) or not res.strip():
            files = glob.glob(os.path.join(out, '*.mmd')) + glob.glob(os.path.join(out, '*.md'))
            res = open(files[0], encoding='utf-8').read() if files else buf.getvalue()
        return res

    @modal.asgi_app()
    def web(self):
        import os, tempfile, time
        from fastapi import FastAPI, File, UploadFile
        from fastapi.middleware.cors import CORSMiddleware

        api = FastAPI()
        api.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

        @api.get('/')
        def health():
            return {'model': MODEL}

        @api.post('/ocr')
        def ocr(file: UploadFile = File(...)):
            suffix = os.path.splitext(file.filename or '')[1] or '.jpg'
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(file.file.read())
                path = f.name
            t0 = time.time()
            raw = self.read(path)
            os.remove(path)
            text = clean(raw)
            print('scanned', file.filename, '->', len(text.splitlines()), f'lines in {time.time() - t0:.0f}s')
            return {'engine': 'DeepSeek-OCR-2', 'secs': round(time.time() - t0, 1), 'text': text, 'raw': raw}

        return api
