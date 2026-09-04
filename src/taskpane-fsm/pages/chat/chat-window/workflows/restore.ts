import { ChatWindowState } from "../chat-window-state";

export async function runRestoreWorkflow(
  state: ChatWindowState,
  restorePointId: number
): Promise<void> {
  const restorePoint = state.restoreManager.getRestorePoint(restorePointId);
  if (state.chatState.pendingEdit) {
    await state.excelManager.deleteDiffSheet(
      state.chatState.pendingEdit.sourceSheetName,
      state.chatState.pendingEdit.diffSheetName
    );
  }

  await state.excelManager.writeSheetFormulas(restorePoint.sheet);
  state.chatState = restorePoint.chatState;
  state.restoreManager.finalizeRestore(restorePointId);
}
