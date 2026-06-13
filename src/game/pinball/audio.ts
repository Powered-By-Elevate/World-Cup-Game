/* ============================================================
   WORLD CUP PINBALL — audio. All sounds are synthesised with the Web Audio
   API (no asset files), so it works offline and stays tiny. Punchy blips for
   table hits, noise swells for crowd cheers, chords for goals/missions.
   Swap in sampled assets later by replacing play() cases.
   ============================================================ */
export type Sfx =
  | 'flip' | 'bumper' | 'sling' | 'target' | 'rollover' | 'ramp' | 'plunger'
  | 'goal' | 'cheer' | 'missionStart' | 'missionDone' | 'multiball'
  | 'extra' | 'drain' | 'gameover' | 'ui' | 'save';

export interface PinAudio {
  play(name: Sfx): void;
  setMuted(m: boolean): void;
  resume(): void;
  close(): void;
}

export function createAudio(): PinAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;

  const ensure = () => {
    if (ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  };

  const tone = (freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) => {
    if (!ctx || !master || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  const noise = (dur: number, gain: number, hp: number, lp: number) => {
    if (!ctx || !master || muted) return;
    const t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  };

  const chord = (freqs: number[], dur: number, type: OscillatorType, gain: number) => {
    for (const f of freqs) tone(f, dur, type, gain);
  };

  const play = (name: Sfx) => {
    ensure();
    if (!ctx || muted) return;
    switch (name) {
      case 'flip': tone(180, 0.06, 'square', 0.18, 120); break;
      case 'bumper': tone(420, 0.10, 'square', 0.22, 240); noise(0.05, 0.12, 800, 6000); break;
      case 'sling': tone(620, 0.07, 'sawtooth', 0.18, 320); break;
      case 'target': tone(880, 0.08, 'triangle', 0.2, 1200); break;
      case 'rollover': tone(1320, 0.06, 'sine', 0.18, 1760); break;
      case 'ramp': tone(300, 0.18, 'sawtooth', 0.18, 900); break;
      case 'plunger': tone(120, 0.22, 'sawtooth', 0.22, 360); break;
      case 'goal': chord([523, 659, 784, 1047], 0.5, 'sawtooth', 0.16); noise(0.6, 0.18, 500, 5000); break;
      case 'cheer': noise(0.9, 0.22, 400, 4500); break;
      case 'missionStart': chord([392, 523, 659], 0.35, 'triangle', 0.16); break;
      case 'missionDone': chord([523, 659, 784, 1047, 1319], 0.7, 'square', 0.14); noise(0.7, 0.16, 500, 6000); break;
      case 'multiball': chord([262, 330, 392, 523], 0.8, 'sawtooth', 0.16); noise(1.0, 0.2, 300, 5000); break;
      case 'extra': chord([659, 988, 1319], 0.5, 'triangle', 0.18); break;
      case 'save': tone(740, 0.2, 'sine', 0.2, 1480); break;
      case 'drain': tone(300, 0.4, 'sine', 0.2, 70); break;
      case 'gameover': chord([392, 311, 262, 196], 1.0, 'sawtooth', 0.16); break;
      case 'ui': tone(660, 0.05, 'square', 0.14, 880); break;
    }
  };

  return {
    play,
    setMuted: (m) => { muted = m; },
    resume: () => { ensure(); if (ctx && ctx.state === 'suspended') void ctx.resume(); },
    close: () => { if (ctx) { void ctx.close(); ctx = null; master = null; } },
  };
}
