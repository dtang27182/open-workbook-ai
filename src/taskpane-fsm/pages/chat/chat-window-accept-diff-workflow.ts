/* global console */

import {
  deleteDiffSheet,
  readSheet,
  retargetFormulaSheetReferences,
  writeSheetFormulas,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { runUpdateAnalysisPrompt } from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  PendingEdit,
  RestorePoint,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  insertRestoreTranscriptItemAndRender,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
} from "./chat-window-transcript-helpers";
import { ChatWindowState, RunSubmitMessageWorkflow } from "./chat-window-state";

export class AcceptDiffWorkflow {
  constructor(
    private readonly state: ChatWindowState,
    private readonly runSubmitMessageWorkflow: RunSubmitMessageWorkflow
  ) {}

  async run(): Promise<void> {
    const pendingEdit = this.state.chatState.pendingEdit!;
    const shouldAnalyzeUpdate = this.state.chatState.fsmState === "pending_edit";
    const userRequest = getWorkflowHumanMessage(
      this.state.chatState.transcript,
      pendingEdit.workflowId
    );
    await this.setup(pendingEdit);
    await this.performActions(pendingEdit);
    const restorePoint = await this.finalize(pendingEdit);
    if (shouldAnalyzeUpdate) {
      await this.appendUpdateAnalysis(
        userRequest,
        pendingEdit.workflowId,
        restorePoint.sheet,
        pendingEdit.sourceSheetName
      );
    }
  }

  private async setup(pendingEdit: PendingEdit): Promise<void> {
    removeDiffReviewTranscriptItem(this.state.chatState.transcript, pendingEdit.workflowId);
    appendWorkingTranscriptItem(
      this.state.chatState.transcript,
      "Applying changes...",
      pendingEdit.workflowId
    );
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
  }

  private async performActions(pendingEdit: PendingEdit): Promise<void> {
    const diffSheet = await readSheet(this.state.excelApi, pendingEdit.diffSheetName);
    await writeSheetFormulas(
      this.state.excelApi,
      retargetFormulaSheetReferences(diffSheet, pendingEdit.sourceSheetName)
    );
    await deleteDiffSheet(
      this.state.excelApi,
      pendingEdit.sourceSheetName,
      pendingEdit.diffSheetName
    );
  }

  private async finalize(pendingEdit: PendingEdit): Promise<RestorePoint> {
    const shouldContinueOriginalQuery =
      this.state.chatState.fsmState === "pending_edit_preprocessed";
    const restorePoint = this.state.restoreManager.promotePotentialRestorePoint(
      pendingEdit.workflowId
    );
    this.state.chatState.pendingEdit = undefined;
    this.state.chatState.fsmState = "answered";

    removeWorkingTranscriptItem(this.state.chatState.transcript, pendingEdit.workflowId);
    insertRestoreTranscriptItemAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      restorePoint,
      pendingEdit.workflowId
    );
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "system",
      "Accepted changes.",
      pendingEdit.workflowId
    );
    this.state.appendUserDecisionLlmMessage("Accepted changes.", pendingEdit.workflowId);

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

    return restorePoint;
  }

  private async appendUpdateAnalysis(
    userRequest: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    updatedSheetName: string
  ): Promise<void> {
    appendWorkingTranscriptItem(
      this.state.chatState.transcript,
      "Analyzing accepted changes...",
      workflowId
    );
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
    try {
      const updatedSheet = await readSheet(this.state.excelApi, updatedSheetName);
      const analysis = await runUpdateAnalysisPrompt(
        userRequest,
        originalSheet,
        updatedSheet,
        this.state.chatState.llmConversationMessages
      );
      removeWorkingTranscriptItem(this.state.chatState.transcript, workflowId);
      appendMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        "system",
        analysis,
        workflowId
      );
      this.state.appendAssistantLlmMessage(analysis, workflowId);
    } catch (err) {
      console.debug("OpenRouter update analysis request failed.", err);
      removeWorkingTranscriptItem(this.state.chatState.transcript, workflowId);
      renderChatTranscript(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers
      );
    }
  }
}
