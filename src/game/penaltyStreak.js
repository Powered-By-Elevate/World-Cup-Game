/* ============================================================
   PENALTY STREAK — draw-your-shot controller (ported from the
   Claude Design hand-off `penalty/streak.js`).
   Reuses penaltyScene.js untouched contract:
     setAimNDC(x,y) -> clamps onto goal plane, calls onAim
     fireShot({tx,ty,keeperDir,keeperHigh,curl}) -> onResult once
       (no `saved` flag -> scene's geometric reach check decides)
   Mechanic: drag a line from the ball to a spot in the goal.
   The bow of the drawn line = the curl of the shot; flick fast for
   power. Keeper dives at random. Score as many in a row as you can.

   Refactored from the standalone prototype: queries are scoped to a
   mounted `root` element, the close buttons call `onClose`, the model
   URLs are served from /penalty/, and init() returns a teardown.
   ============================================================ */
import { createPenaltyScene } from './penaltyScene.js';
import { NATIONS, flagUrl } from './penaltyData.js';

const GOAL_W = 7.32, GOAL_H = 2.44;               // mirror of scene constants
const BEST_KEY = 'wc:pen:streak:best';
const MODELS = '/penalty/models';                 // served from public/

const kitOf = (id) => { const n = NATIONS[id]; return { shirt: n.shirt, shorts: n.shorts, socks: n.socks, trim: n.trim }; };
const flagEl = (id, cls = '') => `<span class="pen-flag ${cls}"><img src="${flagUrl(NATIONS[id].flag)}" alt="${NATIONS[id].name}" onerror="this.style.display='none'"></span>`;
const bestStreak = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } };
const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} };

const STARS = [
  { id: 'messi',   name: 'Messi',   no: 10, nid: 'ARG', kit: 'Argentina kit' },
  { id: 'ronaldo', name: 'Ronaldo', no: 7,  nid: 'POR', kit: 'Portugal kit' },
  { id: 'neymar',  name: 'Neymar',  no: 10, nid: 'BRA', kit: 'PSG kit · club' },
];
const starById = (id) => STARS.find(s => s.id === id) || STARS[0];

const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pathLength = (a) => { let L = 0; for (let i = 1; i < a.length; i++) L += Math.hypot(a[i].x - a[i - 1].x, a[i].y - a[i - 1].y); return L; };
const powerColor = (p) => p < .45 ? '#C8F23C' : p < .78 ? '#FFB000' : '#FF2D2D';
const speedToPower = (s) => Math.max(0, Math.min(1, (s - 0.25) / 1.75));   // px/ms -> 0..1

/**
 * Mount the Penalty Streak game inside `root`. `root` must contain the
 * #stage / #draw / #cards / #hud scaffold (provided by the React wrapper).
 * Returns a teardown function that disposes the 3D scene + listeners.
 */
export function initPenaltyStreak(root, { onClose, onScore, mode = 'streak', seconds = 30 } = {}) {
  // 'streak' = single-player sudden death (a save/miss ends the run).
  // 'timed'  = head-to-head leg: keep shooting for `seconds`, score as many as
  //            you can; a save/miss does NOT end it. Both report the goal count.
  const timed = mode === 'timed';
  const DURATION_MS = seconds * 1000;
  let timerInt = null;
  const $ = (s) => root.querySelector(s);
  const stage = $('#stage'), hud = $('#hud'), cards = $('#cards'), drawC = $('#draw');
  const ctx = drawC.getContext('2d');
  let scene, state;

  /* ---------------- SETUP ---------------- */
  function renderSetup() {
    state.phase = 'setup';
    drawC.classList.add('off');
    hud.innerHTML = '';
    if (!state.star) state.star = 'messi';
    state.nid = starById(state.star).nid;
    cards.innerHTML = `
      <div class="pen-card-wrap"><div class="pen-card">
        <div class="pen-row" style="justify-content:space-between">
          <span class="pen-eyebrow">${timed ? `${seconds}-second shootout` : 'Sudden death'}</span>
          <button class="pen-close" id="setup-close" style="border-color:rgba(21,18,12,.3);color:var(--ink);background:transparent">✕</button>
        </div>
        <div class="display" style="font-size:30px;margin:8px 0 2px">Penalty<br>Streak</div>
        <p style="font-size:13.5px;color:#5b564a;margin:6px 0 12px;line-height:1.45">
          <b>Draw a line</b> from the ball to a spot in the goal — bend the line to curl the shot,
          and <b>flick fast for power</b> (a placed shot is accurate; a thunderbolt scatters —
          and yes, <b>you can miss</b>). ${timed ? `<b>You have ${seconds} seconds</b> — score as many as you can; misses don't stop the clock.` : 'A save, the woodwork, or off target ends your run.'}</p>
        <div class="pst-how">
          <svg viewBox="0 0 120 64">
            <rect x="14" y="8" width="92" height="34" rx="2" fill="none" stroke="rgba(21,18,12,.45)" stroke-width="2.5"></rect>
            <circle cx="60" cy="56" r="5.5" fill="#15120C"></circle>
            <path d="M60 52 C 48 36, 78 32, 92 18" fill="none" stroke="#7fa01e" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 6"></path>
            <circle cx="92" cy="18" r="6" fill="none" stroke="#7fa01e" stroke-width="2.5"></circle>
          </svg>
          <div>Straight line = straight shot.<br>Bowed line = <b>banana</b>.</div>
        </div>
        <div class="pen-eyebrow" style="margin:14px 0 6px">Take as</div>
        <div class="pst-stars">${STARS.map(s => `<button class="pst-star ${s.id === state.star ? 'on' : ''}" data-star="${s.id}">
          ${flagEl(s.nid)}<span class="nm">${s.name}</span><span class="kit">#${s.no} · ${s.kit}</span></button>`).join('')}</div>
        ${timed ? '' : `<div class="pen-best" style="margin:12px 0 4px">🏆 Best streak: <b>${bestStreak()}</b></div>`}
        <button class="pen-btn lime" id="start-btn" style="margin-top:10px">${timed ? `⚡ Start ${seconds}s shootout` : '⚡ Start your streak'}</button>
      </div></div>`;
    $('#setup-close').onclick = () => { onClose && onClose(); };
    $('#start-btn').onclick = startRun;
    cards.querySelectorAll('.pst-star').forEach(c => c.onclick = () => { state.star = c.dataset.star; renderSetup(); });
  }

  /* ---------------- RUN ---------------- */
  function startRun() {
    state.phase = 'play';
    state.streak = 0; state.busy = false; state.ready = false;
    state.opponents = shuffled(Object.keys(NATIONS).filter(id => id !== state.nid));
    state.oppIdx = 0;
    state.timeUp = false;
    scene.setStarTaker(state.star);
    cards.innerHTML = '';
    if (timed) startTimer();
    nextRound(true);
  }

  /* ---- 30s clock (timed head-to-head leg only) ---- */
  function timeLeftMs() { return Math.max(0, (state.endsAt || 0) - performance.now()); }
  function stopTimer() { if (timerInt) { clearInterval(timerInt); timerInt = null; } }
  function updateTimerHud() { const el = $('.pst-timer .n'); if (el) el.textContent = Math.ceil(timeLeftMs() / 1000); }
  function startTimer() {
    stopTimer();
    state.endsAt = performance.now() + DURATION_MS;
    updateTimerHud();
    timerInt = setInterval(() => {
      updateTimerHud();
      if (performance.now() >= state.endsAt) {
        state.timeUp = true;
        stopTimer();
        // ran out while idle (no shot in flight) → end now; otherwise the current
        // shot's result will end it once it resolves.
        if (!state.busy && state.phase === 'play') endRun(false, 'time');
      }
    }, 200);
  }

  function currentOpp() { return state.opponents[state.oppIdx % state.opponents.length]; }

  function nextRound(first) {
    const oid = currentOpp(), you = kitOf(state.nid), opp = kitOf(oid), st = starById(state.star);
    scene.setMatch({ youShirt: you.shirt, youShorts: you.shorts, youSocks: you.socks, youTrim: you.trim,
      oppShirt: opp.shirt, oppShorts: opp.shorts, oppSocks: opp.socks, oppTrim: opp.trim, starName: st.name, starNo: st.no });
    scene.setAimPoint(0, 1.2);
    scene.setAiming(true);
    renderPlayHUD();
    state.busy = false; state.ready = true;
    drawC.classList.remove('off');
  }

  function renderPlayHUD() {
    const st = starById(state.star);
    const oid = currentOpp();
    hud.innerHTML = `
      <div class="pen-top">
        <button class="pen-close" id="play-close">✕</button>
        <div class="pst-you">${flagEl(state.nid, 'sm')}<div><div class="nm">${st.name}</div><div class="no">#${st.no} · ${st.nid}</div></div></div>
        ${timed
          ? `<div class="pst-streak"><div class="n">${state.streak}</div><div class="lbl">goals</div></div>
             <div class="pst-streak pst-timer"><div class="n">${Math.ceil(timeLeftMs() / 1000)}</div><div class="lbl">seconds</div></div>`
          : `<div class="pst-streak"><div class="n">${state.streak}</div><div class="lbl">streak</div><div class="best">🏆 ${Math.max(bestStreak(), state.streak)}</div></div>`}
        <div class="pst-keeper"><div><div class="nm">${NATIONS[oid].name}</div><div class="no">keeper · ${timed ? 'shootout' : 'round ' + (state.streak + 1)}</div></div>${flagEl(oid, 'sm')}</div>
      </div>
      <div class="pen-bottom" style="pointer-events:none">
        <div class="pen-hint"><span class="pst-pin"></span> <span><b>Draw your shot</b> — bend it to curl, flick fast for power</span></div>
      </div>`;
    $('#play-close').onclick = () => { onClose && onClose(); };
  }

  /* ---------------- DRAW INPUT ---------------- */
  let pts = [], drawing = false, fade = null, lineCol = '#C8F23C';

  function sizeDraw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    drawC.width = innerWidth * dpr; drawC.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function renderLine(alpha = 1) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (pts.length < 2) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = new Path2D();
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      path.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const end = pts[pts.length - 1];
    path.lineTo(end.x, end.y);
    ctx.shadowColor = lineCol; ctx.shadowBlur = 14;
    ctx.strokeStyle = lineCol + '4D'; ctx.lineWidth = 11; ctx.stroke(path);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = lineCol; ctx.lineWidth = 4.5; ctx.stroke(path);
    // target ring at the tip
    ctx.beginPath(); ctx.arc(end.x, end.y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = lineCol; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(end.x, end.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = lineCol; ctx.fill();
    ctx.restore();
  }

  function fadeLine() {
    if (fade) cancelAnimationFrame(fade.raf);
    const f = { a: 1 };
    (function tick() {
      f.a -= 0.06;
      if (f.a <= 0) { pts = []; ctx.clearRect(0, 0, innerWidth, innerHeight); fade = null; return; }
      renderLine(f.a);
      f.raf = requestAnimationFrame(tick);
      fade = f;
    })();
  }

  const onDown = (e) => {
    if (state.phase !== 'play' || state.busy || !state.ready) return;
    drawing = true; lineCol = '#C8F23C';
    pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    if (fade) { cancelAnimationFrame(fade.raf); fade = null; }
    drawC.setPointerCapture(e.pointerId);
  };
  const onPMove = (e) => {
    if (!drawing) return;
    const p = { x: e.clientX, y: e.clientY, t: performance.now() }, last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 3) return;
    pts.push(p);
    // live power readout: speed over the trailing ~5 samples colors the line
    const k = Math.max(0, pts.length - 6), seg = pts.slice(k);
    const segLen = pathLength(seg), segT = Math.max(1, seg[seg.length - 1].t - seg[0].t);
    lineCol = powerColor(speedToPower(segLen / segT));
    renderLine();
    // free-aim: reticle follows the raw goal-plane point; warns red when off target
    const g = scene.projectNDC((p.x / innerWidth) * 2 - 1, -(p.y / innerHeight) * 2 + 1);
    scene.setAimPoint(g.x, g.y);
    scene.setReticleWarn(Math.abs(g.x) > GOAL_W / 2 - 0.10 || g.y > GOAL_H - 0.10);
  };
  const onUp = () => { if (!drawing) return; drawing = false; commitShot(); };
  const onCancel = () => { drawing = false; fadeLine(); scene.setAimPoint(0, 1.2); scene.setReticleWarn(false); };

  drawC.addEventListener('pointerdown', onDown);
  drawC.addEventListener('pointermove', onPMove);
  drawC.addEventListener('pointerup', onUp);
  drawC.addEventListener('pointercancel', onCancel);

  /* ---------------- SHOT ---------------- */
  function commitShot() {
    const p0 = pts[0], pe = pts[pts.length - 1];
    const len = pts.length > 1 ? pathLength(pts) : 0;
    const rise = p0 ? (p0.y - (pe ? pe.y : 0)) : 0;
    if (!p0 || len < 70 || rise < 40) {        // too short / not toward the goal
      fadeLine(); scene.setAimPoint(0, 1.2); return;
    }
    state.busy = true; state.ready = false;

    // flick speed -> power (fast = flat & fierce but scattered, slow = placed)
    const dur = Math.max(1, pe.t - p0.t);
    const power = speedToPower(len / dur);

    // free aim: the ball goes exactly where you drew it — including wide or over
    const g = scene.projectNDC((pe.x / innerWidth) * 2 - 1, -(pe.y / innerHeight) * 2 + 1);
    let tx = g.x, ty = g.y;
    // power scatter: hammering it costs accuracy (and can put it in the stands)
    const err = power * power * 0.5;
    tx += (Math.random() * 2 - 1) * err;
    ty = Math.max(0.12, ty + (Math.random() * 2 - 1) * err * 0.7);
    state.lastShot = { tx, ty };
    scene.setAimPoint(tx, ty);

    // curl = the bow of the drawn line at half arc-length, in goal meters
    const half = len / 2; let acc = 0, mid = pts[0];
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc >= half) { mid = pts[i]; break; }
    }
    const chordMidX = p0.x + (pe.x - p0.x) * 0.5;
    const a = scene.projectGoal(-GOAL_W / 2, 1), b = scene.projectGoal(GOAL_W / 2, 1);
    const goalPx = Math.max(1, (b.x - a.x) * innerWidth);
    const mPerPx = GOAL_W / goalPx;
    const curl = Math.max(-1.4, Math.min(1.4, (mid.x - chordMidX) * mPerPx * 1.5));

    // keeper commits to one of FIVE zones at random: BL, TL, BR, TR, middle.
    // Quadrant rule: if the ball lands anywhere in his chosen zone, it's saved.
    const KZONES = [{ dir: -1, high: false }, { dir: -1, high: true }, { dir: 1, high: false }, { dir: 1, high: true }, { dir: 0, high: false }];
    const kz = KZONES[(Math.random() * KZONES.length) | 0];
    const keeperDir = kz.dir, keeperHigh = kz.high;
    const ballSide = tx < -GOAL_W / 6 ? -1 : tx > GOAL_W / 6 ? 1 : 0;
    const ballHigh = ty > GOAL_H * 0.5;
    const saved = keeperDir === 0 ? ballSide === 0
      : (ballSide === keeperDir && ballHigh === keeperHigh);

    scene.setAiming(false);
    scene.setReticleWarn(false);
    fadeLine();
    scene.fireShot({ id: Date.now(), tx, ty, keeperDir, keeperHigh, curl, power, saved });   // zone-match rule decides
  }

  /* ---------------- RESULT ---------------- */
  function onResult(r) {
    const goal = r === 'goal';
    if (goal) { state.streak++; if (!timed && state.streak > bestStreak()) saveBest(state.streak);
      const n = $('.pst-streak .n'), b = $('.pst-streak .best');
      if (n) n.textContent = state.streak;
      if (b) b.textContent = '🏆 ' + Math.max(bestStreak(), state.streak);
    }
    flash(r);
    setTimeout(() => {
      clearFlash();
      // timed: keep shooting until the clock runs out (a miss never ends it).
      // streak: only a goal continues the run.
      const carryOn = timed ? !state.timeUp : goal;
      if (carryOn) { state.oppIdx++; nextRound(false); }
      else endRun(false, timed ? 'time' : r);
    }, goal ? 1350 : 1150);
  }

  function flash(r) {
    const s = state.lastShot || { tx: 0, ty: 1.2 };
    const WORDS = timed ? {
      goal: ['GOAL!', `${state.streak} IN — KEEP GOING`],
      save: ['SAVED!', 'KEEP GOING — CLOCK IS RUNNING'],
      post: [s.ty > GOAL_H - 0.2 ? 'OFF THE BAR!' : 'OFF THE POST!', 'KEEP GOING'],
      miss: [s.ty > GOAL_H ? 'OVER!' : 'WIDE!', 'KEEP GOING'],
    } : {
      goal: ['GOAL!', `STREAK ${state.streak} — NEXT KEEPER STEPS UP`],
      save: ['SAVED!', 'THE KEEPER GUESSED RIGHT'],
      post: [s.ty > GOAL_H - 0.2 ? 'OFF THE BAR!' : 'OFF THE POST!', 'INCHES AWAY — RUN OVER'],
      miss: [s.ty > GOAL_H ? 'OVER!' : 'WIDE!', 'OFF TARGET — RUN OVER'],
    };
    const [word, sub] = WORDS[r] || WORDS.miss;
    const f = document.createElement('div'); f.className = `pen-flash ${r}`;
    f.innerHTML = `<div><div class="word">${word}</div><div class="sub">${sub}</div></div>`;
    hud.appendChild(f);
    if (r === 'goal') confetti();
  }
  function clearFlash() { hud.querySelectorAll('.pen-flash,.pen-confetti').forEach(e => e.remove()); }
  function confetti() {
    const c = document.createElement('div'); c.className = 'pen-confetti';
    const cols = ['#C8F23C', '#FFB000', '#07C2C7', '#FF3D9A', '#fff'];
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % 5];
      s.style.borderRadius = i % 3 ? '1px' : '50%';
      s.style.animation = `penfall ${1.8 + Math.random() * 1.6}s linear ${Math.random() * .5}s forwards`;
      c.appendChild(s);
    }
    hud.appendChild(c);
  }

  /* ---------------- END ---------------- */
  function endRun(quit, reason) {
    state.phase = 'done';
    stopTimer();
    drawC.classList.add('off');
    hud.innerHTML = '';
    if (onScore) onScore(state.streak);      // report goals (leaderboard / challenge leg)
    const best = bestStreak();
    const beaten = state.opponents.slice(0, Math.min(state.streak, 8));
    const eyebrow = timed ? `Time! · ${seconds}-second shootout`
      : quit ? 'Run abandoned'
      : reason === 'miss' ? 'Off target — run over'
      : reason === 'post' ? 'Denied by the woodwork'
      : 'Saved — run over';
    const sub = timed
      ? `${state.streak} ${state.streak === 1 ? 'goal' : 'goals'} in ${seconds} seconds`
      : (state.streak === 0 ? 'The keeper owned you' : state.streak >= best && state.streak > 0 ? 'New personal best!' : 'In a row from the spot');
    cards.innerHTML = `
      <div class="pen-card-wrap"><div class="pen-card" style="text-align:center">
        <div class="pen-eyebrow">${eyebrow}</div>
        <div class="pen-result-score">${state.streak}</div>
        <div class="display" style="font-size:22px;margin-top:2px">${sub}</div>
        ${beaten.length ? `<div class="pst-beaten">${beaten.map(id => flagEl(id, 'sm')).join('')}${state.streak > 8 ? `<span class="more">+${state.streak - 8}</span>` : ''}</div>` : ''}
        ${timed ? '' : `<div class="pen-best" style="margin:14px 0 16px">🏆 Best streak: <b>${best}</b></div>`}
        <button class="pen-btn lime" id="again">↻ Go again</button>
        <button class="pen-btn ghost" id="back" style="margin-top:10px">Change star</button>
        <button class="pen-btn ghost" id="done" style="margin-top:10px;border:0;box-shadow:none">Done</button>
      </div></div>`;
    $('#again').onclick = () => { cards.innerHTML = ''; startRun(); };
    $('#back').onclick = renderSetup;
    $('#done').onclick = () => { onClose && onClose(); };
  }

  /* ---------------- BOOT ---------------- */
  sizeDraw();
  addEventListener('resize', sizeDraw);
  state = { star: null, nid: null, phase: 'setup', streak: 0, busy: false, ready: false, aim: { x: 0, y: 1.2 }, opponents: [], oppIdx: 0 };
  scene = createPenaltyScene(stage, { onAim: (a) => { state.aim = a; }, onResult, theme: 'night',
    stars: { takers: { messi:   { url: `${MODELS}/taker_messi.glb` },
                       ronaldo: { url: `${MODELS}/taker_ronaldo.glb` },
                       neymar:  { url: `${MODELS}/taker_neymar.glb` } },
             keeper: `${MODELS}/keeper_elshenawy.glb`,
             ball: `${MODELS}/ball.glb`,
             kicks: [
               { id: 'mx',      url: `${MODELS}/kick_mixamo.fbx`,  contact: 0.60, rT: 1.1 },
               { id: 'chip',    url: `${MODELS}/kick_chip.fbx`,    contact: 0.55, rT: 1.2, panenka: true },
             ],
             keeperClips: [
               { id: 'dive',  url: `${MODELS}/gk_dive.fbx`,    type: 'dive', window: [0, 2.0] },
               { id: 'jump',  url: `${MODELS}/gk_catch_a.fbx`, type: 'catch' },
               // no retargeted idle — the keeper uses its own native ready-stance clip
             ] } });
  renderSetup();

  // teardown: stop the rAF loop, drop the window listener, free GL resources
  return function dispose() {
    removeEventListener('resize', sizeDraw);
    if (fade) cancelAnimationFrame(fade.raf);
    stopTimer();
    try { scene && scene.dispose && scene.dispose(); } catch (e) { /* ignore */ }
  };
}
