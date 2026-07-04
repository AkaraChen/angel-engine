import type { ReactNode } from "react";

import { cn } from "@/platform/utils";

export function SketchUnderline({ children }: { children?: ReactNode }) {
  return (
    <span
      className={cn(
        "relative inline-block max-w-full align-baseline text-primary",
      )}
    >
      <span className="relative z-10 whitespace-nowrap">{children}</span>
      <svg
        aria-hidden
        className="
          pointer-events-none absolute -bottom-1.5 left-[-5%] h-3 w-[110%]
          overflow-visible text-primary/55
        "
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 120 12"
      >
        <path
          d="M3 7.8 C13 3.1 24 10.4 35 6.2 C48 1.3 55 8.6 67 6.8 C78 5.2 81 2.6 91 4.9 C101 7.3 108 6.7 117 3.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3.1"
        />
      </svg>
    </span>
  );
}
