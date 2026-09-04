/* global HTMLElement */

import { ChatWindowDomHandlers } from "./chat-window-dom";
import { RestoreManager } from "./chat-window-restore-manager";
import { ChatState } from "./chat-window-types";
import { ExcelController } from "./excel-controller";

export class ChatWindowState {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelController: ExcelController;
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
    excelController: ExcelController
  ) {
    this.mount = mount;
    this.domHandlers = domHandlers;
    this.excelController = excelController;
  }

  appendUserDecisionLlmMessage(text: string, workflowId: number): void {
    this.chatState.llmConversationMessages = [
      ...this.chatState.llmConversationMessages,
      { role: "user", text, workflowId },
    ];
  }

  appendAssistantLlmMessage(text: string, workflowId: number): void {
    this.chatState.llmConversationMessages = [
      ...this.chatState.llmConversationMessages,
      { role: "assistant", text, workflowId },
    ];
  }
}
