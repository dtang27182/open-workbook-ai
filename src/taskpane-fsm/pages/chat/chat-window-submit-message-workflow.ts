import {
  applyCellEditsToSheet,
  createScenarioSheet,
  readActiveSheet,
  readSheet,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  runMainQueryPrompt,
  runScenarioComparisonPrompt,
} from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  CellEdit,
  ChatMessageTranscriptItem,
  ComparisonRange,
  LlmConversationHistory,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { renderChatTranscript } from "./chat-window-dom";
import {
  appendDiffReviewTranscriptItemAndRender,
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "./chat-window-transcript-helpers";
import { ChatWindowState } from "./chat-window-state";

export class SubmitMessageWorkflow {
  constructor(private readonly state: ChatWindowState) {}

  async run(message: string, workflowId: number, showHumanMessage = true): Promise<void> {
    const { originalSheet, llmConversationMessages } = await this.gatherInputs();
    const responseEntry = this.setupTransition(
      message,
      workflowId,
      showHumanMessage,
      originalSheet
    );
    const result = await this.performActions(
      message,
      workflowId,
      originalSheet,
      llmConversationMessages,
      responseEntry
    );
    await this.finalizeSubmitTransition(message, workflowId, originalSheet, responseEntry, result);
  }

  async finalizeSubmitTransition(
    message: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    responseEntry: ChatMessageTranscriptItem,
    result: SpreadsheetPromptCompletionEvent
  ): Promise<void> {
    this.state.chatState.llmConversationMessages = result.updatedLlmConversationMessages;

    if (result.type === "clarification_requested") {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: result.question }
      );
      this.state.chatState.fsmState = "awaiting_clarification";
    } else if (!result.reply.shouldEditSheet) {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: result.reply.message }
      );
      this.state.restoreManager.discardPotentialRestorePoint(workflowId);
      this.state.chatState.fsmState = "answered";
    } else if (result.reply.createNewSheet) {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: result.reply.message }
      );
      await this.createScenarioWithComparison(
        message,
        workflowId,
        originalSheet,
        result.reply.cellEdits,
        result.reply.comparisonRanges,
        this.state.chatState.llmConversationMessages
      );
      this.state.restoreManager.discardPotentialRestorePoint(workflowId);
      this.state.chatState.fsmState = "answered";
    } else {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: result.reply.message }
      );
      const diff = await this.state.createNextDiffSheet(originalSheet, result.reply.cellEdits);
      this.state.chatState.pendingEdit = {
        sourceSheetName: originalSheet.name,
        diffSheetName: diff.sheetName,
        workflowId,
      };
      this.state.chatState.fsmState = "pending_edit";
      appendDiffReviewTranscriptItemAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        workflowId
      );
    }
  }

  private async gatherInputs(): Promise<{
    originalSheet: SheetSnapshot;
    llmConversationMessages: LlmConversationHistory;
  }> {
    return {
      originalSheet: await readActiveSheet(this.state.excelApi),
      llmConversationMessages: this.state.chatState.llmConversationMessages,
    };
  }

  private setupTransition(
    message: string,
    workflowId: number,
    showHumanMessage: boolean,
    originalSheet: SheetSnapshot
  ): ChatMessageTranscriptItem {
    this.state.restoreManager.createPotentialRestorePoint(
      workflowId,
      this.state.chatState,
      originalSheet
    );
    if (showHumanMessage) {
      appendMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        "human",
        message,
        workflowId
      );
    }
    appendWorkingTranscriptItem(this.state.chatState.transcript, "Working...", workflowId);
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
    return {
      kind: "message",
      source: "system",
      text: "",
      workflowId,
    };
  }

  private async performActions(
    message: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    llmConversationMessages: LlmConversationHistory,
    responseEntry: ChatMessageTranscriptItem
  ): Promise<SpreadsheetPromptCompletionEvent> {
    let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
    for await (const event of runMainQueryPrompt(
      message,
      workflowId,
      originalSheet,
      llmConversationMessages
    )) {
      if (event.type === "partial_response") {
        upsertTranscriptMessageAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          responseEntry,
          { text: event.text }
        );
      }

      if (event.type === "creating_proposed_change") {
        updateWorkingTranscriptItemAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          "Creating proposed change...",
          workflowId
        );
      }

      if (event.type === "creating_scenario_sheet") {
        updateWorkingTranscriptItemAndRender(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.domHandlers,
          "Creating new sheet to model scenario...",
          workflowId
        );
      }

      if (event.type === "clarification_requested" || event.type === "complete") {
        completionEvent = event;
      }
    }
    removeWorkingTranscriptItem(this.state.chatState.transcript, workflowId);

    return completionEvent!;
  }

  private async createNextScenarioSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<string> {
    const sheetName = await createScenarioSheet(
      this.state.excelApi,
      this.state.nextScenarioSheetNumber,
      originalSheet,
      cellEdits
    );
    this.state.nextScenarioSheetNumber++;
    return sheetName;
  }

  private async createScenarioWithComparison(
    userRequest: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    scenarioModelEdits: CellEdit[],
    comparisonRanges: ComparisonRange[],
    llmConversationMessages: LlmConversationHistory
  ): Promise<void> {
    const scenarioSheetName = await this.createNextScenarioSheet(originalSheet, scenarioModelEdits);
    if (this.state.chatState.preprocessedSheetNames.includes(originalSheet.name)) {
      this.state.chatState.preprocessedSheetNames.push(scenarioSheetName);
    }
    const scenarioSheet = await readSheet(this.state.excelApi, scenarioSheetName);
    appendWorkingTranscriptItem(
      this.state.chatState.transcript,
      "Creating comparison between new scenario against baseline...",
      workflowId
    );
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
    const comparison = await runScenarioComparisonPrompt(
      userRequest,
      originalSheet,
      scenarioSheet,
      comparisonRanges,
      llmConversationMessages
    );
    await applyCellEditsToSheet(this.state.excelApi, scenarioSheet, comparison.cellEdits);
    removeWorkingTranscriptItem(this.state.chatState.transcript, workflowId);
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "system",
      comparison.analysis,
      workflowId
    );
    this.state.appendAssistantLlmMessage(comparison.analysis, workflowId);
  }
}
