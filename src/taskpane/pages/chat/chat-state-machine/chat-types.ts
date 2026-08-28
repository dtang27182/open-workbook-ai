/* global Excel */

import type { FormulaInferencePlan, FormulaInferenceRegion } from "./preprocess-formula-inference";

export type LlmMessageRole = "assistant" | "user";

type LlmConversationSheetRange = Readonly<{
  range: Readonly<{
    rowIndex: number;
    columnIndex: number;
    rowCount: number;
    columnCount: number;
  }>;
}>;

export type LlmFormulaValueSheetContext = LlmConversationSheetRange &
  Readonly<{
    formulasMarkdown: string;
    valuesMarkdown: string;
  }>;

export type LlmCompactSheetContext = LlmConversationSheetRange &
  Readonly<{
    sheetMarkdown: string;
  }>;

export type LlmConversationSheetContext = LlmFormulaValueSheetContext | LlmCompactSheetContext;

export type LlmConversationMessage = Readonly<{
  role: LlmMessageRole;
  text: string;
  workflowId: number;
  sheetContext?: LlmConversationSheetContext;
}>;

export type LlmConversationFunctionCall = Readonly<{
  type: "function_call";
  id: string;
  callId: string;
  name: "ask_clarifying_question";
  arguments: string;
  workflowId: number;
}>;

export type LlmConversationFunctionCallOutput = Readonly<{
  type: "function_call_output";
  callId: string;
  output: string;
  workflowId: number;
}>;

export type LlmConversationHistory = readonly (
  | LlmConversationMessage
  | LlmConversationFunctionCall
  | LlmConversationFunctionCallOutput
)[];

export type ChatTranscriptSource = "human" | "system";

export type ChatTranscriptItem =
  | {
      kind: "message";
      source: ChatTranscriptSource;
      text: string;
      workflowId: number;
    }
  | {
      kind: "restore";
      restorePointId: number;
      workflowId: number;
      disabled: boolean;
    }
  | {
      kind: "diff_review";
      workflowId: number;
      disabled: boolean;
    }
  | {
      kind: "working";
      source: "system";
      text: string;
      workflowId: number;
    };

export type ChatTranscriptEntry = ChatTranscriptItem;

export type ChatMessageTranscriptItem = Extract<ChatTranscriptItem, { kind: "message" }>;

export type ChatWorkingTranscriptItem = Extract<ChatTranscriptItem, { kind: "working" }>;

export type ChatFsmState =
  | "answered"
  | "awaiting_clarification"
  | "pending_edit_preprocessed"
  | "pending_edit"
  | "errored";

export type ChatStateMachineUI = {
  renderTranscript(entries: readonly ChatTranscriptEntry[]): void;
  configChatControls(state: ChatFsmState): void;
  disableChatInputControls(): void;
};

export type ChatState = {
  transcript: ChatTranscriptItem[];
  llmConversationMessages: LlmConversationHistory;
  fsmState: ChatFsmState;
  pendingEdit?: PendingEdit;
  preprocessedSheetNames: string[];
};

export type PendingEdit = {
  sourceSheetName: string;
  diffSheetName: string;
  workflowId: number;
};

export type RestorePoint = {
  id: number;
  chatState: ChatState;
  sheet: SheetSnapshot;
};

export type SheetSnapshot = {
  name: string;
  values: unknown[][];
  formulas: unknown[][];
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
};

export type CellEdit = {
  address: string;
  newFormula: string | number | boolean | null;
};

export type ComparisonRange = {
  purpose: string;
  address: string;
};

export type ExcelApi = {
  run<T>(callback: (context: Excel.RequestContext) => Promise<T>): Promise<T>;
};

export type ModelSpreadsheetResponse =
  | {
      shouldEditSheet: false;
      createNewSheet: false;
      answer: string;
      editExplanation: null;
      cellEdits: CellEdit[];
      comparisonRanges: ComparisonRange[];
    }
  | {
      shouldEditSheet: true;
      createNewSheet: boolean;
      answer: null;
      editExplanation: string;
      cellEdits: CellEdit[];
      comparisonRanges: ComparisonRange[];
    };

export type ModelPreprocessResponse = {
  message: string;
  shouldEditSheet: boolean;
  createNewSheet: boolean;
  cellEdits: CellEdit[];
};

export type SpreadsheetPromptResult = {
  message: string;
  didCreateDiff: boolean;
};

export type SpreadsheetPromptWorkflowResult = {
  message: string;
  shouldEditSheet: boolean;
  createNewSheet: boolean;
  cellEdits: CellEdit[];
  comparisonRanges: ComparisonRange[];
};

export type ScenarioComparisonPromptResult = {
  cellEdits: CellEdit[];
  analysis: string;
};

export type OpenRouterStreamResultEvent =
  | { type: "output_text"; outputText: string }
  | { type: "complete"; response: OpenRouterResponseBody };

export type SpreadsheetPromptCompletionEvent =
  | {
      type: "clarification_requested";
      question: string;
      updatedLlmConversationMessages: LlmConversationHistory;
    }
  | {
      type: "complete";
      reply: SpreadsheetPromptWorkflowResult;
      updatedLlmConversationMessages: LlmConversationHistory;
    };

export type SpreadsheetPromptEvent =
  | { type: "partial_response"; text: string }
  | { type: "creating_proposed_change" }
  | { type: "creating_scenario_sheet" }
  | SpreadsheetPromptCompletionEvent;

export type PreprocessPromptEvent =
  | { type: "detection_complete"; plan: FormulaInferencePlan }
  | {
      type: "region_complete";
      region: FormulaInferenceRegion;
      cellEditCount: number;
    }
  | { type: "complete"; cellEdits: CellEdit[] };

export type FormulaInferenceDetectionEvent = Extract<
  PreprocessPromptEvent,
  { type: "detection_complete" }
>;

export type FormulaInferenceRegionEvent = Extract<
  PreprocessPromptEvent,
  { type: "region_complete" }
>;

export type ChatStateMachineInput =
  | { type: "submit_message"; message: string }
  | { type: "accept_pending_diff" }
  | { type: "reject_pending_diff" }
  | { type: "restore_to_point"; restorePointId: number };

export type OpenRouterMessage = { role: string; content: string };

export type OpenRouterFunctionCall = {
  type: "function_call";
  id: string;
  call_id: string;
  name: "ask_clarifying_question";
  arguments: string;
};

export type OpenRouterFunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export type OpenRouterInputItem =
  | OpenRouterMessage
  | (OpenRouterFunctionCall & { content?: never })
  | (OpenRouterFunctionCallOutput & { content?: never });

export type OpenRouterOutputItem =
  | { type?: string; content?: Array<{ type?: string; text?: string }> }
  | (OpenRouterFunctionCall & { content?: never });

export type OpenRouterFunctionTool = {
  type: "function";
  name: string;
  description: string;
  strict: boolean;
  parameters: object;
};

export type OpenRouterResponseBody = {
  ok?: boolean;
  error?: { message?: string };
  output?: OpenRouterOutputItem[];
};
export type OpenRouterStreamEvent = {
  type?: string;
  delta?: string;
  item?: OpenRouterOutputItem;
  item_id?: string;
  arguments?: string;
  error?: { message?: string };
  choices?: Array<{ delta?: { content?: string } }>;
};
export type OpenRouterRequestBody = {
  model: string;
  provider?: object;
  instructions: string;
  input: OpenRouterInputItem[];
  text?: object;
  max_output_tokens: number;
  reasoning?: object;
  tools?: OpenRouterFunctionTool[];
  tool_choice?: "auto" | "required";
  parallel_tool_calls?: boolean;
  max_tool_calls?: number;
  stream?: boolean;
};
