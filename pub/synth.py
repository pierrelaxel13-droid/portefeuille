"""Primitives de synthèse (numpy) partagées par les bandes-son.

    import synth as S ; S.init(duree) ; S.add(t, S.kick(), gain) … ; S.master('out.wav', duree)
"""
import wave
import numpy as np

SR = 44100
N = 0
L = R = None
rng = np.random.default_rng(7)


def init(dur):
    global N, L, R
    N = int((dur + 1.5) * SR)
    L = np.zeros(N)
    R = np.zeros(N)


def master(out, dur, fade_s=1.4):
    """Fondu de sortie, saturation douce, normalisation, écriture WAV 16 bits."""
    global L, R
    n = int(dur * SR)
    fade = np.ones(N)
    f0 = int((dur - fade_s) * SR)
    fade[f0:] = np.linspace(1, 0, N - f0) ** 1.5
    fade[:int(.05 * SR)] = np.linspace(0, 1, int(.05 * SR))
    l, r = np.tanh(1.5 * L * fade) / np.tanh(1.5), np.tanh(1.5 * R * fade) / np.tanh(1.5)
    peak = max(np.abs(l).max(), np.abs(r).max())
    data = (np.stack([l, r], 1)[:n] * (.89 / peak) * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    return peak


def mid(semis, base=440.0):
    return base * 2 ** (semis / 12)


def add(t0, y, gain=1.0, pan=0.0):
    """Ajoute le signal y à l'instant t0 (s). pan : -1 gauche … +1 droite."""
    i = int(t0 * SR)
    if i < 0 or i >= N:
        return
    y = y[: N - i]
    l = gain * (1 - max(0, pan)) ** .5
    r = gain * (1 + min(0, pan)) ** .5
    L[i:i + len(y)] += y * l
    R[i:i + len(y)] += y * r


def tt(d):
    return np.arange(int(d * SR)) / SR


def lowpass(x, k):
    """Passe-bas très simple (moyenne glissante de k échantillons)."""
    if k <= 1:
        return x
    c = np.cumsum(np.insert(x, 0, 0))
    y = (c[k:] - c[:-k]) / k
    return np.concatenate([np.zeros(k - 1), y])


def kick():
    t = tt(.42)
    f = 42 + 110 * np.exp(-t * 32)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5)
    y += .35 * np.exp(-t * 300) * rng.standard_normal(len(t))
    return y * 1.15


def clap():
    t = tt(.22)
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 6)
    env = np.exp(-t * 26) + .6 * np.exp(-((t - .012) ** 2) * 9e4)
    return n * env * .55


def hat(open_=False):
    t = tt(.18 if open_ else .05)
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 3)
    return n * np.exp(-t * (18 if open_ else 90)) * .32


def bass(freq, d):
    t = tt(d)
    y = np.sin(2 * np.pi * freq * t) + .35 * np.sin(4 * np.pi * freq * t)
    env = np.minimum(1, t * 80) * np.exp(-t * 4.5)
    return y * env * .5


def pad(freqs, d):
    t = tt(d)
    y = np.zeros(len(t))
    for f in freqs:
        for det in (.996, 1.0, 1.004):
            y += np.sin(2 * np.pi * f * det * t) + .3 * np.sin(4 * np.pi * f * det * t)
    env = np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / 1.2)
    return y * env * (.05 / len(freqs)) * (1 + .12 * np.sin(2 * np.pi * .25 * t))


def pluck(freq, d=.42):
    t = tt(d)
    y = np.sin(2 * np.pi * freq * t) + .4 * np.sin(4 * np.pi * freq * t) * np.exp(-t * 14)
    return y * np.exp(-t * 9) * .3


def blip(f0, f1, d=.07):
    t = tt(d)
    f = f0 + (f1 - f0) * t / d
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 55) * .22


def bell(freq):
    t = tt(.9)
    y = np.sin(2 * np.pi * freq * t) + .5 * np.sin(2 * np.pi * freq * 2.76 * t) + .3 * np.sin(2 * np.pi * freq * 5.4 * t)
    return y * np.exp(-t * 4.5) * .2


def tom(f):
    t = tt(.28)
    fr = f * (1 + .6 * np.exp(-t * 30))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 14) * .6


def boom(d=1.6, amp=1.0):
    t = tt(d)
    f = 26 + 90 * np.exp(-t * 7)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 4)
    y += n * np.exp(-t * 6) * .28
    return y * amp


def whoosh(d=.7, up=True):
    t = tt(d)
    x = t / d
    env = np.sin(np.pi * x) ** 2 if not up else x ** 2.2
    n = rng.standard_normal(len(t))
    k = 3 + int(30 * (1 - x[len(x) // 2]))
    y = (n - lowpass(n, 8)) * env * .22
    f = 180 * 2 ** (x * 4.2 if up else (1 - x) * 4.2)
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * env * .12
    return y


def riser(d):
    t = tt(d)
    x = t / d
    n = rng.standard_normal(len(t))
    y = (n - lowpass(n, 5)) * x ** 3 * .25
    f = 120 * 2 ** (x * 3.2)
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * x ** 2 * .1
    return y


