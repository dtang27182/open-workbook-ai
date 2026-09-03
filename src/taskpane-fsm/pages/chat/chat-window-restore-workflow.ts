import {
  deleteDiffSheet,
  writeSheetFormulas,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { copyChatState } from "./chat-window-restore-point-helpers";
import { ChatWindowState } from "./chat-window-state";

export class RestoreWorkflow {
  constructor(private readonly state: ChatWindowState) {}

  async run(restorePointId: number): Promise<void> {
    const restorePointIndex = this.state.restorePoints.findIndex(
      (restorePoint) => restorePoint.id === restorePointId
    );
    const restorePoint = this.state.restorePoints[restorePointIndex]!;
    if (this.state.chatState.pendingEdit) {
      await deleteDiffSheet(
        this.state.excelApi,
        this.state.chatState.pendingEdit.sourceSheetName,
        this.state.chatState.pendingEdit.diffSheetName
      );
    }

    await writeSheetFormulas(this.state.excelApi, restorePoint.sheet);
    this.state.potentialRestorePoints.clear();
    this.state.chatState = copyChatState(restorePoint.chatState);
    this.state.restorePoints.length = restorePointIndex;
  }
}
