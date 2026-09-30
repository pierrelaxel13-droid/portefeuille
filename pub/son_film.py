#!/usr/bin/env python3
"""Bande-son de film.html, synthétisée (voir synth.py) et calée sur sa timeline.

Usage : python3 son_film.py sortie.wav [--cut=15]
"""
import sys
import numpy as np
import synth as S
from synth import add, tt, mid

CUT = '--cut=15' in sys.argv
out = [a for a in sys.argv[1:] if not a.startswith('--')][0]

# mêmes valeurs que MAP dans film.html : (début en sortie, début dans le film, vitesse)
MAP = [(0, 0, 1.5), (1.6, 2.4, 1.5), (4.0, 6.0, 1.43), (7.5, 11.0, 1.6), (9.5, 14.2, 1.5), (11.5, 20.8, 1.2)]
DUR = 15.0 if CUT else 25.0
S.init(DUR)


def T(ts):
    """Instant du film -> instant de la bande-son (None si sauté dans la version courte)."""
    if not CUT:
        return ts
    for i, (o, s, k) in enumerate(MAP):
        o_end = MAP[i + 1][0] if i + 1 < len(MAP) else DUR
        if s <= ts < s + (o_end - o) * k:
            return o + (ts - s) / k
    return None


def ev(ts, y, gain=1.0, pan=0.0):
    t = T(ts)
    if t is not None:
        add(t, y, gain, pan)


def noise_burst(d, decay, hp=6):
    t = tt(d)
    n = S.rng.standard_normal(len(t))
    return (n - S.lowpass(n, hp)) * np.exp(-t * decay)


def glitch():
    return noise_burst(.14, 30, 3) * .5


def sweep(f0, f1, d, amp=.15):
    """Glissando exponentiel avec une enveloppe qui monte."""
    t = tt(d)
    x = t / d
    f = f0 * (f1 / f0) ** x
    return np.sin(2 * np.pi * np.cumsum(f) / S.SR) * x ** 1.6 * amp


def sub_swell(d):
    t = tt(d)
    x = t / d
    return np.sin(2 * np.pi * np.cumsum(38 + 40 * x) / S.SR) * x ** 2 * .5


def reverse_crash(d):
    t = tt(d)
    n = S.rng.standard_normal(len(t))
    return (n - S.lowpass(n, 5)) * (t / d) ** 3 * .45


DROP = 6.0
END = 20.8

# ---------------- accroche : « Combien avez-vous vraiment ? » ----------------
ev(0, sub_swell(.25), 1.0)
for ts, amp in ((.25, .9), (1.1, 1.05)):
    ev(ts, S.boom(1.3, amp))
    ev(ts, glitch(), 1.0)
    ev(ts, S.tom(70), 1.0)
ev(1.15, S.riser(1.25), .9)
ev(2.4, S.whoosh(.6, False), .9)
ev(2.4, S.boom(1.4, .95))

# ---------------- chaos : cartes et symboles en tourbillon ----------------
for k in range(8):                                   # pouls grave
    ev(2.5 + k * .5, S.kick(), .55)
    ev(2.75 + k * .5, S.tom(95), .35)
for i in range(5):                                   # une carte apparaît
    ev(2.5 + i * .16, S.tom(230 - i * 18), .8, -.6 + i * .3)
rb = np.random.default_rng(4)
for _ in range(26):
    f = 700 + rb.random() * 1400
    ev(2.9 + rb.random() * 2.4, S.blip(f, f * 1.3, .06), .55, rb.random() * 1.6 - .8)
for ts in (2.7, 3.4, 4.2):                           # les trois phrases
    ev(ts, S.boom(.6, .6))
    ev(ts, glitch(), .9)
ev(3.4, S.riser(2.5), .95)
ts = 4.1
sp = .3
while ts < 5.9:                                      # ticks de plus en plus serrés
    ev(ts, S.blip(1200, 1800, .04), .6)
    ts += sp
    sp *= .87
ev(5.5, reverse_crash(.5), 1.0)

# ---------------- le « drop » : les tours jaillissent ----------------
ev(DROP, S.boom(2.2, 1.25))
ev(DROP, S.kick(), 1.0)
ev(DROP, S.whoosh(1.4, False), 1.0)
ev(DROP, noise_burst(.9, 5) * .5)
for i in range(5):
    ev(6.2 + i * .13, S.tom(120 - i * 10), .9, -.5 + i * .25)
    ev(6.2 + i * .13, S.blip(400 + i * 120, 900 + i * 160, .1), .8)
for j, lt in enumerate(np.arange(7.0, 9.4, .06)):    # compteur du total
    ev(lt, S.blip(500 + j * 16, 700 + j * 18), .5, (-1) ** j * .3)
ev(9.2, S.bell(mid(19)), .9)

# ---------------- batterie sur toute la partie « produit » ----------------
d0, d1 = T(DROP), T(END)
d1 = d1 if d1 is not None else DUR
CH = [(55.0, [220, 261.6, 329.6]), (43.65, [174.6, 220, 261.6]), (65.4, [261.6, 329.6, 392]), (49.0, [196, 246.9, 293.7])]
bar = 0
t0 = d0
while t0 < d1 - .01:
    root, notes = CH[bar % 4]
    add(t0, S.pad(notes, 4.4), 1.05)
    for b in range(8):
        tb = t0 + b * .5
        if tb >= d1 - .01:
            break
        add(tb, S.kick(), .95)
        if b % 2 == 1:
            add(tb, S.clap(), .7, .1)
        add(tb + .25, S.hat(), .8, -.25 + .5 * (b % 2))
        add(tb + .25, S.bass(root * 2, .22), .75)
        add(tb, S.bass(root, .4), .8)
    t0 += 4
    bar += 1

# ---------------- ruban : la courbe monte ----------------
ev(11.0, S.whoosh(.7, False), .9)
ev(11.0, S.boom(1.1, .9))
t_r = T(11.0)
if t_r is not None:
    span = (T(14.0) or (t_r + 3.0)) - t_r
    add(t_r, sweep(220, 1760, span, .16), 1.0)
    for j in range(10):
        add(t_r + span * (j + 1) / 11, S.pluck(mid(12 + [0, 3, 7, 10, 12][j % 5] + 12 * (j // 5)), .3), .5, -.4 + j * .09)
ev(13.4, S.boom(1.2, .8))
ev(13.4, S.bell(mid(19)), .9)
ev(13.4, noise_burst(.6, 7, 3) * .5)

# ---------------- tunnel : une note par indicateur ----------------
ev(14.2, S.whoosh(.7, False), .9)
ev(14.2, S.boom(1.1, .9))
pent = [0, 3, 5, 7, 10]
for j in range(14):
    ev(14.2 + .385 + .2 * j, S.pluck(mid(pent[j % 5] + 12 * (j // 5))), .95, -.6 + 1.2 * j / 13)
ev(14.2 + .385 + .2 * 13 + .12, S.bell(mid(24)), .8)

# ---------------- téléphone (absent de la version courte) ----------------
ev(17.2, S.boom(1.2, .9))
ev(17.2, S.whoosh(1.2, True), .8)
for j, lt in enumerate(np.arange(17.8, 19.2, .06)):
    ev(lt, S.blip(600 + j * 20, 800 + j * 24), .45)
ev(18.7, S.blip(400, 1500, .12), .9)
ev(19.3, S.bell(mid(12)), .8)

# ---------------- final ----------------
ev(END, S.boom(2.8, 1.3))
ev(END, noise_burst(1.6, 2.6, 4) * .55)
ev(END, S.pad([220, 261.6, 329.6, 493.9, 659.3], 4.6), 2.2)
ev(END + .9, S.boom(1.2, .8))
for j in range(16):
    ev(END + 1.0 + j * .07, S.pluck(mid([0, 3, 7, 10, 12][j % 5] + 12 * (j // 5) + 12), .5), .8, -.5 + j / 16)
ev(END + 2.0, S.blip(300, 900, .1), .9)
ev(END + 2.6, S.bell(mid(24)), .9)

peak = S.master(out, DUR)
print(f'{out}: {DUR:.1f} s, crête {peak:.2f}')
