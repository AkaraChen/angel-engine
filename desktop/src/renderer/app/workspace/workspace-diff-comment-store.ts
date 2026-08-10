import type {
  CreateDiffCommentInput,
  DiffComment,
  DiffCommentStatus,
} from "@/app/workspace/workspace-diff-comments";
import { create } from "zustand";
import {
  createDiffComment,
  isSendableDiffComment,
} from "@/app/workspace/workspace-diff-comments";

interface WorkspaceDiffCommentState {
  addComment: (input: CreateDiffCommentInput) => DiffComment;
  comments: DiffComment[];
  deleteComment: (id: string) => void;
  markSendablePending: (ids: string[]) => void;
  setBody: (id: string, body: string) => void;
  setSelected: (id: string, selected: boolean) => void;
  setStatus: (id: string, status: DiffCommentStatus) => void;
}

export const useWorkspaceDiffCommentStore = create<WorkspaceDiffCommentState>(
  (set) => ({
    addComment(input) {
      const comment = createDiffComment(input);
      set((state) => ({ comments: [...state.comments, comment] }));
      return comment;
    },
    comments: [],
    deleteComment(id) {
      set((state) => ({
        comments: state.comments.filter((comment) => comment.id !== id),
      }));
    },
    markSendablePending(ids) {
      const idSet = new Set(ids);
      set((state) => ({
        comments: state.comments.map((comment) =>
          idSet.has(comment.id) && isSendableDiffComment(comment)
            ? { ...comment, selected: false, status: "pending" }
            : comment,
        ),
      }));
    },
    setBody(id, body) {
      set((state) => ({
        comments: state.comments.map((comment) =>
          comment.id === id ? { ...comment, body } : comment,
        ),
      }));
    },
    setSelected(id, selected) {
      set((state) => ({
        comments: state.comments.map((comment) =>
          comment.id === id ? { ...comment, selected } : comment,
        ),
      }));
    },
    setStatus(id, status) {
      set((state) => ({
        comments: state.comments.map((comment) =>
          comment.id === id ? { ...comment, status } : comment,
        ),
      }));
    },
  }),
);

export function selectDiffCommentsForRoot(
  comments: DiffComment[],
  root: string,
) {
  return comments.filter((comment) => comment.root === root);
}

export function selectSendableDiffCommentIds(comments: DiffComment[]) {
  return comments.filter(isSendableDiffComment).map((comment) => comment.id);
}

/** Test helper — keep production UI on the store actions. */
export function resetWorkspaceDiffCommentStore() {
  useWorkspaceDiffCommentStore.setState({ comments: [] });
}
