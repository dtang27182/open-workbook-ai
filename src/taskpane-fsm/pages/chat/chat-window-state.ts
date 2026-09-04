/* global HTMLElement */

import { createDiffSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  CellEdit,
  ExcelApi,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { ChatWindowDomHandlers } from "./chat-window-dom";
import { RestoreManager } from "./chat-window-restore-manager";
import { ChatState } from "./chat-window-types";

export class ChatWindowState {
  readonly mount: HTMLElement;
  readonly domHandlers: ChatWindowDomHandlers;
  readonly excelApi: ExcelApi;
  chatState: ChatState = {
    transcript: [],
    llmConversationMessages: [],
    workflowState: "answered",
    preprocessedSheetNames: [],
    nextDiffSheetNumber: 1,
    nextScenarioSheetNumber: 1,
    nextWorkflowId: 1,
  };
  readonly restoreManager = new RestoreManager();

  constructor(mount: HTMLElement, domHandlers: ChatWindowDomHandlers, excelApi: ExcelApi) {
    this.mount = mount;
    this.domHandlers = domHandlers;
    this.excelApi = excelApi;
  }

  async createNextDiffSheet(originalSheet: SheetSnapshot, cellEdits: CellEdit[]) {
    const diff = await createDiffSheet(
      this.excelApi,
      this.chatState.nextDiffSheetNumber,
      originalSheet,
      cellEdits
    );
    this.chatState.nextDiffSheetNumber++;
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
