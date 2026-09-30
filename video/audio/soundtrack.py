#!/usr/bin/env python3
"""Bande-son de la vidéo Deep Clean — entièrement synthétisée, aucun sample.

  * Musique électronique à 120 BPM (une mesure = 2 s, un temps = 0,5 s) : la
    grille est la même que celle de l'animation, donc chaque coupe tombe sur un
    temps. Progression Rém – Si♭ – Fa – Do, résolution finale en Ré majeur.
  * Design sonore : chaque événement visuel déclare un repère (DC.cue) ;
    `node render.js cues` les exporte dans out/cues.json et ce script place le
    son correspondant à l'échantillon près (48 kHz = 800 échantillons/image).

Usage : python3 audio/soundtrack.py  → out/soundtrack.wav (48 kHz, 24 bits, stéréo)
"""
import json
import pathlib
import wave

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
SR = 48000
BEAT = 0.5
BAR = 2.0
DUR = 60.0
N = int(SR * DUR)
rng = np.random.default_rng(20260930)


# ----------------------------------------------------------------- utilitaires
def tt(dur):
    return np.arange(int(round(dur * SR))) / SR


def hz(note):
    """'D4' / 'F#3' / 'Bb2' → fréquence (La4 = 440 Hz)."""
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    semi = names[note[0]]
    rest = note[1:]
    if rest.startswith("#"):
        semi, rest = semi + 1, rest[1:]
    elif rest.startswith("b"):
        semi, rest = semi - 1, rest[1:]
    midi = 12 * (int(rest) + 1) + semi
    return 440.0 * 2 ** ((midi - 69) / 12)


def sos(kind, f, order=2):
    if kind == "bp":
        return signal.butter(order, [max(20, f[0]), min(SR / 2 - 100, f[1])], "bandpass", fs=SR, output="sos")
    return signal.butter(order, min(SR / 2 - 100, max(20, f)), kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)


def sweep(x, kind, f_of_t, q=0.9, block=128):
    """Filtre biquad dont la fréquence évolue dans le temps (traitement par blocs)."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.clip(f_of_t(i / SR), 30, SR / 2 - 500))
        w = 2 * np.pi * f / SR
        alpha = np.sin(w) / (2 * q)
        c = np.cos(w)
        if kind == "lp":
            b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        elif kind == "hp":
            b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        else:  # passe-bande, gain constant au pic
            b = [alpha, 0, -alpha]
        a = [1 + alpha, -2 * c, 1 - alpha]
        seg, zi = signal.lfilter(b, a, x[i : i + block], zi=zi)
        y[i : i + block] = seg
    return y


def shelf(x, kind, f0, gain_db):
    """Égaliseur en plateau (formules RBJ), pour incliner le spectre du bus musique."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    c, al = np.cos(w0), np.sin(w0) / 2 * np.sqrt(2)
    sq = 2 * np.sqrt(A) * al
    if kind == "low":
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    else:
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return signal.lfilter(b, a, x, axis=0)


def saw(freq, t, detune_cents=0.0, phase0=0.0):
    """Dent de scie à bande limitée (PolyBLEP), fréquence constante ou tableau."""
    f = freq * 2 ** (detune_cents / 1200)
    dt = np.broadcast_to(f / SR, t.shape)
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def noise(n, stereo=False):
    return rng.standard_normal((n, 2) if stereo else n)


def pan2(x, pan=0.0):
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2)


def place(buf, x, t, gain=1.0, pan=0.0):
    if x.ndim == 1:
        x = pan2(x, pan)
    i = int(round(t * SR))
    if i >= len(buf):
        return
    j0 = max(0, -i)
    i0 = max(0, i)
    n = min(len(x) - j0, len(buf) - i0)
    if n > 0:
        buf[i0 : i0 + n] += x[j0 : j0 + n] * gain


def mixn(*parts):
    """Additionne des signaux mono de longueurs différentes."""
    out = np.zeros(max(len(p) for p in parts))
    for p in parts:
        out[: len(p)] += p
    return out


def fade(x, fin=0.002, fout=0.01):
    n = len(x)
    a = min(n, int(fin * SR))
    b = min(n, int(fout * SR))
    env = np.ones(n)
    if a:
        env[:a] = np.linspace(0, 1, a)
    if b:
        env[n - b :] *= np.linspace(1, 0, b)
    return x * (env[:, None] if x.ndim == 2 else env)


def reverb_ir(rt60=1.8, dur=2.6, damp=5000, seed=3):
    g = np.random.default_rng(seed)
    t = tt(dur)
    decay = np.exp(-6.9 * t / rt60)
    ir = g.standard_normal((len(t), 2)) * decay[:, None]
    ir = filt(ir, "lp", damp)
    # Premières réflexions éparses.
    for k in range(14):
        d = int(g.uniform(0.005, 0.06) * SR)
        ir[d] += g.uniform(-0.8, 0.8, 2) * (1 - k / 16)
    ir[: int(0.004 * SR)] = 0
    return ir / np.sqrt((ir**2).sum() / 2)


def convolve(x, ir, wet=0.25):
    out = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return out * wet


# ---------------------------------------------------------------- instruments
def kick(punch=1.0, dur=0.5):
    t = tt(dur)
    f = 44 + 120 * np.exp(-t * 32) + 60 * np.exp(-t * 180)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    click = filt(noise(len(t)), "hp", 2500) * np.exp(-t * 500) * 0.35 * punch
    x = np.tanh((body + click) * 1.8) / np.tanh(1.8)
    return fade(x, 0, 0.02)


def clap(dur=0.4):
    t = tt(dur)
    env = np.zeros_like(t)
    for d in (0.0, 0.009, 0.019):
        env += np.where(t >= d, np.exp(-(t - d) * 180), 0)
    env += np.where(t >= 0.027, np.exp(-(t - 0.027) * 20) * 0.9, 0)
    x = filt(noise(len(t)), "bp", (900, 2800)) * env
    return fade(x * 1.6, 0, 0.02)


_HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(open_=False):
    dur = 0.4 if open_ else 0.07
    t = tt(dur)
    metal = sum(np.sign(np.sin(2 * np.pi * f * 1.9 * t + k)) for k, f in enumerate(_HAT_FREQS))
    x = filt(metal * 0.25 + noise(len(t)) * 0.8, "hp", 7200)
    x *= np.exp(-t * (11 if open_ else 85))
    return fade(x, 0, 0.005)


def snare(dur=0.25):
    t = tt(dur)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.6
    nz = filt(noise(len(t)), "bp", (1500, 7000)) * np.exp(-t * 24)
    return fade(tone + nz, 0, 0.01)


def pluck(f, dur=0.45, bright=1.0, decay=1.0):
    """Corde pincée additive : les harmoniques aiguës s'éteignent plus vite."""
    t = tt(dur)
    x = np.zeros_like(t)
    for k in range(1, 14):
        if f * k > 16000:
            break
        x += (1 / k**1.1) * np.exp(-t * (6 + k * 7 / bright) / decay) * np.sin(2 * np.pi * f * k * t + k)
    return fade(x * 0.5, 0.001, 0.03)


def bell(f, dur=1.4, index=2.2, ratio=3.5, decay=2.6):
    t = tt(dur)
    mod = index * np.exp(-t * 3.2) * np.sin(2 * np.pi * f * ratio * t)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * decay)
    x += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * decay * 1.8)
    return fade(x * 0.45, 0.001, 0.05)


def supersaw(freqs, dur, cutoff=1800, attack=0.25, release=0.5, voices=5, spread=14):
    t = tt(dur + release)
    out = np.zeros((len(t), 2))
    for fi, f in enumerate(freqs):
        for v in range(voices):
            cents = (v - (voices - 1) / 2) * spread / ((voices - 1) / 2)
            x = saw(f, t, cents, phase0=rng.random())
            out += pan2(x, (v / (voices - 1) - 0.5) * 1.4) * (0.9 if fi == 0 else 0.7)
    env = np.minimum(1, t / attack) * np.where(t > dur, np.exp(-(t - dur) * 4 / release), 1)
    out = filt(out, "lp", cutoff) * env[:, None]
    return out / (len(freqs) * voices) * 2.2


def bass_note(f, dur, cutoff=420):
    t = tt(dur)
    x = saw(f, t) * 0.55 + np.sin(2 * np.pi * f * t) * 0.9 + np.sin(2 * np.pi * f / 2 * t) * 0.25
    x = sweep(x, "lp", lambda s: cutoff * (1 + 2.2 * np.exp(-s * 25)), q=1.1, block=64)
    env = np.minimum(1, t / 0.004) * np.exp(-t * 2.5)
    return fade(np.tanh(x * env * 1.4), 0.001, 0.02)


# -------------------------------------------------------------- effets sonores
def s_whoosh(dur=0.5, lo=350, hi=3800, low=False, gain=1.0, pan_from=-0.6, pan_to=0.6):
    if low:
        lo, hi = 120, 1400
    t = tt(dur)
    p = t / dur
    nz = noise(len(t))
    x = sweep(nz, "bp", lambda s: lo * (hi / lo) ** np.sin(np.pi * min(1.0, s / dur)), q=1.4, block=64)
    env = np.sin(np.pi * p) ** 1.6
    x = x * env
    pan = pan_from + (pan_to - pan_from) * p
    out = np.stack([x * np.cos((pan + 1) * np.pi / 4), x * np.sin((pan + 1) * np.pi / 4)], axis=1) * np.sqrt(2)
    return fade(out * 0.9 * gain)


def s_riser(dur, soft=False):
    t = tt(dur)
    p = t / dur
    nz = noise(len(t))
    x = sweep(nz, "bp", lambda s: 300 * (9000 / 300) ** (s / dur) ** 1.4, q=1.2, block=128)
    f = 180 * (4.5) ** (p**1.6)
    tone = saw(f, t) * 0.25 + saw(f * 1.5, t) * 0.12
    tone = filt(tone, "lp", 3000)
    y = (x * 0.9 + tone) * (p**2.2)
    y = np.stack([y, np.roll(y, 311)], axis=1)
    return fade(y * (0.45 if soft else 0.75), 0.05, 0.004)


def s_impact(final=False):
    dur = 3.2 if final else 2.2
    t = tt(dur)
    f = 26 + 50 * np.exp(-t * 5)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (1.2 if final else 1.8))
    body = filt(noise(len(t)), "lp", 700) * np.exp(-t * 9) * 0.7
    crash = filt(noise(len(t)), "hp", 5000) * np.exp(-t * (1.4 if final else 2.2)) * 0.35
    x = np.tanh((boom * 1.3 + body) * 1.3) + crash
    return fade(np.stack([x, np.roll(x, 97)], axis=1) * 0.9, 0.0005, 0.05)


def s_pop(f0=420, f1=1150, dur=0.09):
    t = tt(dur)
    f = f0 + (f1 - f0) * (1 - np.exp(-t * 60))
    return fade(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * 0.5)


def s_tick(f=3200):
    t = tt(0.04)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 260) + filt(noise(len(t)), "hp", 4000) * np.exp(-t * 700) * 0.3
    return fade(x * 0.55, 0, 0.002)


def s_chime():
    a = bell(hz("E6"), 0.9, index=1.2, ratio=2.0, decay=5)
    b = bell(hz("B6"), 0.9, index=1.2, ratio=2.0, decay=4)
    out = np.zeros(len(a) + int(0.085 * SR))
    out[: len(a)] += a
    out[int(0.085 * SR) :] += b
    return out * 0.8


def s_send():
    w = s_whoosh(0.16, 900, 5200, gain=0.45, pan_from=0.1, pan_to=0.5)
    p = pan2(s_pop(600, 1500, 0.08), 0.3)
    out = np.zeros((len(w) + len(p), 2))
    out[: len(w)] += w
    out[int(0.12 * SR) : int(0.12 * SR) + len(p)] += p * 0.9
    return out


def s_receive():
    a = s_pop(700, 900, 0.1)
    b = s_pop(900, 1180, 0.12)
    out = np.zeros(len(a) + int(0.07 * SR) + len(b))
    out[: len(a)] += a
    out[int(0.07 * SR) : int(0.07 * SR) + len(b)] += b
    return out * 0.8


def s_check():
    t = tt(0.35)
    x = (np.sin(2 * np.pi * 1760 * t) + 0.6 * np.sin(2 * np.pi * 2637 * t)) * np.exp(-t * 14)
    return fade(x * 0.3)


def s_click(hp=3000, dur=0.004):
    t = tt(dur + 0.01)
    return filt(noise(len(t)), "hp", hp) * np.exp(-t / dur * 3)


def s_lock():
    out = np.zeros(int(0.2 * SR))
    c = s_click(2500, 0.003)
    out[: len(c)] += c * 0.8
    out[int(0.028 * SR) : int(0.028 * SR) + len(c)] += c
    t = tt(0.12)
    ping = np.sin(2 * np.pi * 2250 * t) * np.exp(-t * 40) * 0.25
    out[int(0.028 * SR) : int(0.028 * SR) + len(ping)] += ping
    return out * 0.9


def s_snap():
    t = tt(0.15)
    x = np.sin(2 * np.pi * 120 * t) * np.exp(-t * 40) * 0.7 + np.sin(2 * np.pi * 1500 * t) * np.exp(-t * 60) * 0.25
    c = s_click(2000, 0.003)
    x[: len(c)] += c
    return fade(x)


def s_tap():
    t = tt(0.08)
    x = np.sin(2 * np.pi * 170 * t) * np.exp(-t * 60) * 0.8
    c = s_click(2500, 0.002)
    x[: len(c)] += c * 0.6
    return fade(x)


def s_zap():
    t = tt(0.4)
    f = 500 * (6 ** (t / 0.4))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.4) * 0.35
    x += filt(noise(len(t)), "hp", 6000) * np.exp(-t * 6) * 0.15
    return fade(x)


def s_shutter():
    out = np.zeros(int(0.25 * SR))
    for d, g in ((0.0, 1.0), (0.055, 0.8)):
        c = s_click(1800, 0.004)
        i = int(d * SR)
        out[i : i + len(c)] += c * g
    t = tt(0.1)
    out[: len(t)] += np.sin(2 * np.pi * 110 * t) * np.exp(-t * 50) * 0.5
    return out


def s_stamp():
    t = tt(0.4)
    f = 55 + 60 * np.exp(-t * 30)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    x += filt(noise(len(t)), "lp", 1800) * np.exp(-t * 45) * 0.8
    x += filt(noise(len(t)), "bp", (1500, 4500)) * np.exp(-t * 70) * 0.4
    return fade(np.tanh(x * 1.5))


def s_drop():
    t = tt(0.25)
    f = 520 * np.exp(t * 38).clip(max=4.2)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 28)
    return fade(x * 0.6)


def s_squeegee(dur=0.9):
    """Raclette sur la vitre : couinement de caoutchouc + glissement mouillé."""
    t = tt(dur)
    p = t / dur
    f = 1150 + 520 * p + 60 * np.sin(2 * np.pi * 7 * t)
    stick = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * (38 + 25 * p) * t))
    squeak = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.35 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    squeak = filt(squeak * stick, "bp", (900, 4200)) * (np.sin(np.pi * p) ** 0.6) * 0.22
    wet = sweep(noise(len(t)), "bp", lambda s: 1800 + 2500 * s / dur, q=0.8, block=128) * np.sin(np.pi * p) * 0.35
    return fade(pan2(squeak + wet, 0) * np.linspace(-0.2, 1.2, len(t))[:, None].clip(0.3, 1), 0.02, 0.05)


def s_buzz():
    t = tt(0.42)
    x = np.sign(np.sin(2 * np.pi * 165 * t)) * 0.4 + np.sin(2 * np.pi * 330 * t) * 0.3
    am = (np.sin(2 * np.pi * 26 * t) > -0.2).astype(float)
    x = filt(x * am, "lp", 1200) * np.minimum(1, (0.42 - t) * 20)
    return fade(x * 0.5)


def s_ping():
    return bell(hz("G6"), 0.6, index=0.8, ratio=2.0, decay=7) * 0.8


def s_sms():
    t = tt(0.07)
    beep = np.sin(2 * np.pi * 1320 * t) * 0.3
    out = np.zeros(int(0.22 * SR))
    out[: len(t)] += fade(beep)
    out[int(0.13 * SR) : int(0.13 * SR) + len(t)] += fade(beep)
    return out


def s_hit(big=False):
    k = kick(1.3, 0.6)
    t = tt(len(k) / SR)
    nz = filt(noise(len(t)), "bp", (200, 3000)) * np.exp(-t * (9 if big else 16)) * 0.6
    tom = np.sin(2 * np.pi * 95 * t) * np.exp(-t * 10) * 0.5
    x = np.tanh((k + nz + tom) * 1.7)
    return x * (1.0 if big else 0.8)


def s_step(n):
    notes = ["D5", "F5", "A5", "C6", "D6"]
    return mixn(pluck(hz(notes[n % 5]), 0.6, bright=1.4, decay=0.7) * 0.8, bell(hz(notes[n % 5]) * 2, 0.5, 0.6, 2.0, 9) * 0.25)


def s_count(dur):
    out = np.zeros(int((dur + 0.05) * SR))
    n = 18
    for k in range(n):
        d = dur * (1 - (1 - k / n) ** 1.6)
        c = s_tick(2200 + k * 90)
        i = int(d * SR)
        out[i : i + len(c)] += c * 0.45
    return out


def s_word(n):
    roots = ["D4", "D4", "F4", "A4", "D5"]
    f = hz(roots[min(n, 4)])
    x = pluck(f, 1.0, bright=0.8, decay=1.6) + pluck(f * 1.5, 1.0, bright=0.8, decay=1.4) * 0.5
    t = tt(len(x) / SR)
    x += np.sin(2 * np.pi * f / 2 * t) * np.exp(-t * 4) * 0.4
    return x * 0.7


def s_open():
    t = tt(0.5)
    f = 380 * (2.4 ** (t / 0.5))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.5) * 0.25
    return pan2(fade(x)) + s_whoosh(0.5, 600, 5000, gain=0.35)


def s_deal():
    w = s_whoosh(0.2, 1200, 6000, gain=0.45)
    c = pan2(s_click(3000, 0.003) * 0.5)
    out = np.zeros((len(w) + len(c), 2))
    out[: len(w)] += w
    out[len(w) - len(c) // 2 : len(w) - len(c) // 2 + len(c)] += c
    return out


def s_feature(n):
    notes = ["A4", "C5", "D5", "F5", "A5"]
    f = hz(notes[n % 5])
    return mixn(bell(f, 1.0, index=1.0, ratio=2.0, decay=4.5) * 0.6, pluck(f, 0.5, 1.2, 0.8) * 0.4)


# ------------------------------------------------------------------- musique
CHORDS = {  # (voicing du pad, fondamentale basse, notes de l'arpège)
    "Dm": (["D3", "F3", "A3", "D4"], "D2", ["D4", "F4", "A4", "D5"]),
    "Bb": (["D3", "F3", "Bb3", "D4"], "Bb1", ["D4", "F4", "Bb4", "D5"]),
    "F": (["C3", "F3", "A3", "C4"], "F2", ["C4", "F4", "A4", "C5"]),
    "C": (["C3", "E3", "G3", "C4"], "C2", ["C4", "E4", "G4", "C5"]),
    "D": (["D3", "F#3", "A3", "D4"], "D2", ["D4", "F#4", "A4", "D5"]),
}
PROG = ["Dm", "Bb", "F", "C"]

# Équilibre des pistes musicales (linéaire) et correction de niveau par type
# d'effet sonore (dB) : réglés au spectrogramme pour que les effets restent
# lisibles au-dessus de la musique sans la noyer.
MIX = {"drums": 0.36, "bass": 0.55, "pads": 0.75, "arps": 1.25, "lead": 0.8}
SFX_TRIM_DB = {
    "tick": 16, "count": 12, "check": 11, "whoosh": 9, "step": 9, "receive": 9.5, "send": 7,
    "deal": 7.5, "zap": 6, "feature": 6.5, "shutter": 5.5, "swipe": 3, "squeegee": 12,
    "lock": 6.5, "pop": 6, "buzz": 8, "tap": 5, "open": 4, "ping": 6, "riser": 2, "whip": 3,
    "snap": 2, "sms": 4, "notif": 2,
}
MUSIC_GAIN = 1.0
SFX_GAIN = 1.0
DUCK_DB = 3.0
TARGET_RMS_DB = -14.5


def chord_at(bar):
    return PROG[(bar - 3) % 4]


def build_music():
    drums = np.zeros((N, 2))
    bass = np.zeros((N, 2))
    pads = np.zeros((N, 2))
    arps = np.zeros((N, 2))
    lead = np.zeros((N, 2))
    kicks = []

    K = kick()
    CL = clap()
    HC = hat(False)
    HO = hat(True)

    # --- Intro (0 → 5,75 s) : bourdon tendu + tic-tac d'horloge.
    t = tt(5.75)
    drone = saw(hz("D1"), t) + saw(hz("D2"), t, 7) * 0.6 + saw(hz("A1"), t, -5) * 0.35
    drone = sweep(drone, "lp", lambda s: 140 + 900 * (s / 5.75) ** 2, q=1.3)
    drone *= (0.75 + 0.25 * np.sin(2 * np.pi * 8 * t)) * np.minimum(1, t / 0.4)
    place(pads, fade(pan2(drone * 0.35), 0.01, 0.01), 0.0)
    for i in range(int(5.75 / 0.25)):
        tk = s_tick(2600 if i % 2 == 0 else 2100)
        place(drums, tk, i * 0.25, 0.28 + 0.08 * (i / 23), pan=-0.3 if i % 2 == 0 else 0.3)
    for tb in (0.0, 1.0, 2.0, 3.0, 4.0, 4.5, 5.0, 5.25, 5.5):
        place(drums, kick(0.6, 0.35), tb, 0.35)

    # --- Événements rythmiques par mesure.
    def groove(bar, full=True, half=False, hats=True, clap_on=True, kick_on=True):
        t0 = bar * BAR
        for b in range(4):
            tb = t0 + b * BEAT
            if kick_on and (not half or b in (0, 2)):
                if not (half and b == 2):
                    place(drums, K, tb, 0.95)
                    kicks.append(tb)
            if clap_on and ((b in (1, 3) and not half) or (half and b == 2)):
                place(drums, CL, tb, 0.85, pan=0.05)
            if hats:
                for s16 in range(4):
                    th = tb + s16 * BEAT / 4
                    if s16 == 2 and full:
                        place(drums, HO, th, 0.34, pan=0.25)
                    elif full or s16 == 2:
                        acc = 0.3 if s16 == 0 else 0.19
                        place(drums, HC, th + (0.012 if s16 % 2 else 0), acc, pan=-0.2 + 0.1 * s16)

    def harmony(bar, pad_gain=0.5, bass_on=True, arp_gain=0.0, cutoff=2200, arp_bright=1.0, chord=None):
        name = chord or chord_at(bar)
        voicing, root, arp = CHORDS[name]
        t0 = bar * BAR
        place(pads, supersaw([hz(n) for n in voicing], BAR, cutoff=cutoff), t0, pad_gain)
        if bass_on:
            for e in range(8):
                if e % 2 == 1:
                    f = hz(root) * (2 if e == 7 else 1)
                    place(bass, bass_note(f, 0.22), t0 + e * BEAT / 2, 0.55)
        if arp_gain:
            pattern = [0, 2, 1, 3, 2, 0, 3, 1, 0, 2, 1, 3, 2, 3, 1, 2]
            for s16, idx in enumerate(pattern * 2):
                f = hz(arp[idx])
                v = arp_gain * (1.0 if s16 % 4 == 0 else 0.65)
                place(arps, pluck(f, 0.35, bright=arp_bright), t0 + s16 * BEAT / 4, v, pan=0.35 * np.sin(s16 * 0.9))

    # Révélation (6 → 12 s) : nappes, demi-tempo à partir de 8 s.
    for bar in (3, 4, 5):
        harmony(bar, pad_gain=0.55, bass_on=bar >= 4, arp_gain=0.12 if bar >= 4 else 0, cutoff=1600)
    for bar in (4, 5):
        groove(bar, full=False, half=True)
    # Communication (12 → 26 s) : groove complet.
    for bar in range(6, 13):
        groove(bar)
        harmony(bar, pad_gain=0.4, arp_gain=0.16, cutoff=4200, arp_bright=1.8)
    # Rôles (26 → 34 s) : + mélodie de cloches.
    melody = [
        (0, "A5"), (0.5, "F5"), (1.0, "D5"), (1.5, "F5"), (1.75, "A5"),
        (2.0, "Bb5"), (2.5, "A5"), (3.0, "F5"), (3.5, "D5"),
        (4.0, "C6"), (4.5, "A5"), (5.0, "F5"), (5.5, "A5"), (5.75, "C6"),
        (6.0, "E5"), (6.5, "G5"), (7.0, "C6"), (7.5, "G5"),
    ]
    for bar in range(13, 17):
        groove(bar)
        harmony(bar, pad_gain=0.4, arp_gain=0.12, cutoff=4200, arp_bright=1.8)
    for off, note in melody:
        place(lead, bell(hz(note), 1.2, 1.6, 3.5, 3.0), 26.0 + off, 0.22, pan=0.2)
    # Terrain & bureau (34 → 44 s).
    for bar in range(17, 22):
        if bar == 20 or bar == 21:
            # 40 → 44 s : on épure (kick seul) pour laisser monter la tension.
            groove(bar, full=False, clap_on=bar == 20, hats=bar == 20)
            harmony(bar, pad_gain=0.35, arp_gain=0.1, cutoff=1500 if bar == 21 else 2000)
        else:
            groove(bar)
            harmony(bar, pad_gain=0.4, arp_gain=0.16, cutoff=4200, arp_bright=1.8)
    # Commercial (44 → 52 s) : second drop, plus brillant.
    for bar in range(22, 26):
        groove(bar)
        harmony(bar, pad_gain=0.45, arp_gain=0.19, cutoff=5500, arp_bright=2.4)
    # Pause finale (52 → 56 s) : piano électrique, pas de batterie.
    for bar in (26, 27):
        harmony(bar, pad_gain=0.42, bass_on=False, cutoff=1400, chord="Dm" if bar == 26 else "Bb")
        voicing = CHORDS["Dm" if bar == 26 else "Bb"][0]
        for k in range(4):
            for n_ in voicing[1:]:
                place(arps, pluck(hz(n_) * 2, 1.2, bright=0.7, decay=2.5), bar * BAR + k * BEAT, 0.07 + (0.03 if k == 0 else 0))
    # Roulement de caisse claire (55 → 56 s), en accélérant.
    SN = snare()
    tr = 55.0
    step = 0.125
    while tr < 55.98:
        place(drums, SN, tr, 0.12 + 0.35 * (tr - 55.0))
        tr += step
        step = max(0.03125, step * 0.86)
    # Résolution (56 → 60 s) : Ré majeur, grand accord qui s'éteint.
    t_end = 56.0
    big = supersaw([hz(n) for n in ["D2", "A2", "D3", "F#3", "A3", "D4", "F#4"]], 3.2, cutoff=3000, attack=0.02, release=1.2)
    place(pads, big, t_end, 0.75)
    for k, n_ in enumerate(["D5", "F#5", "A5", "D6"]):
        place(lead, bell(hz(n_), 3.0, 1.4, 2.0, 1.2), t_end + k * 0.12, 0.2, pan=-0.3 + 0.2 * k)
    place(bass, np.tanh(np.sin(2 * np.pi * hz("D1") * tt(3.5)) * np.exp(-tt(3.5) * 1.1) * 1.5), t_end, 0.8)

    # Sidechain : tout ce qui est tonal se creuse sous chaque kick.
    duck = np.ones(N)
    for kt in kicks:
        i = int(kt * SR)
        n = int(0.32 * SR)
        seg = 1 - 0.62 * np.exp(-np.arange(n) / SR * 11)
        duck[i : i + n] = np.minimum(duck[i : i + n], seg[: len(duck[i : i + n])])
    for b in (bass, pads, arps):
        b *= duck[:, None]

    # Silence juste avant l'impact de 6 s ("respiration").
    gate = np.ones(N)
    gate[int(5.75 * SR) : int(6.0 * SR)] = 0
    for b in (drums, bass, pads, arps, lead):
        b *= gate[:, None]

    # Délai ping-pong (croche pointée) sur les arpèges et la mélodie.
    def pingpong(x, d=0.375, fb=0.38, n=5):
        y = np.zeros_like(x)
        dd = int(d * SR)
        for k in range(1, n + 1):
            sh = np.zeros_like(x)
            sh[dd * k :] = x[: -dd * k] if dd * k < len(x) else 0
            side = 0 if k % 2 else 1
            y[:, side] += sh[:, side] * fb**k + sh[:, 1 - side] * fb**k * 0.3
        return filt(y, "lp", 5000)

    arps += pingpong(arps)
    lead += pingpong(lead, 0.375, 0.3, 4)

    stems = {"drums": drums, "bass": bass, "pads": pads, "arps": arps, "lead": lead}
    music = sum(stems[k] * MIX[k] for k in stems)
    send = pads * 0.4 + arps * 0.6 + lead * 0.8 + drums * 0.08
    return music, send, stems


# --------------------------------------------------------------- design sonore
def build_sfx(cues):
    sfx = np.zeros((N, 2))
    send = np.zeros((N, 2))
    counters = {"feature": 0, "word": 0}
    for c in cues:
        typ = c["type"]
        t = c["t"]
        g = c.get("gain", 1.0)
        pan = c.get("pan", 0.0)
        rev = 0.3
        if typ == "ping":
            x, lvl = s_ping(), 0.35
        elif typ == "buzz":
            x, lvl = s_buzz(), 0.35
        elif typ == "sms":
            x, lvl = s_sms(), 0.3
        elif typ == "pop":
            x, lvl = s_pop(380 + rng.uniform(-40, 40), 1100 + rng.uniform(-100, 100)), 0.4
        elif typ == "hit":
            x, lvl, rev = s_hit(c.get("big", False)), 0.55, 0.45
        elif typ == "squeegee":
            x, lvl = s_squeegee(c.get("dur", 0.9)), 0.8
        elif typ == "riser":
            x, lvl, rev = s_riser(c.get("dur", 1.5), c.get("soft", False)), 0.5, 0.2
        elif typ == "drop":
            x, lvl, rev = s_drop(), 0.5, 0.6
        elif typ == "impact":
            x, lvl, rev = s_impact(c.get("final", False)), 0.95, 0.5
        elif typ == "whoosh":
            if c.get("short"):
                x = s_whoosh(0.28, 700, 5000)
            else:
                x = s_whoosh(0.55, low=c.get("low", False))
            lvl = 0.42
        elif typ == "tick":
            x, lvl = s_tick(), 0.35
        elif typ == "tap":
            x, lvl = s_tap(), 0.6
        elif typ == "open":
            x, lvl = s_open(), 0.55
        elif typ == "feature":
            x, lvl, rev = s_feature(counters["feature"]), 0.4, 0.45
            counters["feature"] += 1
        elif typ == "send":
            x, lvl = s_send(), 0.45
        elif typ == "receive":
            x, lvl = s_receive(), 0.45
        elif typ == "check":
            x, lvl = s_check(), 0.5
        elif typ == "swipe":
            x, lvl = s_whoosh(0.3, 900, 5500, pan_from=0.5, pan_to=-0.5), 0.3
        elif typ == "snap":
            x, lvl = s_snap(), 0.6
        elif typ == "notif":
            x, lvl, rev = s_chime(), 0.42, 0.4
        elif typ == "deal":
            x, lvl = s_deal(), 0.4
        elif typ == "lock":
            x, lvl = s_lock(), 0.55
        elif typ == "whip":
            x, lvl = s_whoosh(0.6, 200, 6500, gain=1.2, pan_from=0.8, pan_to=-0.8), 0.75
        elif typ == "zap":
            x, lvl, rev = s_zap(), 0.45, 0.45
        elif typ == "shutter":
            x, lvl = s_shutter(), 0.75
        elif typ == "step":
            x, lvl, rev = s_step(c.get("n", 0)), 0.38, 0.45
        elif typ == "count":
            x, lvl = s_count(c.get("dur", 1.0)), 0.5
        elif typ == "stamp":
            x, lvl, rev = s_stamp(), 0.8, 0.3
        elif typ == "word":
            x, lvl, rev = s_word(counters["word"]), 0.45, 0.6
            counters["word"] += 1
        else:
            print("repère ignoré :", typ)
            continue
        if x.ndim == 1:
            x = pan2(x, pan)
        lvl *= 10 ** (SFX_TRIM_DB.get(typ, 0.0) / 20)
        place(sfx, x, t, lvl * g)
        place(send, x, t, lvl * g * rev)
    return sfx, send


# ----------------------------------------------------------------- mastering
def limiter(x, ceiling=0.89, look=0.004, release=0.12):
    peak = np.max(np.abs(x), axis=1)
    peak = maximum_filter1d(peak, size=int(look * SR) * 2 + 1)
    gain = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    # Relâchement exponentiel (le gain ne remonte que lentement).
    a = np.exp(-1 / (release * SR))
    g = signal.lfilter([1 - a], [1, -a], gain)
    g = np.minimum(g, gain)
    g = maximum_filter1d(-g, size=int(look * SR))  # anticipation
    g = -g
    return x * g[:, None]


def main():
    cues = json.loads((OUT / "cues.json").read_text())
    music, msend, _ = build_music()
    # Inclinaison du bus musique : un peu moins de grave, plus de brillance.
    music = shelf(shelf(music, "low", 90, -2.5), "high", 2500, 4.0)
    sfx, ssend = build_sfx(cues)
    # La musique s'efface légèrement sous les effets (jusqu'à -DUCK_DB).
    env = maximum_filter1d(np.abs(sfx).max(axis=1), size=int(0.01 * SR))
    a_att, a_rel = np.exp(-1 / (0.005 * SR)), np.exp(-1 / (0.18 * SR))
    env = signal.lfilter([1 - a_rel], [1, -a_rel], env)
    duck = 10 ** (-DUCK_DB / 20 * np.clip(env / 0.2, 0, 1))
    music = music * duck[:, None]
    msend = msend * duck[:, None]
    ir = reverb_ir()
    wet = convolve(msend + ssend, ir, wet=0.22)
    mix = music * MUSIC_GAIN + sfx * SFX_GAIN + wet
    mix = filt(mix, "hp", 28)
    # Mise à niveau (RMS cible), colle légère par saturation douce, puis limiteur.
    mix *= 10 ** ((TARGET_RMS_DB - 20 * np.log10(np.sqrt(np.mean(mix**2)))) / 20)
    mix = np.tanh(mix * 1.15) / 1.15
    mix = limiter(mix)
    rms = np.sqrt(np.mean(mix**2))
    peak = np.max(np.abs(mix))
    print(f"RMS {20 * np.log10(rms):.1f} dBFS, crête {20 * np.log10(peak):.1f} dBFS")
    # Fondu de sortie sur la dernière demi-seconde (accompagne le fondu au noir).
    n = int(0.6 * SR)
    mix[-n:] *= np.linspace(1, 0, n)[:, None] ** 1.5
    pcm = np.clip(mix, -1, 1)
    pcm24 = (pcm * (2**23 - 1)).astype(np.int32)
    raw = np.zeros((len(pcm24), 2, 3), dtype=np.uint8)
    for k in range(3):
        raw[:, :, k] = (pcm24 >> (8 * k)) & 0xFF
    with wave.open(str(OUT / "soundtrack.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw.tobytes())
    print("→", OUT / "soundtrack.wav")


if __name__ == "__main__":
    main()
