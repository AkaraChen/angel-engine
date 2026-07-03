import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";
import { useCallback, useRef, useState } from "react";

export interface ComposerEditorController {
  draftText: string;
  mentionedFiles: ComposerMentionedFile[];
  reset: () => void;
  selectedSkills: ComposerMentionedSkill[];
  setDraftText: Dispatch<SetStateAction<string>>;
  setMentionedFiles: Dispatch<SetStateAction<ComposerMentionedFile[]>>;
  setSelectedSkills: Dispatch<SetStateAction<ComposerMentionedSkill[]>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useComposerEditor(): ComposerEditorController {
  const [draftText, setDraftText] = useState("");
  const [mentionedFiles, setMentionedFiles] = useState<ComposerMentionedFile[]>(
    [],
  );
  const [selectedSkills, setSelectedSkills] = useState<
    ComposerMentionedSkill[]
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const reset = useCallback(() => {
    setDraftText("");
    setMentionedFiles([]);
    setSelectedSkills([]);
  }, []);

  return {
    draftText,
    mentionedFiles,
    reset,
    selectedSkills,
    setDraftText,
    setMentionedFiles,
    setSelectedSkills,
    textareaRef,
  };
}
