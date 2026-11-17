import type { ChatWorkflowStateVals, PendingEdit } from "./chat-session-state";
import type { MainModelId, ModelProvider } from "./llm/main-model-options";
import type { ChatTranscriptItem } from "./transcript";

export type ReadonlySnapshot<T> = { readonly [K in keyof T]: ReadonlySnapshot<T[K]> };

export type ChatModelOption = {
  readonly label: string;
  readonly modelId: MainModelId;
};

export type ChatSessionSnapshot = ReadonlySnapshot<{
  transcript: ChatTranscriptItem[];
  workflowState: ChatWorkflowStateVals;
  actionRunning: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canRestore: boolean;
  pendingEdit?: PendingEdit;
  reviewSheetName?: string;
  restorePoints: { id: number; sheetName: string }[];
  provider: ModelProvider | undefined;
  modelOptions: ChatModelOption[];
  selectedModelId: MainModelId | undefined;
}>;
