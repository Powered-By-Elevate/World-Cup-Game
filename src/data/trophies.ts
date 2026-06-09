/* ============================================================
   TROPHY CATALOG — the 20 awards, each with a unique rendering.
   Static metadata (name, criteria, flavor, material, rarity). Who *holds*
   each trophy is computed live in utils/awards.ts. The render for each id
   lives in components/Trophy.tsx.

   Concept: every per-round award is an "MVP" (so "Tournament Champion" is the
   only true Champion); "Sole Survivor" = outlast every rival's roster.
   ============================================================ */

export type TrophyKind = 'auto' | 'commish';

export interface TrophyMeta {
  id: string;
  name: string;
  how: string;          // how it's earned
  kind: TrophyKind;
  material: string;     // informational (the SVG art bakes in its own material)
  rarity: string;
  when: string;         // the phase it's awarded in
  emoji: string;        // compact fallback (leaderboard chips, etc.)
  blurb: string;        // flavor text shown on inspect
}

export const TROPHY_CATALOG: TrophyMeta[] = [
  // ---- automatic (earned from live results) ----
  { id: 'groupStage', name: 'Group Stage MVP', how: 'Most points scored during the group stage', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'Group Stage', emoji: '🥅',
    blurb: 'You bled the group stage dry — more points than anyone, the foundation of a title run.' },
  { id: 'r32', name: 'Round of 32 MVP', how: 'Most points during the Round of 32', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'Round of 32', emoji: '3️⃣',
    blurb: 'When the knockouts opened, nobody banked more. Pure ruthlessness in the first cut.' },
  { id: 'r16', name: 'Round of 16 MVP', how: 'Most points during the Round of 16', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'Round of 16', emoji: '🔥',
    blurb: 'The field narrowed and you sharpened. Top scorer through the Round of 16.' },
  { id: 'qf', name: 'Quarterfinals MVP', how: 'Most points during the Quarterfinals', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'Quarterfinals', emoji: '⚡',
    blurb: 'Eight teams left, and you ruled the quarterfinal weekend.' },
  { id: 'sf', name: 'Semifinals MVP', how: 'Most points during the Semifinals', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'Semifinals', emoji: '💪',
    blurb: 'Two games from glory — and the semifinal points king.' },
  { id: 'final', name: 'Final MVP', how: 'Most points scored in the Final round', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'The Final', emoji: '🏆',
    blurb: 'One match, maximum stakes. The Final round’s top scorer — a single hot weekend, not the whole season.' },
  { id: 'champion', name: 'Tournament Champion', how: '#1 overall when it’s all over', kind: 'auto', material: 'grand', rarity: '1 of 1', when: 'Tournament', emoji: '👑',
    blurb: 'The big one — the only true Champion. Top of the pool on total points when the dust settles.' },
  { id: 'championOwner', name: 'Champion Owner', how: 'You drafted the team that wins the World Cup', kind: 'auto', material: 'gold', rarity: '1 of 1', when: 'Tournament', emoji: '🌍',
    blurb: 'You called it on draft night. Your nation lifted the actual World Cup.' },
  { id: 'finalistOwner', name: 'Finalist Owner', how: 'You drafted the runner-up', kind: 'auto', material: 'silver', rarity: '1 of 1', when: 'Tournament', emoji: '🥈',
    blurb: 'So close to the summit. You owned the team that reached the Final.' },
  { id: 'mostAlive', name: 'Most Teams Alive', how: 'Most of your nations still in during the knockouts', kind: 'auto', material: 'verdant', rarity: 'Rotating', when: 'Knockouts', emoji: '🌳',
    blurb: 'The deepest surviving roster in the family — your nations keep dancing.' },
  { id: 'lastStanding', name: 'Sole Survivor', how: 'The last manager with a nation still alive in the bracket', kind: 'auto', material: 'steel', rarity: '1 of 1', when: 'Knockouts', emoji: '🛡️',
    blurb: 'Every rival’s roster is eliminated and yours alone fights on — about outlasting everyone else at the table.' },
  { id: 'biggestMover', name: 'Biggest Mover', how: 'Most points gained on the latest matchday', kind: 'auto', material: 'momentum', rarity: 'Rotating', when: 'Latest matchday', emoji: '📈',
    blurb: 'Nobody climbed the table faster. Pure momentum.' },

  // ---- commissioner hand-out (funny / subjective) ----
  { id: 'pain', name: 'Pain & Suffering', how: 'Endured the most heartbreak', kind: 'commish', material: 'plastic', rarity: 'Hand-picked', when: 'Commissioner', emoji: '😩',
    blurb: 'Last-minute goals, penalty heartbreak — you suffered so the rest of us could laugh.' },
  { id: 'gsDisaster', name: 'Group Stage Disaster', how: 'A truly catastrophic group stage', kind: 'commish', material: 'charred', rarity: 'Hand-picked', when: 'Commissioner', emoji: '💥',
    blurb: 'It went wrong early and often — a masterclass in the opposite of points.' },
  { id: 'coldest', name: 'Coldest Roster', how: 'The most frozen, point-less lineup', kind: 'commish', material: 'ice', rarity: 'Hand-picked', when: 'Commissioner', emoji: '🧊',
    blurb: 'Stone cold. Your nations forgot how to score and the freezer claimed your roster.' },
  { id: 'byThread', name: 'Survived by a Thread', how: 'Scraped through against all odds', kind: 'commish', material: 'plastic', rarity: 'Hand-picked', when: 'Commissioner', emoji: '🧵',
    blurb: 'On the brink, one thread from collapse — and somehow still hanging on.' },
  { id: 'stillAlive', name: 'Still Alive Somehow', how: 'Defied all logic to stay in it', kind: 'commish', material: 'plastic', rarity: 'Hand-picked', when: 'Commissioner', emoji: '🫥',
    blurb: 'By every metric you should be out. By some miracle, you’re not. Patched up but breathing.' },
  { id: 'bracketBuster', name: 'Bracket Buster', how: 'Blew up everyone’s predictions', kind: 'commish', material: 'dynamite', rarity: 'Hand-picked', when: 'Commissioner', emoji: '🧨',
    blurb: 'Your longshot detonated the whole group chat’s bracket. Beautiful chaos.' },
  { id: 'chaos', name: 'Chaos Manager', how: 'Pure, gloriously chaotic management', kind: 'commish', material: 'chaos', rarity: 'Hand-picked', when: 'Commissioner', emoji: '🌪️',
    blurb: 'No plan, no logic, all vibes — and somehow it keeps almost working.' },
  { id: 'lucky', name: 'Better Lucky Than Good', how: 'Rode luck harder than skill', kind: 'commish', material: 'clover', rarity: 'Hand-picked', when: 'Commissioner', emoji: '🍀',
    blurb: 'Own goals, deflections, last-gasp winners — all in your favor. Pure, shameless fortune.' },
];

export const TROPHY_BY_ID: Record<string, TrophyMeta> =
  Object.fromEntries(TROPHY_CATALOG.map(t => [t.id, t]));

export const AUTO_TROPHIES = TROPHY_CATALOG.filter(t => t.kind === 'auto');
export const COMMISH_TROPHIES = TROPHY_CATALOG.filter(t => t.kind === 'commish');
