# OCR benchmark

Runs a vision model over the 10 delivery photos in `ocr-test/` and scores it against `ocr-test/answer-key.csv`.

```
pip install requests pillow
export NVIDIA_API_KEY=nvapi-...      # keep the key out of the repo
python bench/ocr_bench.py
```

Options: `--docs D04 D10` for a subset, `--runs 3` to check consistency, `--no-think` to turn reasoning off, `--model <id>` to try another NVIDIA build model.

Scores per document:
- **found**: delivered lines matched to the right catalog product, or correctly flagged as not in the catalog.
- **qty ok**: found lines whose quantity in units is also right.
- **extra**: lines the model made up or matched to the wrong product.

Raw replies, `summary.csv` and `summary.txt` go to `bench/results/<time>-<model>/`.
