import {
  ChatFsmState,
  ChatMessageTranscriptItem,
  ChatTranscriptItem,
  LlmConversationHistory,
  PendingEdit,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../../taskpane/pages/chat/chat-state-machine/chat-types";

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

export type ProcessModelResponse = (
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  responseEntry: ChatMessageTranscriptItem,
  response: SpreadsheetPromptCompletionEvent
) => Promise<void>;
