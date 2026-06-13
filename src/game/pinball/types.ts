/* ============================================================
   WORLD CUP PINBALL — shared types.
   The table is authored in a fixed LOGICAL space (W×H below) and the
   renderer scales it to fit the phone. All physics run in logical units
   (pixels of the logical table) with velocities in units/second.
   ============================================================ */
import type { Vec } from './vec';

export const TW = 360, TH = 640;   // logical table size (portrait)

export type SegKind = 'wall' | 'metal' | 'sling' | 'flip';

/** A static line-segment collider. Slingshots carry a `kick` impulse + score. */
export interface Segment {
  a: Vec; b: Vec;
  e: number;                 // restitution
  kind: SegKind;
  kick?: number;             // extra outward impulse on hit (slingshots)
  score?: number;
  light?: string;            // a light id to pulse when struck
}

/** A pop bumper — a circle that bounces the ball away with energy + score. */
export interface Bumper {
  id: string;
  p: Vec; r: number;
  e: number; kick: number; score: number;
  color: string;
  lit: number;               // flash timer (seconds remaining)
}

/** A standing target / rollover — small circle that lights when hit. */
export interface Target {
  id: string;
  p: Vec; r: number;
  score: number;
  lit: number;               // flash timer
  on: boolean;               // collected (for target banks / lanes)
  kind: 'target' | 'rollover';
  group?: string;            // bank/lane group id
}

/** The goal mouth at the top — driving the ball in here scores a GOAL. */
export interface Goal {
  p: Vec; w: number; h: number;
  lit: number;
}

/** A saucer/kickout hole (Space Cadet's "Black Hole" / wormhole locks). The ball
 *  is captured, held briefly, then ejected. `hyper` = hyperspace bonus + start the
 *  lit mission; `lock` = lock a ball for multiball; `goal` reserved. */
export interface Hole {
  id: string;
  p: Vec; r: number;
  kind: 'hyper' | 'lock';
  lit: number;
  locked: number;            // balls currently captured/locked here
}

/** A spinner (corner-flag) on an orbit — scores per rotation as the ball passes. */
export interface Spinner {
  id: string;
  a: Vec; b: Vec;            // the gate segment the ball crosses
  spin: number;             // current spin energy (decays) for the visual
  value: number;            // points per tick
}

/** Outlane kickback (Space Cadet's left "Re-entry" saver) — when armed, a ball
 *  entering the zone is fired back up the lane instead of draining. */
export interface Kickback {
  p: Vec; r: number;
  armed: boolean;
}

/** A rotating flipper (capsule: segment pivot→tip with radius r). */
export interface Flipper {
  side: 'L' | 'R';
  pivot: Vec;
  len: number; r: number;
  rest: number; up: number;  // angles (radians)
  angle: number; omega: number;
  pressed: boolean;
}

export interface Ball { p: Vec; v: Vec; r: number; }

export type Status = 'attract' | 'ready' | 'playing' | 'over';

export interface Popup { p: Vec; text: string; ttl: number; life: number; color: string; }
export interface Confetti { p: Vec; v: Vec; life: number; color: string; rot: number; spin: number; }
export interface Spark { p: Vec; v: Vec; life: number; ttl: number; color: string; }

export interface Mission {
  id: string;
  name: string;
  hint: string;
  aim: 'goal' | 'bumpers' | 'lanes' | 'spinner';   // what flashes to show the shot
  need: number;              // shots to complete
  bonus: number;             // completion bonus (×multiplier)
}

/** HUD-relevant snapshot pushed to React (kept small; canvas owns the rest). */
export interface Snapshot {
  status: Status;
  score: number;
  high: number;
  ball: number;              // 1-based current ball
  balls: number;             // total balls per game
  multiplier: number;
  rank: string;              // tournament rank (reskinned Space Cadet rank ladder)
  rankIndex: number;
  rankMax: number;
  mission: string;
  missionHint: string;
  missionNeed: number;
  missionDone: number;
  missionActive: boolean;    // a mission is running (vs. lit-and-waiting)
  ballSave: boolean;
  kickback: boolean;
  locks: number;             // balls locked toward multiball
  charge: number;            // plunger charge 0..1
  muted: boolean;
  inMultiball: boolean;
  message: string;           // big transient banner
}
