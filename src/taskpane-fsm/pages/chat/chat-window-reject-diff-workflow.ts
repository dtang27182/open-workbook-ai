import { deleteDiffSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { PendingEdit } from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
} from "./chat-window-transcript-helpers";
import { ChatWindowState, RunSubmitMessageWorkflow } from "./chat-window-state";

export class RejectDiffWorkflow {
  constructor(
    private readonly state: ChatWindowState,
    private readonly runSubmitMessageWorkflow: RunSubmitMessageWorkflow
  ) {}

  async run(): Promise<void> {
    const pendingEdit = this.state.chatState.pendingEdit!;
    await this.setup(pendingEdit);
    await this.performActions(pendingEdit);
    await this.finalize(pendingEdit);
  }

  private async setup(pendingEdit: PendingEdit): Promise<void> {
    removeDiffReviewTranscriptItem(this.state.chatState.transcript, pendingEdit.workflowId);
    appendWorkingTranscriptItem(
      this.state.chatState.transcript,
      "Rejecting changes...",
      pendingEdit.workflowId
    );
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
  }

  private async performActions(pendingEdit: PendingEdit): Promise<void> {
    await deleteDiffSheet(
      this.state.excelApi,
      pendingEdit.sourceSheetName,
      pendingEdit.diffSheetName
    );
  }

  private async finalize(pendingEdit: PendingEdit): Promise<void> {
    const shouldContinueOriginalQuery =
      this.state.chatState.fsmState === "pending_edit_preprocessed";
    this.state.potentialRestorePoints.delete(pendingEdit.workflowId);
    this.state.chatState.pendingEdit = undefined;
    this.state.chatState.fsmState = "answered";

    removeWorkingTranscriptItem(this.state.chatState.transcript, pendingEdit.workflowId);
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "system",
      "Rejected changes.",
      pendingEdit.workflowId
    );
    this.state.appendUserDecisionLlmMessage("Rejected changes.", pendingEdit.workflowId);

    if (shouldContinueOriginalQuery) {
      appendMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        "system",
        "Continuing with original query.",
        pendingEdit.workflowId
      );
      await this.runSubmitMessageWorkflow(
        getWorkflowHumanMessage(this.state.chatState.transcript, pendingEdit.workflowId),
        pendingEdit.workflowId,
        false
      );
    }
  }
}
