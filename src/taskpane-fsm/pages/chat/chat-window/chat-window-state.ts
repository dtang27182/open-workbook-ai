/* global HTMLElement */

import { ChatWindowDomHandlers } from "./dom/chat-window-dom";
import { RestoreManager } from "./restore-manager";
import { ChatState } from "./chat-window-types";
import { ExcelManager } from "./excel-manager";
import { LLMManager } from "./llm-manager";

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
