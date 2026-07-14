import { Robot } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

import { agentRuntimeIconSvg } from "./agent-runtime-icons";

/**
 * Renders a runtime's brand icon (LobeHub SVG) inline so it inherits the
 * surrounding text color/size, falling back to a generic robot glyph for
 * unknown or custom runtimes. Mirrors the desktop chat sidebar treatment.
 */
export function AgentRuntimeIcon({
  className,
  runtime,
}: {
  className?: string;
  runtime: string | null | undefined;
}) {
  const iconSvg = agentRuntimeIconSvg(runtime);

  if (iconSvg === undefined) {
    return <Robot className={cn("size-5", className)} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-5 items-center justify-center [&_svg]:size-full",
        className,
      )}
      // oxlint-disable-next-line react/no-danger -- Static bundled brand SVGs are inlined to inherit local icon styling.
      // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled brand SVGs are inlined to inherit local icon styling.
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  );
}
