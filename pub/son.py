#!/usr/bin/env python3
"""Bande-son synthétisée, calée sur les instants de video.html.

Usage : python3 son.py sortie.wav [--cut=15]
Aucun échantillon : tout est calculé (kick, claps, basse, nappes, « tic » des
compteurs, une note par tuile, whoosh et impact à chaque transition).
Nécessite numpy.
"""
import sys, wave
import numpy as np

SR = 44100
CUT = '--cut=15' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')][0]

# (début, scène, vitesse) : mêmes valeurs que SC dans video.html
if CUT:
    SC = [(0, 'A', 1.3), (2.9, 'C', 1.1), (8.5, 'D', 1.6), (11.2, 'F', 1.15)]
    DUR = 15.03
else:
    SC = [(0, 'A', 1), (3.8, 'B', 1), (8.4, 'C', 1), (14.6, 'D', 1), (19.4, 'E', 1), (23.4, 'F', 1)]
    DUR = 28.03

N = int((DUR + 1.5) * SR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


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


real = lambda i, lt: SC[i][0] + lt / SC[i][2]
mid = lambda semis, base=440.0: base * 2 ** (semis / 12)

# ---------- musique : 120 BPM, Am – F – C – G, un accord toutes les 4 s ----------
CH = [
    (55.0, [220, 261.6, 329.6]),
    (43.65, [174.6, 220, 261.6]),
    (65.4, [261.6, 329.6, 392]),
    (49.0, [196, 246.9, 293.7]),
]
drums_from = SC[1][0] if len(SC) > 1 else 0
for bar in range(int(DUR // 4) + 1):
    root, notes = CH[bar % 4]
    add(bar * 4, pad(notes, 4.4), 1.0, 0)
    if bar * 4 + 4 > drums_from:
        for b in range(8):
            t0 = bar * 4 + b * .5
            if t0 < drums_from - .01 or t0 > DUR:
                continue
            if t0 < SC[-1][0] + 2.2 / SC[-1][2]:
                add(t0, kick(), .95)
                if b % 2 == 1:
                    add(t0, clap(), .7, .1)
                add(t0 + .25, hat(), .8, -.25 + .5 * (b % 2))
                add(t0 + .25, bass(root * 2, .22), .8)
                add(t0, bass(root, .4), .8)

# ---------- effets synchronisés avec l'image ----------
for i, (s, name, k) in enumerate(SC):
    if i > 0:
        add(s - .35, whoosh(.7, True), .9)
        add(s, boom(1.5, .95), .9)
        add(s + .02, hat(True), .9)
    if name == 'A':
        add(0, riser(real(0, 2.4)), .9)
        for j, lt in enumerate(np.arange(.35, 2.7, .045)):
            add(real(i, lt), blip(500 + j * 18, 700 + j * 20), .5, (-1) ** j * .3)
        add(real(i, 2.4), bell(mid(19)), .9)
        add(real(i, 2.4), boom(1.0, .7))
    if name == 'B':
        for j in range(5):
            add(real(i, .25 + j * .32), tom(150 - j * 8), .9, -.4 + j * .2)
        add(real(i, 3.15), boom(1.1, .8))
        add(real(i, 3.35), tom(110), 1.0)
    if name == 'C':
        add(real(i, .4), whoosh(2.0 / k, True), .6)
        for j in range(5):
            add(real(i, 1.2 + j * .18), blip(900, 1300, .05), .6, -.5 + j * .25)
        add(real(i, 2.4), riser(2.2 / k), .5)
        for j, lt in enumerate(np.arange(4.4, 5.6, .06)):
            add(real(i, lt), blip(700 + j * 25, 900 + j * 30), .5)
        add(real(i, 4.8), bell(mid(14)), .8)
    if name == 'D':
        pent = [0, 3, 5, 7, 10]
        for j in range(14):
            semis = pent[j % 5] + 12 * (j // 5) + 0
            add(real(i, .6 + j * .22), pluck(mid(semis)), .95, -.6 + 1.2 * (j / 13))
        add(real(i, .6 + 13 * .22 + .1), bell(mid(24)), .8)
    if name == 'E':
        add(real(i, .2), whoosh(.9, True), .7)
        add(real(i, 1.2), blip(400, 1500, .12), .8)
        add(real(i, 1.9), bell(mid(12)), .8)
    if name == 'F':
        add(real(i, .2), boom(1.2, .7))
        add(real(i, 1.0), boom(2.4, 1.15))
        add(real(i, 1.0), hat(True), 1.0)
        for j in range(14):
            add(real(i, 1.0 + j * .07), pluck(mid([0, 3, 7, 10, 12][j % 5] + 12 * (j // 5) + 12), .5), .8, -.5 + j / 14)
        add(real(i, 1.8), blip(300, 900, .1), .9)
        add(real(i, 2.4), bell(mid(24)), .9)
        add(real(i, 1.0), pad([220, 261.6, 329.6, 493.9, 659.3], 4.5), 2.0)

# ---------- finition : mixage, saturation douce, fondu ----------
n = int(DUR * SR)
fade = np.ones(N)
f0 = int((DUR - 1.4) * SR)
fade[f0:] = np.linspace(1, 0, N - f0) ** 1.5
fade[:int(.05 * SR)] = np.linspace(0, 1, int(.05 * SR))
L, R = np.tanh(1.5 * L * fade) / np.tanh(1.5), np.tanh(1.5 * R * fade) / np.tanh(1.5)
peak = max(np.abs(L).max(), np.abs(R).max())
g = .89 / peak
data = (np.stack([L, R], 1)[:n] * g * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
print(f'{out}: {DUR:.1f} s, crête {peak:.2f}')
