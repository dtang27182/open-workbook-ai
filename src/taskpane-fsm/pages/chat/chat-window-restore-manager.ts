/* global structuredClone */

import {
  PendingEdit,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { ChatState, RestorePoint } from "./chat-window-types";

export class RestoreManager {
  private readonly restorePoints: RestorePoint[] = [];
  private readonly potentialRestorePoints = new Map<number, RestorePoint>();
  private nextRestorePointId = 1;

  createPotentialRestorePoint(
    workflowId: number,
    chatState: ChatState,
    sheet: SheetSnapshot
  ): void {
    const restorePoint = this.createRestorePoint(this.nextRestorePointId, chatState, sheet);
    this.nextRestorePointId++;
    this.potentialRestorePoints.set(workflowId, restorePoint);
  }

  promotePotentialRestorePoint(workflowId: number): RestorePoint {
    const restorePoint = this.potentialRestorePoints.get(workflowId)!;
    this.potentialRestorePoints.delete(workflowId);
    this.restorePoints.push(restorePoint);
    return restorePoint;
  }

  discardPotentialRestorePoint(workflowId: number): void {
    this.potentialRestorePoints.delete(workflowId);
  }

  getRestorePoint(restorePointId: number): RestorePoint {
    return this.restorePoints.find(({ id }) => id === restorePointId)!;
  }

  finalizeRestore(restorePointId: number): void {
    const restorePointIndex = this.restorePoints.findIndex(({ id }) => id === restorePointId);
    this.potentialRestorePoints.clear();
    this.restorePoints.length = restorePointIndex;
  }

  clearAllRestorePoints(): void {
    this.restorePoints.length = 0;
    this.potentialRestorePoints.clear();
  }

  private createRestorePoint(id: number, chatState: ChatState, sheet: SheetSnapshot): RestorePoint {
    return {
      id,
      chatState: this.copyChatState(chatState),
      sheet: this.copySheetSnapshot(sheet),
    };
  }

  private copyChatState(chatState: ChatState): ChatState {
    return {
      transcript: structuredClone(chatState.transcript),
      llmConversationMessages: [...chatState.llmConversationMessages],
      workflowState: chatState.workflowState,
      pendingEdit: chatState.pendingEdit ? this.copyPendingEdit(chatState.pendingEdit) : undefined,
      preprocessedSheetNames: [...chatState.preprocessedSheetNames],
      nextDiffSheetNumber: chatState.nextDiffSheetNumber,
      nextScenarioSheetNumber: chatState.nextScenarioSheetNumber,
      nextWorkflowId: chatState.nextWorkflowId,
    };
  }

  private copyPendingEdit(pendingEdit: PendingEdit): PendingEdit {
    return {
      sourceSheetName: pendingEdit.sourceSheetName,
      diffSheetName: pendingEdit.diffSheetName,
      workflowId: pendingEdit.workflowId,
    };
  }

  private copySheetSnapshot(sheet: SheetSnapshot): SheetSnapshot {
    return {
      name: sheet.name,
      values: sheet.values.map((row) => [...row]),
      formulas: sheet.formulas.map((row) => [...row]),
      rowIndex: sheet.rowIndex,
      columnIndex: sheet.columnIndex,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    };
  }
}
