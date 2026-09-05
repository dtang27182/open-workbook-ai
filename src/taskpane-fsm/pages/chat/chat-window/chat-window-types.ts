import {
  CellEdit,
  ChatFsmState,
  ChatTranscriptItem,
  LlmConversationHistory,
  PendingEdit,
  SheetSnapshot,
} from "../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import type { FormulaInferencePlan, FormulaInferenceRegion } from "./preprocess-formula-inference";

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

export type PreprocessPromptEvent =
  | { type: "detection_complete"; plan: FormulaInferencePlan }
  | {
      type: "region_complete";
      region: FormulaInferenceRegion;
      cellEditCount: number;
    }
  | { type: "complete"; cellEdits: CellEdit[] };
