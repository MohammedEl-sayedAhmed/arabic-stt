#!/usr/bin/env python3
"""Score benchmark results and print a summary table.

For each results/<set>.<audio>.<model>.<language>.jsonl whose set has reference
transcripts (arzen, mixat), reports:
  WER / CER    corpus-level word and character error rates after normalization
  AR err / EN err
               the WER split by the script of the reference word: substitutions
               and deletions of Arabic words / English words, over the count of
               each (insertions are left out), so "hears Arabic badly" and
               "writes English terms in Arabic letters" show up separately
  EN kept      share of the reference's English words that appear in the
               hypothesis in Latin script (transliterating or translating an
               English term into Arabic counts as a miss)
  Latin share  share of hypothesis words written in Latin script
  RTF          processing time / audio duration on this machine (lower is faster)

Normalization (applied to both sides): remove ArzEn tags like [HES], brackets
and the ArzEn joiners + and *; strip Arabic diacritics and tatweel; map
alef variants to ا, ى to ي, ة to ه; Arabic-Indic digits to 0-9; remove
punctuation; put a space between Arabic and Latin letters (ال+usual,
ال[deep inside]); lowercase Latin.

Usage: .venv/bin/python bench/score.py
"""
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

import jiwer

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"

DIACRITICS = re.compile(r"[ً-ْٰـ]")
LATIN_WORD = re.compile(r"[a-z]")
CHAR_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه",
                          **{chr(0x660 + i): str(i) for i in range(10)},
                          **{chr(0x6F0 + i): str(i) for i in range(10)}})


def normalize(text):
    text = re.sub(r"\[[A-Z_]+\]", " ", text)  # ArzEn event tags: [HES], [LAUGHTER], ...
    text = re.sub(r"[\[\]+*#]", " ", text)
    text = DIACRITICS.sub("", text).translate(CHAR_MAP)
    text = "".join(" " if unicodedata.category(c)[0] in "PS" else c for c in text)
    text = re.sub(r"(?<=[؀-ۿ])(?=[A-Za-z])|(?<=[A-Za-z])(?=[؀-ۿ])", " ", text)
    return " ".join(text.lower().split())


def latin_words(words):
    return Counter(w for w in words if LATIN_WORD.search(w))


def errors_by_script(ref, hyp):
    """Substituted or deleted reference words, and reference word counts, per script."""
    out = jiwer.process_words(ref, hyp)
    errors, totals = Counter(), Counter()
    for words, chunks in zip(out.references, out.alignments):
        for w in words:
            totals["en" if LATIN_WORD.search(w) else "ar"] += 1
        for c in chunks:
            if c.type in ("substitute", "delete"):
                for w in words[c.ref_start_idx:c.ref_end_idx]:
                    errors["en" if LATIN_WORD.search(w) else "ar"] += 1
    return {k: errors[k] / max(1, totals[k]) for k in ("ar", "en")}


def score(path, refs):
    rows = [json.loads(line) for line in open(path)]
    ref = [normalize(refs[r["id"]]) for r in rows]
    hyp = [normalize(r["hyp"]) for r in rows]
    en_ref = sum((latin_words(x.split()) for x in ref), Counter())
    en_hit = sum((latin_words(r.split()) & latin_words(h.split()) for r, h in zip(ref, hyp)), Counter())
    hyp_words = [w for h in hyp for w in h.split()]
    split = errors_by_script(ref, hyp)
    return {
        "clips": len(rows),
        "wer": jiwer.wer(ref, hyp),
        "cer": jiwer.cer(ref, hyp),
        "ar_err": split["ar"],
        "en_err": split["en"],
        "en_kept": sum(en_hit.values()) / max(1, sum(en_ref.values())),
        "latin_share": sum(latin_words(hyp_words).values()) / max(1, len(hyp_words)),
        "rtf": sum(r["seconds"] for r in rows) / sum(r["audio_s"] for r in rows),
    }


def main():
    summary = []
    for path in sorted(RESULTS.glob("*.jsonl")):
        test_set, audio, rest = path.stem.split(".", 2)
        model, language = rest.rsplit(".", 1)  # model names can contain dots (Qwen3-ASR-1.7B)
        manifest = ROOT / "data" / test_set / "manifest.jsonl"
        refs = {x["id"]: x["reference"] for x in map(json.loads, open(manifest)) if "reference" in x}
        if not refs or path.stat().st_size == 0:
            continue
        summary.append({"set": test_set, "audio": audio, "model": model, "language": language,
                        **score(path, refs)})
    print("| set | audio | model | lang | clips | WER | CER | AR err | EN err | EN kept | Latin share | RTF |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for s in summary:
        print(f"| {s['set']} | {s['audio']} | {s['model']} | {s['language']} | {s['clips']} "
              f"| {s['wer']:.1%} | {s['cer']:.1%} | {s['ar_err']:.1%} | {s['en_err']:.0%} "
              f"| {s['en_kept']:.0%} | {s['latin_share']:.0%} | {s['rtf']:.2f} |")
    (RESULTS / "summary.json").write_text(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
