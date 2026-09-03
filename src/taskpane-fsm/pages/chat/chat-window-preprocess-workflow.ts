import { readActiveSheet } from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { runPreprocessPrompt } from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  CellEdit,
  SheetSnapshot,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  formatFormulaInferencePlan,
  formatFormulaInferenceRegionResult,
} from "../../../taskpane/pages/chat/chat-state-machine/preprocess-formula-inference";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendDiffReviewTranscriptItemAndRender,
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
} from "./chat-window-transcript-helpers";
import { ChatWindowState, RunSubmitMessageWorkflow } from "./chat-window-state";

export class PreprocessWorkflow {
  constructor(
    private readonly state: ChatWindowState,
    private readonly runSubmitMessageWorkflow: RunSubmitMessageWorkflow
  ) {}

  async run(message: string, workflowId: number): Promise<void> {
    const originalSheet = await readActiveSheet(this.state.excelApi);
    this.setupTransition(message, workflowId, originalSheet);
    let cellEdits: CellEdit[] | undefined;
    for await (const event of runPreprocessPrompt(originalSheet)) {
      if (event.type === "detection_complete") {
        appendMessageAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          "system",
          formatFormulaInferencePlan(event.plan),
          workflowId
        );
      } else if (event.type === "region_complete") {
        appendMessageAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          "system",
          formatFormulaInferenceRegionResult(event.region, event.cellEditCount),
          workflowId
        );
      } else if (event.type === "complete") {
        cellEdits = event.cellEdits;
      }
    }
    removeWorkingTranscriptItem(this.state.chatState.transcript, workflowId);
    await this.finalizeTransition(workflowId, originalSheet, cellEdits!);
  }

  private setupTransition(message: string, workflowId: number, originalSheet: SheetSnapshot): void {
    this.state.createPotentialRestorePoint(workflowId, originalSheet);
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "human",
      message,
      workflowId
    );
    appendWorkingTranscriptItem(
      this.state.chatState.transcript,
      "Analyzing worksheet..",
      workflowId
    );
    this.state.chatState.preprocessedSheetNames.push(originalSheet.name);
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
  }

  private async finalizeTransition(
    workflowId: number,
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<void> {
    if (cellEdits.length > 0) {
      appendMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        "system",
        "**Completed formula inference. Please review the inferred formulas (highlighted)**",
        workflowId
      );
      const diff = await this.state.createNextDiffSheet(originalSheet, cellEdits);
      this.state.chatState.pendingEdit = {
        sourceSheetName: originalSheet.name,
        diffSheetName: diff.sheetName,
        workflowId,
      };
      this.state.chatState.fsmState = "pending_edit_preprocessed";
      appendDiffReviewTranscriptItemAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        workflowId
      );
    } else {
      await this.runSubmitMessageWorkflow(
        getWorkflowHumanMessage(this.state.chatState.transcript, workflowId),
        workflowId,
        false
      );
    }
  }
}
