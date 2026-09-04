import {
  deleteDiffSheet,
  writeSheetFormulas,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { ChatWindowState } from "./chat-window-state";

export async function runRestoreWorkflow(
  state: ChatWindowState,
  restorePointId: number
): Promise<void> {
  const restorePoint = state.restoreManager.getRestorePoint(restorePointId);
  if (state.chatState.pendingEdit) {
    await deleteDiffSheet(
      state.excelApi,
      state.chatState.pendingEdit.sourceSheetName,
      state.chatState.pendingEdit.diffSheetName
    );
  }

  await writeSheetFormulas(state.excelApi, restorePoint.sheet);
  state.chatState = restorePoint.chatState;
  state.restoreManager.finalizeRestore(restorePointId);
}
