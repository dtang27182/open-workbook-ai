import {
  deleteDiffSheet,
  writeSheetFormulas,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { ChatWindowState } from "./chat-window-state";

export class RestoreWorkflow {
  constructor(private readonly state: ChatWindowState) {}

  async run(restorePointId: number): Promise<void> {
    const restorePoint = this.state.restoreManager.getRestorePoint(restorePointId);
    if (this.state.chatState.pendingEdit) {
      await deleteDiffSheet(
        this.state.excelApi,
        this.state.chatState.pendingEdit.sourceSheetName,
        this.state.chatState.pendingEdit.diffSheetName
      );
    }

    await writeSheetFormulas(this.state.excelApi, restorePoint.sheet);
    this.state.chatState = restorePoint.chatState;
    this.state.restoreManager.finalizeRestore(restorePointId);
  }
}
