"""Tell speakers apart by their voice.

1. Silero VAD finds the speech.
2. A 1.5 s window slides over the speech in 0.75 s steps, and WeSpeaker
   (ResNet34 trained on VoxCeleb) turns each window into a 256-number
   voiceprint that captures timbre and pitch, not words.
3. Spectral clustering groups the voiceprints by similarity into N speakers
   (N given, or estimated from the eigengap). The neighbour count is
   auto-tuned per recording (NME-SC, Park et al. 2019), so a few odd windows
   (noise, crosstalk) can't form a "speaker" of their own.
4. A 3-window majority filter removes single-window flips.

Timeline.speaker_at(t) then gives who is talking at time t.
"""
from pathlib import Path

import numpy as np
import sherpa_onnx
from faster_whisper.vad import VadOptions, get_speech_timestamps

SR = 16000
WIN_S, HOP_S = 1.5, 0.75
MAX_WINDOWS = 2000  # longer recordings use a longer hop to keep clustering fast
MODEL = Path(__file__).resolve().parent / "models" / "diarization" / "wespeaker_en_voxceleb_resnet34_LM.onnx"


class Timeline:
    def __init__(self, centers, labels, embeddings):
        self.centers = centers  # window centres in seconds, ascending
        self.labels = labels  # speaker number per window, 1-based by first appearance
        self.embeddings = embeddings

    def speaker_at(self, t):
        i = int(np.clip(np.searchsorted(self.centers, t), 1, len(self.centers) - 1))
        return int(self.labels[i - 1 if t - self.centers[i - 1] < self.centers[i] - t else i])

    def turns(self, max_gap=0.5):
        """Runs of one speaker as [start, end, speaker] in seconds."""
        out = []
        for c, s in zip(self.centers, self.labels):
            a, b = c - HOP_S / 2, c + HOP_S / 2
            if out and out[-1][2] == s and a - out[-1][1] <= max_gap:
                out[-1][1] = b
            else:
                out.append([max(0.0, a), b, int(s)])
        return out

    def summary(self):
        """Talk time per speaker and how alike the speakers' average voiceprints are."""
        speakers = sorted(set(self.labels))
        talk = {s: float(np.sum(self.labels == s) * HOP_S) for s in speakers}
        cents = [self.embeddings[self.labels == s].mean(0) for s in speakers]
        cents = [c / np.linalg.norm(c) for c in cents]
        sims = [float(cents[i] @ cents[j]) for i in range(len(cents)) for j in range(i + 1, len(cents))]
        return talk, sims


def windows(audio):
    vad = VadOptions(min_silence_duration_ms=300, speech_pad_ms=100)
    speech = get_speech_timestamps(audio, vad)
    total = sum(s["end"] - s["start"] for s in speech) / SR
    hop = int(max(HOP_S, total / MAX_WINDOWS) * SR)
    win = int(WIN_S * SR)
    for s in speech:
        a, b = s["start"], s["end"]
        if b - a < win:
            if b - a >= SR // 2:
                yield a, b
            continue
        starts = list(range(a, b - win + 1, hop))
        if starts[-1] + win < b:
            starts.append(b - win)
        for x in starts:
            yield x, x + win


def kmeans(x, k, restarts=10, iters=100):
    rng = np.random.default_rng(0)
    best, best_labels = np.inf, np.zeros(len(x), dtype=int)
    for _ in range(restarts):
        centers = [x[rng.integers(len(x))]]
        for _ in range(1, k):  # k-means++ seeding
            d = np.min(((x[:, None] - np.array(centers)[None]) ** 2).sum(-1), axis=1)
            centers.append(x[rng.choice(len(x), p=d / d.sum())] if d.sum() > 0 else x[rng.integers(len(x))])
        centers = np.array(centers)
        labels = best_labels
        for _ in range(iters):
            labels = np.argmin(((x[:, None] - centers[None]) ** 2).sum(-1), axis=1)
            new = np.array([x[labels == j].mean(0) if np.any(labels == j) else centers[j] for j in range(k)])
            if np.allclose(new, centers):
                break
            centers = new
        inertia = ((x - centers[labels]) ** 2).sum()
        if inertia < best:
            best, best_labels = inertia, labels
    return best_labels


def spectral_cluster(emb, n_speakers=None, max_speakers=8):
    """NME-SC: binarized p-nearest-neighbour affinity, p chosen to maximize the normalized eigengap."""
    n = len(emb)
    if n < 4:
        return np.zeros(n, dtype=int)
    x = emb / np.linalg.norm(emb, axis=1, keepdims=True)
    sim = x @ x.T
    order = np.argsort(-sim, axis=1)
    max_k = min(max_speakers, n - 1)
    best_score, best_k, best_vecs = np.inf, 1, None
    for p in np.unique(np.linspace(2, max(3, n // 4), 20).astype(int)):
        a = np.zeros_like(sim)
        np.put_along_axis(a, order[:, :p], 1.0, axis=1)
        a = (a + a.T) / 2
        vals, vecs = np.linalg.eigh(np.diag(a.sum(1)) - a)
        gaps = np.diff(vals[: max_k + 1])
        score = p / (gaps.max() / (vals[-1] + 1e-10) + 1e-10)
        if score < best_score:
            best_score, best_k, best_vecs = score, n_speakers or int(np.argmax(gaps)) + 1, vecs
    return kmeans(best_vecs[:, :best_k], best_k)


def diarize(audio, n_speakers=None, threads=4):
    """Build a Timeline for 16 kHz float32 audio; n_speakers=None estimates the count."""
    extractor = sherpa_onnx.SpeakerEmbeddingExtractor(
        sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(MODEL), num_threads=threads))
    spans, embs = [], []
    for a, b in windows(audio):
        stream = extractor.create_stream()
        stream.accept_waveform(SR, audio[a:b])
        stream.input_finished()
        spans.append((a + b) / 2 / SR)
        embs.append(extractor.compute(stream))
    embs = np.array(embs)
    labels = spectral_cluster(embs, n_speakers)
    # Majority of each window and its two neighbours, only across windows less than 2 s apart.
    smooth = labels.copy()
    for i in range(1, len(labels) - 1):
        if spans[i + 1] - spans[i - 1] < 2 * WIN_S and labels[i - 1] == labels[i + 1] != labels[i]:
            smooth[i] = labels[i - 1]
    first = {}
    for s in smooth:
        first.setdefault(int(s), len(first) + 1)
    return Timeline(np.array(spans), np.array([first[int(s)] for s in smooth]), embs)
