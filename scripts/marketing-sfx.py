"""
The reel's sound effects (round 4, George 2026-10-30), made from scratch here: no samples, no libraries of sounds,
so they are royalty-free by construction. Soft and short, meant to sit quietly under a trending song:
a mouse click, keyboard taps (six of them, a little different each), a checkbox tick, a soft whoosh for camera moves,
a light chime for "+30 pts", and a soft pop for things appearing.
    python3 scripts/marketing-sfx.py   ->  marketing/reel/public/sfx/*.wav (44.1 kHz, 16-bit, mono)
"""
import os, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'marketing', 'reel', 'public', 'sfx')
rng = np.random.default_rng(294)

def t(sec):
    return np.arange(int(SR * sec)) / SR

def save(name, x, peak=0.9):
    x = np.asarray(x, dtype=np.float64)
    # A few ms of fade at both ends: no clicks of our own at the edges.
    f = min(len(x) // 4, int(SR * 0.003))
    if f:
        x[:f] *= np.linspace(0, 1, f)
        x[-f:] *= np.linspace(1, 0, f)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a number or an array (a moving filter)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
    a = np.exp(-2 * np.pi * c / SR)
    y = np.zeros_like(x); prev = 0.0
    for i in range(len(x)):
        prev = (1 - a[i]) * x[i] + a[i] * prev
        y[i] = prev
    return y

def highpass(x, cutoff):
    return x - lowpass(x, cutoff)

def transient(length=0.004, bright=3000, decay=0.0015):
    n = rng.standard_normal(int(SR * length))
    return highpass(n, bright) * np.exp(-t(length) / decay)

def place(total, *parts):
    out = np.zeros(int(SR * total))
    for at, x in parts:
        i = int(SR * at); out[i:i + len(x)] += x[: len(out) - i]
    return out

# A mouse click: the press and, 55 ms later, the softer release.
def click():
    press = transient(0.006, 2500, 0.0012) + 0.25 * np.sin(2 * np.pi * 2300 * t(0.006)) * np.exp(-t(0.006) / 0.002)
    release = 0.45 * transient(0.005, 3200, 0.001)
    return place(0.09, (0, press), (0.055, release))

# A keyboard tap: a short bright tick on a low "thock", each one a little different.
def key(i):
    r = np.random.default_rng(100 + i)
    body_f = 170 + 50 * r.random()
    body = np.sin(2 * np.pi * body_f * t(0.05)) * np.exp(-t(0.05) / 0.012) * (0.6 + 0.2 * r.random())
    top = lowpass(highpass(r.standard_normal(int(SR * 0.02)), 900), 4500) * np.exp(-t(0.02) / (0.003 + 0.002 * r.random()))
    return place(0.06, (0, body), (0.0005, top * 1.4))

# A checkbox tick: a crisp click and a small falling blip.
def tick():
    f = np.linspace(2700, 1900, int(SR * 0.05))
    blip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t(0.05) / 0.014)
    return place(0.12, (0, transient(0.004, 2800, 0.001)), (0.004, 0.6 * blip), (0.03, 0.18 * np.sin(2 * np.pi * 3300 * t(0.04)) * np.exp(-t(0.04) / 0.01)))

# A soft whoosh: noise through a filter that opens and closes, swelling and fading.
def whoosh(length=0.9):
    n = rng.standard_normal(int(SR * length))
    x = np.linspace(0, 1, len(n))
    cutoff = 300 + 2600 * np.sin(np.pi * x) ** 1.5
    y = lowpass(lowpass(n, cutoff), cutoff * 1.4)
    return y * np.sin(np.pi * x) ** 2

# A light chime: a bell of a few partials, the second note a moment after.
def chime():
    def bell(f0, dur, amp):
        tt = t(dur)
        parts = [(1, 1.0), (2.0, 0.42), (2.76, 0.22), (4.07, 0.08)]
        s = sum(a * np.sin(2 * np.pi * f0 * m * tt) * np.exp(-tt / (0.9 / m ** 0.5)) for m, a in parts)
        return amp * s * (1 - np.exp(-tt / 0.004))
    return place(2.2, (0, bell(1046.5, 2.0, 1.0)), (0.09, bell(1567.98, 2.0, 0.7)))

# A soft pop: something appearing.
def pop():
    f = np.linspace(520, 880, int(SR * 0.07))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * np.linspace(0, 1, len(f))) ** 1.5

os.makedirs(OUT, exist_ok=True)
save('click', click())
for i in range(6):
    save(f'key{i}', key(i))
save('tick', tick())
save('whoosh', whoosh(0.9))
save('whoosh-long', whoosh(1.4))
save('chime', chime())
save('pop', pop())
print('made', sorted(os.listdir(OUT)))
