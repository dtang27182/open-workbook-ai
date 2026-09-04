import {
  ChatFsmState,
  ChatTranscriptItem,
  LlmConversationHistory,
  PendingEdit,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";

export type ChatState = {
  transcript: ChatTranscriptItem[];
  llmConversationMessages: LlmConversationHistory;
  workflowState: ChatFsmState;
  pendingEdit?: PendingEdit;
  preprocessedSheetNames: string[];
  nextWorkflowId: number;
};

export type RestorePoint = {
  id: number;
  chatState: ChatState;
  sheet: SheetSnapshot;
};
