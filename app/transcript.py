"""Transcript helpers: lines from word lists, speaker names, and the export formats."""
import json

MAX_GAP = 1.5   # a pause longer than this (seconds) starts a new line
MAX_LINE = 30   # longest line, seconds


def relabel(raw_ids):
    """Map raw speaker ids ("speaker_0", "S2", ...) to "1", "2", ... in order of first appearance."""
    mapping = {}
    for raw in raw_ids:
        if raw is not None and raw not in mapping:
            mapping[raw] = str(len(mapping) + 1)
    return mapping


def lines_from_words(words, max_gap=MAX_GAP, max_line=MAX_LINE):
    """Group words into lines. words: dicts with start, end, text, speaker and glue (True when the
    token attaches to the previous one without a space, e.g. punctuation)."""
    lines = []
    for w in words:
        last = lines[-1] if lines else None
        same = last and last["speaker"] == w["speaker"] and w["start"] - last["end"] < max_gap \
            and w["end"] - last["start"] < max_line
        if last and (w["glue"] or same):
            last["text"] += w["text"] if w["glue"] else " " + w["text"]
            last["end"] = round(max(last["end"], w["end"]), 2)
        elif not w["glue"]:
            lines.append({"start": round(w["start"], 2), "end": round(w["end"], 2),
                          "speaker": w["speaker"], "text": w["text"]})
    return [x for x in lines if x["text"].strip()]


def from_transcribe_py(lines):
    """transcribe.py lines: speaker is 1, 2, ... or None."""
    return [{"start": float(x["start"]), "end": float(x["end"]),
             "speaker": None if x.get("speaker") is None else str(x["speaker"]), "text": x["text"].strip()}
            for x in lines if x.get("text", "").strip()]


def speaker_ids(lines):
    return sorted({x["speaker"] for x in lines if x["speaker"] is not None}, key=lambda s: (len(s), s))


def speaker_name(job, sid):
    if sid is None:
        return ""
    return (job.get("speaker_names") or {}).get(sid) or f"Speaker {sid}"


def clock(t):
    t = int(t)
    h, m, s = t // 3600, t // 60 % 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def _stamp(t, sep):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}{sep}{ms % 1000:03d}"


def to_txt(job, lines):
    out = []
    for x in lines:
        who = speaker_name(job, x["speaker"])
        out.append(f"[{clock(x['start'])}] {who + ': ' if who else ''}{x['text']}")
    return "\n".join(out) + "\n"


def to_srt(job, lines):
    out = []
    for i, x in enumerate(lines, 1):
        who = speaker_name(job, x["speaker"])
        out.append(f"{i}\n{_stamp(x['start'], ',')} --> {_stamp(x['end'], ',')}\n{who + ': ' if who else ''}{x['text']}\n")
    return "\n".join(out)


def to_vtt(job, lines):
    out = ["WEBVTT", ""]
    for x in lines:
        who = speaker_name(job, x["speaker"])
        out.append(f"{_stamp(x['start'], '.')} --> {_stamp(x['end'], '.')}\n{f'<v {who}>' if who else ''}{x['text']}\n")
    return "\n".join(out)


def to_md(job, lines):
    out = [f"# {job.get('title') or 'Transcript'}", "",
           f"*{job.get('model_title', job.get('model', ''))} · {clock(job.get('audio_s') or 0)} · "
           f"{(job.get('created') or '')[:16].replace('T', ' ')}*", ""]
    for x in lines:
        who = speaker_name(job, x["speaker"])
        out.append(f"**{who}** `{clock(x['start'])}`  \n{x['text']}\n" if who else f"`{clock(x['start'])}` {x['text']}\n")
    return "\n".join(out)


def to_json(job, lines):
    return json.dumps({
        "title": job.get("title"), "created": job.get("created"), "model": job.get("model"),
        "audio_s": job.get("audio_s"), "language": (job.get("options") or {}).get("language"),
        "speakers": {sid: speaker_name(job, sid) for sid in speaker_ids(lines)},
        "lines": [{**x, "speaker_name": speaker_name(job, x["speaker"]) or None} for x in lines],
    }, ensure_ascii=False, indent=1)


EXPORTS = {
    "txt": (to_txt, "text/plain; charset=utf-8"),
    "srt": (to_srt, "application/x-subrip; charset=utf-8"),
    "vtt": (to_vtt, "text/vtt; charset=utf-8"),
    "md": (to_md, "text/markdown; charset=utf-8"),
    "json": (to_json, "application/json; charset=utf-8"),
}
