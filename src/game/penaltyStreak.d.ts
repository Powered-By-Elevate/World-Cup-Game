/** Mount Penalty Streak inside a root that holds the #stage/#draw/#cards/#hud
 *  scaffold. Returns a teardown that disposes the 3D scene + listeners. */
export function initPenaltyStreak(
  root: HTMLElement,
  opts: {
    onClose?: () => void;
    onScore?: (streak: number) => void;
    /** 'streak' = single-player sudden death; 'timed' = score-as-many-as-you-can leg. */
    mode?: 'streak' | 'timed';
    /** Length of a 'timed' leg in seconds (default 30). */
    seconds?: number;
  }
): () => void;
