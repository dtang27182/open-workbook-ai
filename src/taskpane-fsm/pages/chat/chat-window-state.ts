/* global HTMLElement */

import { createDiffSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  CellEdit,
  ChatState,
  ExcelApi,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { ChatWindowDomHandlers } from "./chat-window-dom";
import { RestoreManager } from "./chat-window-restore-manager";

export class ChatWindowState {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelApi: ExcelApi;
  chatState: ChatState = {
    transcript: [],
    llmConversationMessages: [],
    fsmState: "answered",
    preprocessedSheetNames: [],
  };
  readonly restoreManager = new RestoreManager();
  nextDiffSheetNumber = 1;
  nextScenarioSheetNumber = 1;
  nextWorkflowId = 1;

  constructor(mount: HTMLElement, domHandlers: ChatWindowDomHandlers, excelApi: ExcelApi) {
    this.mount = mount;
    this.domHandlers = domHandlers;
    this.excelApi = excelApi;
  }

  async createNextDiffSheet(originalSheet: SheetSnapshot, cellEdits: CellEdit[]) {
    const diff = await createDiffSheet(
      this.excelApi,
      this.nextDiffSheetNumber,
      originalSheet,
      cellEdits
    );
    this.nextDiffSheetNumber++;
    return diff;
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
