import { code as streamdownCode } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { Streamdown } from "streamdown";

interface MarkdownMessageProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Render an assistant message with shadcn/typeset typography and Streamdown
 * markdown parsing. Optimised for both streamed and persisted text.
 */
export function MarkdownMessage({
  content,
  isStreaming = false,
}: MarkdownMessageProps) {
  return (
    <div className="typeset typeset-chat min-w-0">
      <Streamdown
        mode={isStreaming ? "streaming" : "static"}
        plugins={{ code: streamdownCode, cjk }}
        controls={{ code: false }}
        linkSafety={{ enabled: false }}
        lineNumbers={false}
        shikiTheme={["vitesse-light", "vitesse-dark"]}
      >
        {content}
      </Streamdown>
    </div>
  );
}
