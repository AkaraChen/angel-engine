import type { Transition } from "framer-motion";

/** The DNA's standard easing, matching `--ease-standard` in the token layer. */
export const sidebarMotion = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
} satisfies Transition;
