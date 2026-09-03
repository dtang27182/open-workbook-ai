/* global HTMLElement */

import { createDiffSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  CellEdit,
  ChatState,
  ExcelApi,
  RestorePoint,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { ChatWindowDomHandlers } from "./chat-window-dom";
import { createRestorePoint } from "./chat-window-restore-point-helpers";

export type RunSubmitMessageWorkflow = (
  message: string,
  workflowId: number,
  showHumanMessage: boolean
) => Promise<void>;

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
  readonly restorePoints: RestorePoint[] = [];
  readonly potentialRestorePoints = new Map<number, RestorePoint>();
  nextDiffSheetNumber = 1;
  nextScenarioSheetNumber = 1;
  nextWorkflowId = 1;
  nextRestorePointId = 1;

  constructor(mount: HTMLElement, domHandlers: ChatWindowDomHandlers, excelApi: ExcelApi) {
    this.mount = mount;
    this.domHandlers = domHandlers;
    this.excelApi = excelApi;
  }

  createPotentialRestorePoint(workflowId: number, sheet: SheetSnapshot): void {
    const restorePoint = createRestorePoint(this.nextRestorePointId, this.chatState, sheet);
    this.nextRestorePointId++;
    this.potentialRestorePoints.set(workflowId, restorePoint);
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
