/* global HTMLElement */

import type { ChatWindowDomHandlers } from "./dom/chat-window-dom";
import { RestoreManager } from "./restore-manager";
import type { ChatTranscriptItem } from "./dom/transcript-helpers";
import type { LlmConversationHistory, LLMManager } from "./llm-manager";
import type { ExcelManager } from "./excel-manager";

export type ChatWorkflowStateVals =
  | "answered"
  | "awaiting_clarification"
  | "pending_edit_preprocessed"
  | "pending_edit"
  | "errored";

export type PendingEdit = {
  sourceSheetName: string;
  diffSheetName: string;
  workflowId: number;
};

export type ChatState = {
  transcript: ChatTranscriptItem[];
  llmConversationMessages: LlmConversationHistory;
  workflowState: ChatWorkflowStateVals;
  pendingEdit?: PendingEdit;
  preprocessedSheetNames: string[];
  nextWorkflowId: number;
};

export class ChatWindowState {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelManager: ExcelManager;
  readonly llmManager: LLMManager;
  chatState: ChatState = {
    transcript: [],
    llmConversationMessages: [],
    workflowState: "answered",
    preprocessedSheetNames: [],
    nextWorkflowId: 1,
  };
  readonly restoreManager = new RestoreManager();

  constructor(
    mount: HTMLElement,
    domHandlers: ChatWindowDomHandlers,
    excelManager: ExcelManager,
    llmManager: LLMManager
  ) {
    this.mount = mount;
    this.domHandlers = domHandlers;
    this.excelManager = excelManager;
    this.llmManager = llmManager;
  }
}
