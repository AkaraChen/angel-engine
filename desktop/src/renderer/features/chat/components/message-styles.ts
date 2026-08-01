import {
  inspectorCardClass,
  toolCardClass,
} from "@/features/chat/components/thread-styles";

// Markdown typography lives in the `.chat-markdown` component class in
// index.css so it can use theme tokens and density-aware spacing directly.
const assistantTextContainerClassName = "chat-markdown";
const inspectorCardClassName = inspectorCardClass;
const toolCallCardClassName = toolCardClass;

export {
  assistantTextContainerClassName,
  inspectorCardClassName,
  toolCallCardClassName,
};
