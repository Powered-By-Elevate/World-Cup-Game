/* ============================================================
   FX — synthesized sound + haptics. Every sound is generated live with Web
   Audio (oscillators + filtered noise) — there are NO audio files. Per-device
   on/off, remembered in localStorage. Haptics via navigator.vibrate.
   ============================================================ */

let ctx: AudioContext | null = null;
let on = (() => { try { return localStorage.getItem('wc:fx') !== '0'; } catch { return true; } })();

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function vibe(ms: number | number[]): void {
  try { if (on && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms); } catch { /* ignore */ }
}

/** A single enveloped tone, optionally gliding to another frequency. */
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number, delay = 0): void {
  const c = ac(); if (!c || !on) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/** A short filtered-noise burst (whistle / thud texture). */
function noise(dur: number, gain = 0.2, hp = 800, delay = 0): void {
  const c = ac(); if (!c || !on) return;
  const t0 = c.currentTime + delay;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t0); src.stop(t0 + dur);
}

export const fx = {
  enabled(): boolean { return on; },
  setEnabled(v: boolean): void {
    on = v;
    try { localStorage.setItem('wc:fx', v ? '1' : '0'); } catch { /* ignore */ }
    if (v) { ac(); tone(660, 0.07, 'triangle', 0.14); vibe(8); }   // confirmation blip
  },
  unlock(): void { ac(); },                                        // call on first gesture

  tick(): void { tone(420, 0.05, 'triangle', 0.1); vibe(4); },
  select(): void { tone(680, 0.06, 'triangle', 0.12); vibe(6); },
  kick(): void { tone(150, 0.12, 'sine', 0.22, 70); noise(0.05, 0.12, 500); vibe(10); },
  goal(): void {
    noise(0.16, 0.16, 1700);                                       // ref whistle
    tone(523, 0.12, 'sine', 0.17, undefined, 0.03);
    tone(659, 0.14, 'sine', 0.17, undefined, 0.13);
    tone(784, 0.22, 'sine', 0.2, undefined, 0.25);                 // rising cheer
    vibe([15, 30, 70]);
  },
  save(): void { tone(190, 0.2, 'sawtooth', 0.2, 90); noise(0.12, 0.18, 320); vibe([10, 45]); },
  /* incoming chat — ref's whistle: short blast, then a longer rising one */
  whistle(): void {
    tone(2350, 0.09, 'square', 0.05); noise(0.09, 0.1, 2100);
    tone(2350, 0.18, 'square', 0.06, 2550, 0.15); noise(0.18, 0.12, 2100, 0.15);
    vibe([10, 50, 18]);
  },
  /* incoming challenge / match alert — stadium air horn (stacked saws, slow bend) */
  horn(): void {
    tone(233, 0.5, 'sawtooth', 0.15, 218);
    tone(466, 0.5, 'sawtooth', 0.09, 436);
    tone(699, 0.45, 'sawtooth', 0.045, 654);
    vibe([20, 30, 60]);
  },
  riser(): void { tone(220, 0.55, 'sawtooth', 0.1, 680); vibe(12); },   // draft drumroll-ish riser
  reveal(): void {
    tone(523, 0.1, 'sine', 0.18);
    tone(784, 0.12, 'sine', 0.18, undefined, 0.08);
    tone(1047, 0.24, 'sine', 0.2, undefined, 0.18);
    vibe([12, 18, 45]);
  },
  win(): void { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, 'sine', 0.18, undefined, i * 0.1)); vibe([20, 40, 20, 70]); },
};
