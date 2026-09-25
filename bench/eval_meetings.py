#!/usr/bin/env python3
"""Score transcribe.py output on a real meeting against its reference transcript.

The reference is a Mojaz/ElevenLabs transcript: one "[[S#]] text" line per turn, speakers
resolved to people (optionally via a S#->name map). It has no timestamps, so everything is
measured on the text:

  WER / CER, Arabic-/English-word errors, English kept  - as in bench/score.py
  WDER  word diarization error rate: our words and the reference words are aligned
        (edit-distance alignment); for every aligned pair we compare who the word is
        attributed to, after mapping our Speaker 1/2/... to the reference people in the
        way that agrees best. WDER = share of aligned words credited to the wrong person.

Note: the reference is itself machine output (ElevenLabs, speakers corrected by hand/ClickUp),
so WER here means "disagreement with ElevenLabs", not absolute error.

Usage:
  .venv/bin/python bench/eval_meetings.py <reference.txt> <transcribe-output.json> [--map map.json]
"""
import argparse
import itertools
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import jiwer

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score import errors_by_script, latin_words, normalize  # noqa: E402


def reference_words(path, names=None):
    """([(word, person)], raw text) from "[[S#]] text" lines; names maps S# to a person
    (so several labels can be merged into one person)."""
    words, raw, speaker = [], [], None
    for line in Path(path).read_text().splitlines():
        m = re.match(r"\s*\[\[(S\d+)\]\]\s*(.*)", line)
        if m:
            speaker, line = m.group(1), m.group(2)
        person = (names or {}).get(speaker, speaker)
        words += [(w, person) for w in normalize(line).split()]
        raw.append(line)
    return words, "\n".join(raw)


def hypothesis_words(path):
    return [(w, f"spk{x['speaker']}") for x in json.loads(Path(path).read_text())
            for w in normalize(x["text"]).split()]


def best_mapping(pairs):
    """Map hypothesis speakers to reference people to maximize agreeing aligned words."""
    counts = defaultdict(Counter)
    for hyp, ref in pairs:
        counts[hyp][ref] += 1
    hyps, refs = sorted(counts), sorted({r for _, r in pairs})
    if len(hyps) <= 8 and len(refs) <= 10:  # exact search; each hyp speaker to a distinct person
        best, best_score = {}, -1
        for perm in itertools.permutations(refs + [None] * max(0, len(hyps) - len(refs)), len(hyps)):
            score = sum(counts[h][r] for h, r in zip(hyps, perm) if r is not None)
            if score > best_score:
                best, best_score = dict(zip(hyps, perm)), score
        return best
    return {h: counts[h].most_common(1)[0][0] for h in hyps}  # greedy fallback


def evaluate(ref_path, hyp_path, names=None):
    (ref, raw_ref), hyp = reference_words(ref_path, names), hypothesis_words(hyp_path)
    ref_text, hyp_text = " ".join(w for w, _ in ref), " ".join(w for w, _ in hyp)
    out = jiwer.process_words(ref_text, hyp_text)
    pairs = []
    for c in out.alignments[0]:
        if c.type in ("equal", "substitute"):
            for i, j in zip(range(c.ref_start_idx, c.ref_end_idx), range(c.hyp_start_idx, c.hyp_end_idx)):
                pairs.append((hyp[j][1], ref[i][1]))
    mapping = best_mapping(pairs)
    agree = sum(1 for h, r in pairs if mapping.get(h) == r)
    split = errors_by_script([raw_ref], [hyp_text])
    en_ref, en_hit = latin_words(ref_text.split()), latin_words(ref_text.split()) & latin_words(hyp_text.split())
    return {
        "ref_words": len(ref), "hyp_words": len(hyp),
        "wer": out.wer, "cer": jiwer.cer(ref_text, hyp_text),
        "ar_err": split["ar"], "en_err": split["en"],
        "en_kept": sum(en_hit.values()) / max(1, sum(en_ref.values())),
        "wder": 1 - agree / max(1, len(pairs)), "aligned_words": len(pairs),
        "ref_speakers": len({p for _, p in ref}), "hyp_speakers": len({s for _, s in hyp}),
        "mapping": mapping,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reference")
    ap.add_argument("hypothesis")
    ap.add_argument("--map", help="JSON file or string mapping S# labels to people")
    args = ap.parse_args()
    names = None
    if args.map:
        names = json.loads(Path(args.map).read_text() if Path(args.map).exists() else args.map)
    r = evaluate(args.reference, args.hypothesis, names)
    print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
