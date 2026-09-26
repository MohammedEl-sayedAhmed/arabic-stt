"""The "tech" version of the Tafrigh video track: synthesised from scratch (numpy only), free to publish.

120 BPM, 4/4 (a beat 0.5 s, a bar 2 s), A minor: Am, F, C, G, one chord per bar.
  0-4 s   intro: a filtered 16th-note sequence fading in, digital bleeps, a riser into 4 s
  4 s     impact
  4-30 s  groove: four-on-the-floor kick, clap, 16th hats, pulsing 8th bass, the sequence with a resonant
          filter sweeping over 8 bars, bleeps with ping-pong echo, glitch stutters at 14 and 22 s
  30-36 s build: snare roll, filter wide open, noise riser, pitch-rising bleeps
  36-40 s end card: impact, Am(add9) chord, the sequence echoing out, silence at 40 s
"""
import sys

import numpy as np
import soundfile as sf

SR = 48000
BEAT = 0.5
BAR = 2.0
LENGTH = 40.0
N = int(LENGTH * SR)
rng = np.random.default_rng(11)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(n):
    return np.arange(n) / SR


def env_adsr(n, a=0.005, d=0.1, s=0.7, r=0.05):
    env = np.full(n, float(s))
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    if a_n:
        env[:a_n] = np.linspace(0, 1, a_n, endpoint=False)
    k = min(n, a_n + d_n) - a_n
    if k > 0:
        env[a_n:a_n + k] = 1 - (1 - s) * np.arange(k) / max(1, d_n)
    if 0 < r_n < n:
        env[-r_n:] *= np.linspace(1, 0, r_n) ** 2
    return env


def synth(freq, n, cutoff, reso=0.0, harmonics=32, odd_only=False, detune=(0,), seed=0):
    """Additive saw (or square with odd_only) through a soft low-pass with a resonant bump at the cutoff;
    cutoff can change per sample, so sweeps are free."""
    t = t_axis(n)
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), (n,))
    out = np.zeros(n)
    r = np.random.default_rng(seed)
    for cents in detune:
        f0 = freq * 2 ** (cents / 1200)
        for k in range(1, harmonics + 1):
            if odd_only and k % 2 == 0:
                continue
            fk = f0 * k
            if fk > SR * 0.45:
                break
            g = (1.0 / k) / np.sqrt(1 + (fk / cutoff) ** 6)
            if reso:
                g = g * (1 + reso * np.exp(-(((fk - cutoff) / (0.18 * cutoff)) ** 2)))
            out += g * np.sin(2 * np.pi * fk * t + r.uniform(0, 2 * np.pi))
    return out / len(detune)


def place(track, sig, start):
    i = int(round(start * SR))
    if i >= len(track) or i < 0:
        return
    j = min(len(track), i + len(sig))
    track[i:j] += sig[: j - i]


def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, len(x))


def reverb(x, seconds=1.8, mix=0.2, seed=5):
    n = int(seconds * SR)
    ir = np.random.default_rng(seed).standard_normal(n) * np.exp(-6.9 * t_axis(n) / seconds)
    ir = fft_filter(ir, lo=250, hi=7000)
    ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n
    wet = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return (1 - mix) * x + mix * wet


def pingpong(x, delay=0.375, feedback=0.45, taps=5):
    """Dotted-eighth echoes alternating left and right: returns (left, right) wet signals."""
    left, right = np.zeros_like(x), np.zeros_like(x)
    d = int(delay * SR)
    for k in range(1, taps + 1):
        shifted = np.zeros_like(x)
        if k * d < len(x):
            shifted[k * d:] = x[: len(x) - k * d]
        shifted = fft_filter(shifted, lo=400, hi=6000) if k > 1 else shifted
        (left if k % 2 else right)[:] += shifted * feedback ** k
    return left, right


# --- harmony: A minor ------------------------------------------------------------------------------
CHORDS = [[57, 60, 64, 69], [57, 60, 65, 69], [55, 60, 64, 67], [55, 59, 62, 67]]  # Am, F, C, G
ROOTS = [33, 29, 36, 31]
SCALE = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76]  # A natural minor, two octaves


# --- instruments -----------------------------------------------------------------------------------
def seq_note(m, cutoff, level, dur=0.22):
    n = int(dur * SR)
    t = t_axis(n)
    cut = cutoff * (0.35 + 0.65 * np.exp(-t * 22)) + 250  # a quick "pluck" of the filter
    sig = synth(midi(m), n, cut, reso=2.2, harmonics=28, detune=(-6, 6), seed=m)
    return sig * env_adsr(n, a=0.002, d=0.08, s=0.35, r=0.04) * level


def bleep(m, level=0.07, dur=0.12):
    """A small FM blip: data being processed."""
    n = int(dur * SR)
    t = t_axis(n)
    f = midi(m)
    mod = np.sin(2 * np.pi * f * 3.01 * t) * 2.2 * np.exp(-t * 30)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 28) * level


def bass(m, dur=0.24, level=0.34):
    n = int(dur * SR)
    t = t_axis(n)
    f = midi(m)
    sub = np.sin(2 * np.pi * f * t)
    growl = synth(f, n, 450 * np.exp(-t * 12) + 150, reso=1.0, harmonics=12, seed=m * 3)
    return (0.9 * sub + 0.25 * growl) * env_adsr(n, a=0.003, d=0.1, s=0.6, r=0.04) * level


def pad(notes, dur, cutoff, level=0.05):
    n = int(dur * SR)
    sig = sum(synth(midi(m), n, cutoff, harmonics=20, odd_only=True, detune=(-10, 0, 10), seed=m + 99) for m in notes)
    return fft_filter(sig, lo=300) * env_adsr(n, a=0.4, d=0.4, s=0.9, r=0.6) * level


def kick(level=0.95):
    n = int(0.38 * SR)
    t = t_axis(n)
    f = 48 + 130 * np.exp(-t * 38)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8)
    click = fft_filter(rng.standard_normal(n), lo=2500, hi=10000) * np.exp(-t * 400) * 0.35
    return np.tanh((body + click) * 1.6) / np.tanh(1.6) * level


def clap(level=0.26, tight=False):
    n = int(0.25 * SR)
    t = t_axis(n)
    noise = fft_filter(rng.standard_normal(n), lo=1200, hi=8000)
    env = np.exp(-t * (40 if tight else 20))
    for d in (0.008, 0.017):
        k = int(d * SR)
        env[:k] += 0.7 * np.exp(-t[:k] * 250)
    return noise * env * level


def hat(level=0.06, open_=False):
    n = int((0.2 if open_ else 0.045) * SR)
    t = t_axis(n)
    noise = fft_filter(rng.standard_normal(n), lo=8000, hi=17000)
    return noise * np.exp(-t * (16 if open_ else 90)) * level


def riser(dur, level=0.16):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    chunks = 30
    for c in range(chunks):
        a, b = c * n // chunks, (c + 1) * n // chunks
        centre = 500 * 2 ** (c / chunks * 4.5)
        out[a:b] = fft_filter(x[a:b], lo=centre * 0.7, hi=centre * 1.6)
    return out * (t_axis(n) / dur) ** 2.2 * level


def impact(level=0.8):
    n = int(2.2 * SR)
    t = t_axis(n)
    boom = np.sin(2 * np.pi * (36 + 50 * np.exp(-t * 8)) * t) * np.exp(-t * 2.5)
    zap = np.sin(2 * np.pi * (2400 * np.exp(-t * 14) + 80) * t) * np.exp(-t * 10) * 0.18
    return (boom + zap) * level


def crush(x, bits=6, hold=6):
    """A bit-crushed copy, for the glitches."""
    y = np.repeat(x[::hold], hold)[: len(x)]
    q = 2 ** (bits - 1)
    return np.round(y * q) / q


# --- arrangement -----------------------------------------------------------------------------------
seq = np.zeros(N)
blp = np.zeros(N)
low = np.zeros(N)
pads = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)
duck = np.ones(N)

PATTERN = [0, 2, 1, 3, 0, 2, 3, 1, 0, 2, 1, 3, 2, 3, 1, 3]  # chord tones for the 16ths
for bar in range(20):
    t0 = bar * BAR
    notes, root = CHORDS[bar % 4], ROOTS[bar % 4]
    if t0 < 36:
        # the sequence: quiet and closed in the intro, then sweeping over 8 bars, wide open in the build
        for s in range(16):
            t = t0 + s * BEAT / 4
            if t0 < 4:
                cutoff, level = 500 + 1200 * (t / 4), 0.05 + 0.05 * (t / 4)
            elif t0 < 30:
                cutoff, level = 900 + 1700 * (0.5 - 0.5 * np.cos(2 * np.pi * (t - 4) / 16)), 0.12
            else:
                cutoff, level = 2600 + 900 * (t - 30) / 6, 0.13
            octave = 12 if s in (6, 14) else 0
            accent = 1.25 if s % 4 == 0 else 1.0
            place(seq, seq_note(notes[PATTERN[s]] + octave, cutoff, level * accent), t)
        place(pads, pad([m - 12 for m in notes[:3]], BAR + 0.6, 900 if t0 < 30 else 1500), t0)
    if 4 <= t0 < 36:  # bass on the eighths, root and octave
        for e in range(8):
            place(low, bass(root + (12 if e % 4 == 3 else 0)), t0 + e * BEAT / 2)
    # bleeps: a few per bar on off-sixteenths, chosen from the scale (seeded, so the same each render)
    if t0 < 30 or t0 >= 30:
        r = np.random.default_rng(100 + bar)
        count = 2 if t0 < 4 else 3 if t0 < 30 else 6 if t0 < 36 else 0
        for _ in range(count):
            s = int(r.choice([1, 3, 5, 7, 9, 11, 13, 15]))
            m = int(r.choice(SCALE)) + 12 + (int((t0 - 30) * 1.5) if t0 >= 30 else 0)
            place(blp, bleep(m), t0 + s * BEAT / 4)

# drums, 4-36 s
for i in range(8, 72):
    t = i * BEAT
    place(drums, kick(), t)
    k = int(t * SR)
    m = min(N, k + int(0.3 * SR))
    duck[k:m] = np.minimum(duck[k:m], 0.35 + 0.65 * (np.arange(m - k) / (m - k)) ** 0.7)
    if i % 2 == 1 and t < 30:
        place(drums, clap(), t)
    if t >= 6:
        for q, v in ((0.25, 0.035), (0.5, 0.07), (0.75, 0.04)):
            place(drums, hat(v), t + q * BEAT)
        if t >= 14 and i % 2 == 1:
            place(drums, hat(0.05, open_=True), t + 0.5 * BEAT)

# the build: a roll that doubles in speed, 30-36 s
t = 30.0
while t < 36:
    frac = (t - 30) / 6
    step = BEAT / (2 if frac < 0.34 else 4 if frac < 0.67 else 8)
    place(drums, clap(0.08 + 0.2 * frac, tight=True), t)
    t += step

# transitions
place(fx, riser(3.6, 0.13), 0.4)
place(fx, impact(0.75), 4.0)
place(fx, riser(5.6, 0.17), 30.4)
place(fx, impact(0.85), 36.0)
end_chord = [45, 52, 57, 60, 64, 71]  # Am(add9)
end = sum(synth(midi(m), int(4 * SR), np.linspace(2600, 600, int(4 * SR)), harmonics=24, detune=(-8, 0, 8), seed=m)
          for m in end_chord)
place(pads, fft_filter(end, lo=120) * env_adsr(int(4 * SR), a=0.02, d=0.6, s=0.7, r=1.2) * 0.07, 36.0)
tail = bass(33, dur=3.4, level=0.4)
tail *= np.linspace(1, 0, len(tail)) ** 2  # a slow fade, not a cut
place(low, tail, 36.0)
for k, m in enumerate([69, 72, 76, 81]):
    place(seq, seq_note(m, 2400, 0.12, dur=0.3), 36.0 + k * BEAT / 2)

# glitches: the last beat before 14 s and 22 s stutters in 1/32ths, bit-crushed
music = seq + blp + pads
for g in (13.5, 21.5):
    a, b = int(g * SR), int((g + BEAT) * SR)
    slice_ = (music + drums)[a:a + int(BEAT / 8 * SR)]
    stutter = np.tile(crush(slice_), 8)[: b - a] * np.linspace(1, 0.4, b - a)
    for track in (seq, blp, pads, drums, low):
        track[a:b] *= 0.15
    fx[a:b] += stutter * 0.8

# mix: the tonal parts duck under the kick; echoes on the sequence and the bleeps, left and right
tonal = (seq + pads) * duck + low * (0.55 + 0.45 * duck)
wl, wr = pingpong(seq * 0.5 + blp, delay=0.375, feedback=0.42)
dry = tonal + blp + drums * 0.9 + fx
dry = reverb(dry, seconds=1.6, mix=0.15)
left = dry + wl * 0.55
right = dry + wr * 0.55
stereo = np.stack([left, right], axis=1)

stereo = np.tanh(stereo * 1.4) / np.tanh(1.4)
stereo[: int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]
fade = int(1.5 * SR)
stereo[-fade:] *= (np.linspace(1, 0, fade) ** 1.5)[:, None]
stereo *= 10 ** (-1 / 20) / np.max(np.abs(stereo))

out = sys.argv[1] if len(sys.argv) > 1 else "tafrigh-theme-tech.wav"
sf.write(out, stereo.astype(np.float32), SR, subtype="PCM_24")
print("wrote", out, f"{len(stereo) / SR:.2f} s")
