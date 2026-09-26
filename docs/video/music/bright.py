"""An original 40 s track for the Tafrigh video, synthesised from scratch (numpy only), so it is free to publish.

120 BPM, 4/4: a beat is 0.5 s and a bar 2 s. C major, I-V-vi-IV (C, G/B, Am, F), one chord per bar.
  0-4 s   intro: soft pad and a sparse pluck, the filter opening, a riser into 4 s
  4 s     impact: the logo
  4-30 s  groove: kick, clap, hats, bass, and from 14 s a 16th-note arpeggio
  30-36 s build: snare roll, filter up, noise riser
  36-40 s end card: final C chord, pluck motif, tail fading to silence at 40 s
"""
import sys

import numpy as np
import soundfile as sf

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
LENGTH = 40.0
N = int(LENGTH * SR)
rng = np.random.default_rng(7)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(n):
    return np.arange(n) / SR


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, hold=None):
    """An envelope of n samples: attack, decay to sustain, release over the last r seconds."""
    t = t_axis(n)
    env = np.ones(n) * s
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    if a_n:
        env[:a_n] = np.linspace(0, 1, a_n, endpoint=False)
    if d_n:
        seg = slice(a_n, min(n, a_n + d_n))
        k = np.arange(seg.stop - seg.start) / max(1, d_n)
        env[seg] = 1 - (1 - s) * k
    if r_n and r_n < n:
        env[-r_n:] *= np.linspace(1, 0, r_n) ** 2
    return env


def additive(freq, n, cutoff, harmonics=40, detune_cents=(0,), brightness=1.0, phase_seed=0):
    """A band-limited saw-like tone; cutoff (Hz, scalar or array per sample) shapes each harmonic like a
    soft low-pass, so a filter sweep costs nothing extra."""
    t = t_axis(n)
    out = np.zeros(n)
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), (n,))
    r = np.random.default_rng(phase_seed)
    for cents in detune_cents:
        f0 = freq * 2 ** (cents / 1200)
        for k in range(1, harmonics + 1):
            fk = f0 * k
            if fk > SR * 0.45:
                break
            gain = (1.0 / k ** brightness) / np.sqrt(1 + (fk / cutoff) ** 4)
            out += gain * np.sin(2 * np.pi * fk * t + r.uniform(0, 2 * np.pi))
    return out / len(detune_cents)


def place(track, sig, start):
    i = int(round(start * SR))
    if i >= len(track):
        return
    j = min(len(track), i + len(sig))
    track[i:j] += sig[: j - i]


def fft_filter(x, lo=None, hi=None):
    """Static band filter in the frequency domain (smooth edges)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


def reverb(x, seconds=2.2, mix=0.25, seed=3):
    """Convolution with a synthetic, exponentially decaying, slightly darkened noise tail."""
    n = int(seconds * SR)
    r = np.random.default_rng(seed)
    ir = r.standard_normal(n) * np.exp(-6.9 * t_axis(n) / seconds)
    ir = fft_filter(ir, lo=200, hi=6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n
    wet = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return (1 - mix) * x + mix * wet * 0.9


# --- harmony ---------------------------------------------------------------------------------------
# C, G/B, Am, F (voicings around middle C), bass roots
CHORDS = [[60, 64, 67, 72], [59, 62, 67, 71], [57, 60, 64, 69], [57, 60, 65, 69]]
ROOTS = [36, 35, 33, 29]


def chord_at(bar):
    return CHORDS[bar % 4], ROOTS[bar % 4]


# --- instruments -----------------------------------------------------------------------------------
def pad(start, dur, notes, cutoff):
    n = int(dur * SR)
    sig = np.zeros(n)
    for i, m in enumerate(notes):
        sig += additive(midi(m), n, cutoff, harmonics=24, detune_cents=(-9, 0, 8), phase_seed=m * 7 + i)
    # thinned below 300 Hz, where the bass lives, so the low mids don't get muddy
    sig = fft_filter(sig, lo=300)
    return start, sig * adsr(n, a=0.35, d=0.4, s=0.85, r=0.5) * 0.10


def pluck(freq, dur=0.45, cutoff=3500, level=0.22):
    n = int(dur * SR)
    t = t_axis(n)
    cut = cutoff * np.exp(-t * 9) + 400
    sig = additive(freq, n, cut, harmonics=18, brightness=1.2, phase_seed=int(freq))
    return sig * np.exp(-t * 7.5) * adsr(n, a=0.002, d=0.02, s=1, r=0.05) * level


def bass(freq, dur):
    n = int(dur * SR)
    t = t_axis(n)
    sub = np.sin(2 * np.pi * freq * t)
    body = additive(freq, n, 700 * np.exp(-t * 5) + 250, harmonics=10, phase_seed=int(freq * 3))
    return (0.85 * sub + 0.18 * body) * adsr(n, a=0.004, d=0.12, s=0.7, r=0.06) * 0.30


def kick(level=0.9):
    n = int(0.42 * SR)
    t = t_axis(n)
    f = 45 + 105 * np.exp(-t * 32)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 7.5)
    click = fft_filter(rng.standard_normal(n), lo=2000, hi=9000) * np.exp(-t * 300) * 0.25
    return (body + click) * level


def clap(level=0.28):
    n = int(0.3 * SR)
    t = t_axis(n)
    noise = fft_filter(rng.standard_normal(n), lo=900, hi=7000)
    env = np.exp(-t * 18)
    for d in (0.011, 0.022):  # the few quick hits of a hand clap
        k = int(d * SR)
        env[:k] += 0.6 * np.exp(-t[:k] * 200)
    return noise * env * level


def hat(level=0.09, open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = t_axis(n)
    noise = fft_filter(rng.standard_normal(n), lo=7000, hi=16000)
    return noise * np.exp(-t * (14 if open_ else 70)) * level


def riser(dur, level=0.18):
    n = int(dur * SR)
    t = t_axis(n)
    x = rng.standard_normal(n)
    # a sweep: split into chunks, each band-passed a little higher
    out = np.zeros(n)
    chunks = 24
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        centre = 600 * 2 ** (c / chunks * 4)
        out[a:b] = fft_filter(x[a:b], lo=centre * 0.6, hi=centre * 1.8)
    return out * (t / dur) ** 2 * level


def impact(level=0.8):
    n = int(2.5 * SR)
    t = t_axis(n)
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t * 6)) * t) * np.exp(-t * 2.2)
    air = fft_filter(rng.standard_normal(n), lo=300, hi=4000) * np.exp(-t * 3) * 0.25
    return (boom + air) * level


# --- arrangement -----------------------------------------------------------------------------------
music = np.zeros(N)   # tonal parts, ducked by the kick
drums = np.zeros(N)
fx = np.zeros(N)
duck = np.ones(N)

bars = int(LENGTH / BAR)
for bar in range(bars):
    t0 = bar * BAR
    notes, root = chord_at(bar)
    # pad: filter closed in the intro, open in the groove, wider in the build, warm at the end
    if t0 < 4:
        cut = np.linspace(500, 1400, int(BAR * SR + 0.5 * SR))
    elif t0 < 30:
        cut = 1800
    elif t0 < 36:
        cut = np.linspace(1800 + (t0 - 30) * 500, 2300 + (t0 - 30) * 500, int(BAR * SR + 0.5 * SR))
    else:
        cut = 1600
    s, sig = pad(t0, BAR + 0.5, notes, cut)
    place(music, sig * (0.8 if t0 < 4 else 1.0), s)

    if t0 < 4:  # sparse plucks in the intro
        for k, m in enumerate([notes[1] + 12, notes[2] + 12]):
            place(music, pluck(midi(m), level=0.14), t0 + 0.5 + k * 1.0)
    if 4 <= t0 < 36:
        # bass: root on the beat, octave bounce on the off-beat eighths
        for b in range(4):
            place(music, bass(midi(root), 0.42), t0 + b * BEAT)
            if t0 >= 6:
                place(music, bass(midi(root + 12), 0.2) * 0.6, t0 + b * BEAT + BEAT / 2)
    if 14 <= t0 < 36:
        # 16th arpeggio over the chord, up two octaves on the last beat of each bar
        pattern = [0, 1, 2, 3, 2, 1, 2, 3]
        for s16 in range(16):
            m = notes[pattern[s16 % 8]] + 12 + (12 if s16 >= 12 else 0)
            lvl = 0.10 if s16 % 4 else 0.14
            place(music, pluck(midi(m), dur=0.25, cutoff=2500 + (t0 - 14) * 120, level=lvl), t0 + s16 * BEAT / 4)
    if t0 >= 36:  # the end: a pluck motif over the last chord
        for k, m in enumerate([72, 76, 79, 84]):
            place(music, pluck(midi(m), dur=1.2, cutoff=3000, level=0.16), t0 + k * BEAT * 0.5 + (0 if t0 == 36 else 99))

# drums in the groove
for i in range(int(4 / BEAT), int(36 / BEAT)):
    t = i * BEAT
    if 4 <= t < 36:
        place(drums, kick(0.85 if t < 30 else 0.9), t)
        k = int(t * SR)
        m = min(N, k + int(0.28 * SR))
        duck[k:m] = np.minimum(duck[k:m], 0.45 + 0.55 * (np.arange(m - k) / (m - k)) ** 0.6)
    if 6 <= t < 30 and i % 2 == 1:
        place(drums, clap(), t)
    if 6 <= t < 36:
        place(drums, hat(0.08), t + BEAT / 2)
        if t >= 14:
            place(drums, hat(0.04), t + BEAT / 4)
            place(drums, hat(0.04), t + 3 * BEAT / 4)
    if 28 <= t < 30 and i % 4 == 3:
        place(drums, hat(0.08, open_=True), t + BEAT / 2)

# the build: a snare roll getting faster and louder
t = 30.0
while t < 36:
    frac = (t - 30) / 6
    step = BEAT / (2 if frac < 0.34 else 4 if frac < 0.67 else 8)
    place(drums, clap(0.10 + 0.22 * frac), t)
    t += step

# transitions
place(fx, riser(3.5, 0.14), 0.5)          # into the logo at 4 s
place(fx, impact(0.75), 4.0)
place(fx, riser(5.5, 0.18), 30.5)         # into the end card at 36 s
place(fx, impact(0.85), 36.0)
_, final = pad(36.0, 4.0, [48, 55, 60, 64, 67, 72], np.linspace(2200, 700, int(4 * SR)))
place(music, final * 1.4, 36.0)
place(music, bass(midi(36), 3.2) * 1.2, 36.0)

mix = music * duck + drums * 0.9 + fx
mix = reverb(mix, seconds=2.4, mix=0.22)

# stereo: a small Haas widening of the tonal and fx parts, drums in the centre
wide = reverb(music * duck + fx, seconds=1.6, mix=0.5, seed=11)
d = int(0.012 * SR)
left = mix + 0.18 * wide
right = mix + 0.18 * np.concatenate([np.zeros(d), wide[:-d]])
stereo = np.stack([left, right], axis=1)

# master: gentle saturation, fade-in of 30 ms, fade-out over the last 1.5 s, peak at -1 dBFS
stereo = np.tanh(stereo * 1.3) / np.tanh(1.3)
stereo[: int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]
fade = int(1.5 * SR)
stereo[-fade:] *= (np.linspace(1, 0, fade) ** 1.5)[:, None]
stereo *= 10 ** (-1 / 20) / np.max(np.abs(stereo))

out = sys.argv[1] if len(sys.argv) > 1 else "tafrigh-theme.wav"
sf.write(out, stereo.astype(np.float32), SR, subtype="PCM_24")
print("wrote", out, f"{len(stereo) / SR:.2f} s")
