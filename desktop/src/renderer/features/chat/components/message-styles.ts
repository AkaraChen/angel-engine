import { nativePanelClass } from "@/features/chat/components/thread-styles";

// Markdown typography lives in the `.chat-markdown` component class in
// index.css so it can use theme tokens and density-aware spacing directly.
const assistantTextContainerClassName = "chat-markdown";
const inspectorCardClassName = nativePanelClass;
const toolCallCardClassName = nativePanelClass;

export {
  assistantTextContainerClassName,
  inspectorCardClassName,
  toolCallCardClassName,
};
