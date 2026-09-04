/* global HTMLElement */

import { ChatWindowDomHandlers } from "./dom/chat-window-dom";
import { RestoreManager } from "./restore-manager";
import { ChatState } from "./chat-window-types";
import { ExcelController } from "./excel-controller";
import { LLMManager } from "./llm-manager";

export class ChatWindowState {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelController: ExcelController;
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
    excelController: ExcelController,
    llmManager: LLMManager
  ) {
    this.mount = mount;
    this.domHandlers = domHandlers;
    this.excelController = excelController;
    this.llmManager = llmManager;
  }
}
