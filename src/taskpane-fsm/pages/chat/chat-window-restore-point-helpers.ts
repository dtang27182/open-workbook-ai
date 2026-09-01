/* global structuredClone */

import {
  ChatState,
  PendingEdit,
  RestorePoint,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";

export function createRestorePoint(
  id: number,
  chatState: ChatState,
  sheet: SheetSnapshot
): RestorePoint {
  return {
    id,
    chatState: copyChatState(chatState),
    sheet: copySheetSnapshot(sheet),
  };
}

export function copyChatState(chatState: ChatState): ChatState {
  return {
    transcript: structuredClone(chatState.transcript),
    llmConversationMessages: [...chatState.llmConversationMessages],
    fsmState: chatState.fsmState,
    pendingEdit: chatState.pendingEdit ? copyPendingEdit(chatState.pendingEdit) : undefined,
    preprocessedSheetNames: [...chatState.preprocessedSheetNames],
  };
}

function copyPendingEdit(pendingEdit: PendingEdit): PendingEdit {
  return {
    sourceSheetName: pendingEdit.sourceSheetName,
    diffSheetName: pendingEdit.diffSheetName,
    workflowId: pendingEdit.workflowId,
  };
}

function copySheetSnapshot(sheet: SheetSnapshot): SheetSnapshot {
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
