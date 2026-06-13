/* ============================================================
   WORLD CUP PINBALL — engine / orchestrator.

   Owns the whole game: the rAF loop, physics integration, scoring, the
   Space-Cadet-style RANK ladder (reskinned Debut → G.O.A.T.) and MISSION loop
   (select a mission at the TACTICS targets, start it at the HYPERSPACE hole,
   complete it for a bonus + rank-up), multiball via the LOCK hole, the left
   KICKBACK saver, spinner, ball-save, extra balls, particles and the HUD
   snapshot pushed to React. It also draws each frame (canvas owned here; React
   stays thin — it only sizes the canvas, shows overlays, and routes input).
   ============================================================ */
import type { Ball, Snapshot, Popup, Confetti, Spark, Mission } from './types';
import { stepBall, updateFlippers, type HitFn } from './physics';
import { drawTable, type Scene, type Aim } from './render';
import {
  TW, TH, SPAWN, DRAIN_Y,
  buildSegments, buildBumpers, buildTargets, buildGoal, buildHoles, buildSpinner, buildKickback, buildFlippers,
} from './table';

const HIGH_KEY = 'wc:pinball:high';
const GOLD = '#FFC400', RED = '#E1342B', LIME = '#C8F23C', CYAN = '#39E0FF';

const RANKS = ['Debut', 'Group Stage', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final', 'Champion', 'Legend', 'G.O.A.T.'];

const MISSIONS: Mission[] = [
  { id: 'counter', name: 'Counter-Attack', hint: 'Smash the 3 bumpers', aim: 'bumpers', need: 4, bonus: 4000 },
  { id: 'tiki', name: 'Tiki-Taka', hint: 'Sweep the top lanes', aim: 'lanes', need: 3, bonus: 4500 },
  { id: 'wing', name: 'Wing Play', hint: 'Rip the corner-flag spinner', aim: 'spinner', need: 6, bonus: 3500 },
  { id: 'freekick', name: 'Free-Kick Special', hint: 'Score 2 GOALS — earns an EXTRA BALL', aim: 'goal', need: 2, bonus: 6000 },
  { id: 'hattrick', name: 'Hat-Trick Hero', hint: 'Score 3 GOALS', aim: 'goal', need: 3, bonus: 9000 },
];

export interface PinballOpts {
  onState: (s: Snapshot) => void;
  onGameEnd: (score: number) => void;
  muted?: boolean;
  play: (name: import('./audio').Sfx) => void;
}

export interface PinballControls {
  pressFlipper(side: 'L' | 'R', down: boolean): void;
  plunger(down: boolean): void;
  start(): void;
  togglePause(): void;
  paused(): boolean;
  destroy(): void;
}

export function createPinball(canvas: HTMLCanvasElement, opts: PinballOpts): PinballControls {
  const ctx = canvas.getContext('2d')!;
  const play = opts.play;

  // ---- table (rebuilt on each new game) ----
  let segs = buildSegments();
  let bumpers = buildBumpers();
  let targets = buildTargets();
  let goal = buildGoal();
  let holes = buildHoles();
  let spinner = buildSpinner();
  let kickback = buildKickback();
  const flips = buildFlippers();

  // ---- game state ----
  let status: Snapshot['status'] = 'attract';
  let paused = false;
  let score = 0;
  let high = Number(localStorage.getItem(HIGH_KEY) || 0) || 0;
  let ballNum = 1, ballsTotal = 3;
  let multiplier = 1;
  let rankIndex = 0;
  let inMultiball = false;
  let locks = 0;

  // mission loop
  let selected = 0;           // mission cued at the TACTICS targets
  let missionActive = false;
  let missionDone = 0;

  // serving / plunger
  let serving = false;
  let charging = false;
  let charge = 0;

  // timers
  let ballSave = 0;
  let goalCooldown = 0;
  let flashGoal = 0;
  let spinCooldown = 0;
  let msg = ''; let msgTimer = 0;

  // particles
  const popups: Popup[] = [];
  const confetti: Confetti[] = [];
  const sparks: Spark[] = [];

  // captured balls (in a hole, waiting to eject)
  const captured: { x: number; y: number; timer: number; mission: boolean }[] = [];

  // entities
  let balls: Ball[] = [];
  const parked: Ball = { p: { x: SPAWN.x, y: SPAWN.y }, v: { x: 0, y: 0 }, r: 9 };

  /* ---------------- helpers ---------------- */
  const mkBall = (x: number, y: number, vx = 0, vy = 0): Ball => ({ p: { x, y }, v: { x: vx, y: vy }, r: 9 });
  const addScore = (n: number) => { score += Math.round(n); if (score > high) { high = score; localStorage.setItem(HIGH_KEY, String(high)); } };
  const message = (t: string, secs = 1.7) => { msg = t; msgTimer = secs; };
  const popup = (x: number, y: number, text: string, color = '#fff') => { popups.push({ p: { x, y }, text, color, ttl: 0.9, life: 0.9 }); };
  const sparkBurst = (x: number, y: number, color: string, n = 8) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140; sparks.push({ p: { x, y }, v: { x: Math.cos(a) * s, y: Math.sin(a) * s }, life: 0.4, ttl: 0.4, color }); }
  };
  const confettiBurst = (x: number, y: number, n = 40) => {
    const cols = [LIME, GOLD, '#fff', RED, CYAN];
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 120 + Math.random() * 260; confetti.push({ p: { x, y }, v: { x: Math.cos(a) * s, y: Math.sin(a) * s }, life: 1.4, color: cols[i % cols.length], rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10 }); }
  };

  const curMission = () => MISSIONS[selected % MISSIONS.length];
  const aim = (): Aim => (missionActive ? curMission().aim : null);

  /* ---------------- serving / launching ---------------- */
  function serveBall() {
    balls = [mkBall(SPAWN.x, SPAWN.y)];
    serving = true; charging = false; charge = 0;
  }
  function launch() {
    if (!serving || !balls.length) return;
    const power = Math.max(0.28, charge);
    balls[0].v = { x: (Math.random() - 0.5) * 30, y: -(640 + power * 1040) };
    serving = false; charging = false; charge = 0;
    ballSave = 5; play('plunger');
  }

  /* ---------------- scoring events from physics ---------------- */
  const onHit: HitFn = (type, d) => {
    if (type === 'bumper') {
      const b = bumpers.find(x => x.id === d.id); if (b) b.lit = 0.28;
      addScore((d.score || 250) * multiplier); popup(d.x, d.y - 14, `+${(d.score || 250) * multiplier}`, '#fff');
      sparkBurst(d.x, d.y, b?.color || '#fff', 7); play('bumper');
      if (missionActive && curMission().aim === 'bumpers') progressMission(d.x, d.y);
    } else if (type === 'sling') {
      addScore((d.score || 110) * multiplier); sparkBurst(d.x, d.y, LIME, 5); play('sling');
    }
    // 'flip' handled via key feedback; 'wall' silent
  };

  /* ---------------- missions / ranks ---------------- */
  function progressMission(x: number, y: number) {
    missionDone++;
    play('target');
    popup(x, y - 16, `${missionDone}/${curMission().need}`, GOLD);
    if (missionDone >= curMission().need) completeMission();
  }
  function completeMission() {
    const m = curMission();
    addScore(m.bonus * multiplier);
    message(`${m.name.toUpperCase()} COMPLETE  +${m.bonus * multiplier}`, 2.2);
    confettiBurst(TW / 2, 200, 50); play('missionDone');
    if (m.id === 'freekick') awardExtraBall();
    rankUp();
    missionActive = false; missionDone = 0;
    selected = (selected + 1) % MISSIONS.length;
    kickback.armed = true;     // re-arm the saver on a completed mission
  }
  function rankUp() {
    if (rankIndex < RANKS.length - 1) { rankIndex++; message(`RANK UP — ${RANKS[rankIndex].toUpperCase()}`, 2); play('extra'); }
    addScore(1500 * (rankIndex + 1));
  }
  function awardExtraBall() { ballsTotal++; message('⚽ EXTRA BALL', 2); play('extra'); confettiBurst(TW / 2, 320, 30); }

  /* ---------------- sensors (holes, goal, spinner, lanes, kickback, drain) ---------------- */
  function sensors(dt: number) {
    // spinner
    if (spinCooldown > 0) spinCooldown -= dt;
    for (const b of balls) {
      const sx = (spinner.a.x + spinner.b.x) / 2, sy = (spinner.a.y + spinner.b.y) / 2;
      if (Math.hypot(b.p.x - sx, b.p.y - sy) < 16 && Math.abs(b.v.y) > 50 && spinCooldown <= 0) {
        spinner.spin += 1; spinCooldown = 0.12;
        addScore(spinner.value * multiplier);
        if (missionActive && curMission().aim === 'spinner') progressMission(sx, sy);
        play('rollover');
      }
    }

    // goal
    if (goalCooldown > 0) goalCooldown -= dt;
    for (const b of balls) {
      if (goalCooldown <= 0 && b.p.x > goal.p.x && b.p.x < goal.p.x + goal.w && b.p.y > goal.p.y - 4 && b.p.y < goal.p.y + goal.h + 6) {
        scoreGoal(b);
      }
    }

    // rollover lanes + tactics targets
    for (const tg of targets) {
      if (tg.lit > 0) continue;
      for (const b of balls) {
        if (Math.hypot(b.p.x - tg.p.x, b.p.y - tg.p.y) < b.r + tg.r) {
          tg.lit = 0.5;
          if (tg.group === 'mult') {
            if (!tg.on) { tg.on = true; addScore(tg.score * multiplier); popup(tg.p.x, tg.p.y - 12, `+${tg.score * multiplier}`, LIME); play('rollover'); }
            if (missionActive && curMission().aim === 'lanes') progressMission(tg.p.x, tg.p.y);
            if (targets.filter(t => t.group === 'mult').every(t => t.on)) {
              multiplier = Math.min(6, multiplier + 1); message(`MULTIPLIER ×${multiplier}`, 1.6); play('missionStart');
              targets.forEach(t => { if (t.group === 'mult') t.on = false; });
            }
          } else { // tactics — cue the next mission
            addScore(tg.score * multiplier); play('target');
            if (!missionActive) { selected = (selected + 1) % MISSIONS.length; message(`MISSION CUED — ${curMission().name}`, 1.4); holes.find(h => h.kind === 'hyper')!.lit = 1; }
          }
          break;
        }
      }
    }

    // holes (capture)
    for (const h of holes) {
      if (h.lit > 0.0001) h.lit = Math.max(0, h.lit - dt * 0.5);
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (Math.hypot(b.p.x - h.p.x, b.p.y - h.p.y) < h.r * 0.85) {
          balls.splice(i, 1);
          if (h.kind === 'hyper') {
            if (!missionActive) { missionActive = true; missionDone = 0; message(`MISSION — ${curMission().name.toUpperCase()}`, 2.2); play('missionStart'); }
            else { addScore(2500 * multiplier); message('HYPERSPACE +' + 2500 * multiplier, 1.4); }
            captured.push({ x: h.p.x, y: h.p.y, timer: 0.7, mission: false });
            play('save');
          } else { // lock
            sparkBurst(h.p.x, h.p.y, GOLD, 10); play('save');
            if (inMultiball) {
              // during multiball the lock pays a jackpot and ejects, never locks
              addScore(5000 * multiplier); message('LOCK JACKPOT +' + 5000 * multiplier, 1.4);
              captured.push({ x: h.p.x, y: h.p.y, timer: 0.6, mission: false });
            } else {
              locks++;
              if (locks >= 2) startMultiball();
              else { message(`⚽ BALL LOCKED ${locks}/2`, 1.8); serveBall(); }
            }
          }
        }
      }
    }

    // kickback (left outlane saver)
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (Math.hypot(b.p.x - kickback.p.x, b.p.y - kickback.p.y) < kickback.r && b.v.y > 0) {
        if (kickback.armed) { b.v = { x: 30, y: -1180 }; kickback.armed = false; message('KICKBACK!', 1.3); play('save'); sparkBurst(kickback.p.x, kickback.p.y, LIME, 10); }
      }
    }

    // drain
    for (let i = balls.length - 1; i >= 0; i--) {
      if (balls[i].p.y > DRAIN_Y) { balls.splice(i, 1); onDrain(); }
    }
  }

  function scoreGoal(b: Ball) {
    goalCooldown = 0.7; goal.lit = 0.8; flashGoal = 0.8;
    const base = inMultiball ? 5000 : 1200;
    addScore(base * multiplier);
    popup(TW / 2, goal.p.y + 40, inMultiball ? `JACKPOT +${base * multiplier}` : `GOAL +${base * multiplier}`, GOLD);
    message(inMultiball ? 'JACKPOT!' : 'GOAL!', 1.4);
    confettiBurst(TW / 2, 70, 46); play('goal'); play('cheer');
    // kick out of the net downward
    b.p.x = TW / 2 + (Math.random() * 36 - 18); b.p.y = goal.p.y + goal.h + b.r + 4;
    b.v = { x: (Math.random() * 120 - 60), y: 440 };
    if (missionActive && curMission().aim === 'goal') progressMission(TW / 2, goal.p.y + 30);
  }

  function startMultiball() {
    locks = 0; inMultiball = true; serving = false;
    balls = [mkBall(252, 270, 120, 200), mkBall(108, 270, -120, 200), mkBall(180, 300, 0, -200)];
    message('🏆 TROPHY-LIFT MULTIBALL!', 2.6); confettiBurst(TW / 2, 240, 70); play('multiball');
    ballSave = 6;
  }

  function onDrain() {
    play('drain');
    if (balls.length > 0) {
      if (inMultiball && balls.length === 1) { inMultiball = false; message('Multiball over', 1.4); }
      return;
    }
    // last active ball lost
    if (ballSave > 0) { ballSave = 0; message('BALL SAVED — SHOOT AGAIN', 1.8); play('save'); serveBall(); return; }
    if (ballNum < ballsTotal) { ballNum++; resetForNewBall(); serveBall(); message(`BALL ${ballNum}`, 1.4); }
    else gameOver();
  }

  function resetForNewBall() {
    multiplier = 1; missionActive = false; missionDone = 0;
    targets.forEach(t => { if (t.group === 'mult') t.on = false; });
    kickback.armed = true;
  }

  function gameOver() {
    status = 'over'; play('gameover');
    message('FULL TIME', 3);
    opts.onGameEnd(score);
  }

  /* ---------------- public: start / pause ---------------- */
  function start() {
    segs = buildSegments(); bumpers = buildBumpers(); targets = buildTargets();
    goal = buildGoal(); holes = buildHoles(); spinner = buildSpinner(); kickback = buildKickback();
    score = 0; ballNum = 1; ballsTotal = 3; multiplier = 1; rankIndex = 0;
    inMultiball = false; locks = 0; selected = 0; missionActive = false; missionDone = 0;
    ballSave = 0; goalCooldown = 0; flashGoal = 0; msg = ''; msgTimer = 0;
    popups.length = 0; confetti.length = 0; sparks.length = 0; captured.length = 0;
    status = 'playing'; paused = false;
    serveBall(); message('KICK OFF!', 1.6);
  }

  /* ---------------- update ---------------- */
  function update(dt: number) {
    // timers
    if (msgTimer > 0) msgTimer -= dt;
    if (flashGoal > 0) flashGoal -= dt;
    if (goal.lit > 0) goal.lit -= dt;
    if (spinner.spin > 0) spinner.spin = Math.max(0, spinner.spin - dt * 4);
    for (const b of bumpers) if (b.lit > 0) b.lit -= dt;
    for (const tg of targets) if (tg.lit > 0) tg.lit -= dt;
    if (ballSave > 0) ballSave -= dt;

    updateFlippers(flips, dt);

    if (status === 'playing' && !paused) {
      // captured balls waiting to eject
      for (let i = captured.length - 1; i >= 0; i--) {
        const c = captured[i]; c.timer -= dt;
        if (c.timer <= 0) { balls.push(mkBall(c.x, c.y + 16, (Math.random() * 80 - 40), 240)); captured.splice(i, 1); }
      }
      if (serving) {
        // park the serve ball on the plunger; charge while held
        if (balls[0]) { balls[0].p.x = SPAWN.x; balls[0].p.y = SPAWN.y - charge * 40; balls[0].v.x = 0; balls[0].v.y = 0; }
        if (charging) charge = Math.min(1, charge + dt * 1.5);
      } else {
        for (const b of balls) stepBall(b, dt, segs, bumpers, flips, onHit);
        sensors(dt);
      }
    }

    // particles
    for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.life -= dt; p.p.y -= 22 * dt; if (p.life <= 0) popups.splice(i, 1); }
    for (let i = confetti.length - 1; i >= 0; i--) { const c = confetti[i]; c.v.y += 540 * dt; c.p.x += c.v.x * dt; c.p.y += c.v.y * dt; c.rot += c.spin * dt; c.life -= dt * 0.7; if (c.life <= 0 || c.p.y > TH + 20) confetti.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.v.x *= 0.9; s.v.y *= 0.9; s.p.x += s.v.x * dt; s.p.y += s.v.y * dt; s.life -= dt; if (s.life <= 0) sparks.splice(i, 1); }
  }

  /* ---------------- draw ---------------- */
  let tms = 0;
  function render() {
    const cw = canvas.width, ch = canvas.height;
    // stadium surround
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#0a0f1c'); bg.addColorStop(1, '#05080f');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);

    const scale = Math.min(cw / TW, ch / TH);
    const ox = (cw - TW * scale) / 2, oy = (ch - TH * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    // clip to table
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, TW, TH); ctx.clip();

    const drawBalls = status === 'attract' ? [parked] : balls;
    const scene: Scene = {
      segs, bumpers, targets, goal, holes, spinner, kickback,
      flips, balls: drawBalls, popups, confetti, sparks,
      charge, aim: aim(), t: tms, flashGoal: Math.max(flashGoal, 0),
    };
    drawTable(ctx, scene);

    // big transient banner
    if (msgTimer > 0 && msg) {
      ctx.globalAlpha = Math.min(1, msgTimer * 1.6);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, TH * 0.4, TW, 56);
      ctx.fillStyle = GOLD; ctx.font = '800 22px Archivo, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(msg, TW / 2, TH * 0.4 + 36);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ---------------- snapshot push ---------------- */
  let lastSig = '';
  function pushState() {
    const snap: Snapshot = {
      status, score, high, ball: ballNum, balls: ballsTotal, multiplier,
      rank: RANKS[rankIndex], rankIndex, rankMax: RANKS.length - 1,
      mission: curMission().name, missionHint: curMission().hint, missionNeed: curMission().need, missionDone, missionActive,
      ballSave: ballSave > 0, kickback: kickback.armed, locks,
      charge, muted: !!opts.muted, inMultiball, message: msgTimer > 0 ? msg : '',
    };
    const sig = JSON.stringify(snap);
    if (sig !== lastSig) { lastSig = sig; opts.onState(snap); }
  }

  /* ---------------- loop ---------------- */
  let raf = 0; let last = 0; let alive = true;
  const frame = (now: number) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.034, (now - last) / 1000) : 1 / 60;
    last = now; tms = now;
    update(dt);
    render();
    pushState();
  };
  raf = requestAnimationFrame(frame);

  /* ---------------- controls ---------------- */
  return {
    pressFlipper(side, down) {
      const f = flips.find(x => x.side === side); if (!f) return;
      if (down && !f.pressed) play('flip');
      f.pressed = down;
    },
    plunger(down) {
      if (status !== 'playing') return;
      if (down) charging = true;
      else if (serving) launch();
    },
    start,
    togglePause() { if (status === 'playing') paused = !paused; },
    paused: () => paused,
    destroy() { alive = false; cancelAnimationFrame(raf); },
  };
}
