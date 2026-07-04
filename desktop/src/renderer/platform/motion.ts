import type { Transition } from "framer-motion";

export const springs = {
  /** Thumbs, rails, layout position changes. */
  snappy: { type: "spring", stiffness: 480, damping: 38, mass: 0.8 },
  /** Panels, sheets, larger surfaces. */
  gentle: { type: "spring", stiffness: 300, damping: 32, mass: 1 },
  /** Icons, checkmarks, small state morphs. */
  pop: { type: "spring", stiffness: 600, damping: 28, mass: 0.6 },
} as const satisfies Record<string, Transition>;

export const durations = {
  fast: 0.12,
  base: 0.18,
  slow: 0.26,
} as const;

export const easeSwift = [0.32, 0.72, 0, 1] as const;

export const fadeRise = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: durations.base, ease: easeSwift },
} as const;
