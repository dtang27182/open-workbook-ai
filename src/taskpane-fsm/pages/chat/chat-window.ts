/* global console, HTMLInputElement, HTMLElement */

import { Component } from "../../component-v2";
import {
  applyCellEditsToSheet,
  createScenarioSheet,
  readActiveSheet,
  readSheet,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  getPendingClarificationToolCall,
  runClarificationResponsePrompt,
  runMainQueryPrompt,
  runScenarioComparisonPrompt,
} from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  CellEdit,
  ChatFsmState,
  ChatMessageTranscriptItem,
  ChatStateMachineInput,
  ComparisonRange,
  ExcelApi,
  LlmConversationHistory,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  ChatWindowDomHandlers,
  configChatControls,
  createInitialDom,
  disableChatControls,
  renderChatTranscript,
} from "./chat-window-dom";
import {
  appendDiffReviewTranscriptItemAndRender,
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  getWorkflowHumanMessage,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "./chat-window-transcript-helpers";
import { AcceptDiffWorkflow } from "./chat-window-accept-diff-workflow";
import { PreprocessWorkflow } from "./chat-window-preprocess-workflow";
import { RejectDiffWorkflow } from "./chat-window-reject-diff-workflow";
import { RestoreWorkflow } from "./chat-window-restore-workflow";
import { ChatWindowState } from "./chat-window-state";

const preprocessingEnabled = true;

export type ChatWindowUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export class ChatWindow implements Component<ChatWindowUpdateEvent> {
  private readonly state: ChatWindowState;
  private readonly preprocessWorkflow: PreprocessWorkflow;
  private readonly acceptDiffWorkflow: AcceptDiffWorkflow;
  private readonly rejectDiffWorkflow: RejectDiffWorkflow;
  private readonly restoreWorkflow: RestoreWorkflow;

  constructor(mount: HTMLElement, excelApi?: ExcelApi) {
    const domHandlers: ChatWindowDomHandlers = {
      onClear: () => {
        void this.updateState({ type: "clear" });
      },
      onSubmit: (message) => {
        void this.updateState({ type: "submit_message", message });
      },
      onAccept: () => {
        void this.updateState({ type: "accept_pending_diff" });
      },
      onReject: () => {
        void this.updateState({ type: "reject_pending_diff" });
      },
      onRestore: (restorePointId) => {
        void this.updateState({ type: "restore_to_point", restorePointId });
      },
    };
    const runSubmitMessageWorkflow = (
      message: string,
      workflowId: number,
      showHumanMessage: boolean
    ) => this.runSubmitMessageWorkflow(message, workflowId, showHumanMessage);

    this.state = new ChatWindowState(mount, domHandlers, excelApi);
    this.preprocessWorkflow = new PreprocessWorkflow(this.state, runSubmitMessageWorkflow);
    this.acceptDiffWorkflow = new AcceptDiffWorkflow(this.state, runSubmitMessageWorkflow);
    this.rejectDiffWorkflow = new RejectDiffWorkflow(this.state, runSubmitMessageWorkflow);
    this.restoreWorkflow = new RestoreWorkflow(this.state);
    createInitialDom(this.state.mount, this.state.domHandlers);
    this.reset();
  }

  getMount(): HTMLElement {
    return this.state.mount;
  }

  private reset(): void {
    this.state.chatState = {
      transcript: [
        {
          kind: "message",
          source: "system",
          text: "Ask me to analyze the data, update the model, or model a new scenario.",
          workflowId: 0,
        },
      ],
      llmConversationMessages: [],
      fsmState: "answered",
      preprocessedSheetNames: [],
    };
    this.state.restorePoints.length = 0;
    this.state.potentialRestorePoints.clear();
    this.state.nextDiffSheetNumber = 1;
    this.state.nextScenarioSheetNumber = 1;
    configChatControls(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.chatState.fsmState,
      this.state.domHandlers
    );
  }

  async updateState(event: ChatWindowUpdateEvent): Promise<void> {
    if (event.type === "clear") {
      this.reset();
    } else if (
      event.type === "submit_message" ||
      event.type === "accept_pending_diff" ||
      event.type === "reject_pending_diff" ||
      event.type === "restore_to_point"
    ) {
      disableChatControls(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers
      );
      try {
        this.validateInputForCurrentState(event);

        if (event.type === "submit_message") {
          await this.submitMessage(event.message);
        } else if (event.type === "accept_pending_diff") {
          await this.acceptDiffWorkflow.run();
        } else if (event.type === "reject_pending_diff") {
          await this.rejectDiffWorkflow.run();
        } else if (event.type === "restore_to_point") {
          await this.restoreWorkflow.run(event.restorePointId);
        }
      } catch (err) {
        console.debug(err);
        this.appendErrorMessage(this.getErrorMessage(event));
      } finally {
        configChatControls(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.chatState.fsmState,
          this.state.domHandlers
        );
      }
    }
  }

  private async continueClarification(answer: string): Promise<void> {
    const pendingToolCall = getPendingClarificationToolCall(
      this.state.chatState.llmConversationMessages
    );
    const workflowId = pendingToolCall.workflowId;
    const originalSheet = await readActiveSheet(this.state.excelApi);
    const responseEntry = this.setupClarificationResponseTransition(answer, workflowId);
    const result = await this.performClarificationResponseActions(
      answer,
      workflowId,
      this.state.chatState.llmConversationMessages,
      responseEntry
    );
    await this.finalizeSubmitTransition(
      getWorkflowHumanMessage(this.state.chatState.transcript, workflowId),
      workflowId,
      originalSheet,
      responseEntry,
      result
    );
  }

  private setupClarificationResponseTransition(
    answer: string,
    workflowId: number
  ): ChatMessageTranscriptItem {
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "human",
      answer,
      workflowId
    );
    appendWorkingTranscriptItem(this.state.chatState.transcript, "Working...", workflowId);
    renderChatTranscript(this.state.mount, this.state.chatState.transcript, this.state.domHandlers);
    return {
      kind: "message",
      source: "system",
      text: "",
      workflowId,
    };
  }

  private async performClarificationResponseActions(
    answer: string,
    workflowId: number,
    llmConversationMessages: LlmConversationHistory,
    responseEntry: ChatMessageTranscriptItem
  ): Promise<SpreadsheetPromptCompletionEvent> {
    let completionEvent: SpreadsheetPromptCompletionEvent | undefined;
    for await (const event of runClarificationResponsePrompt(
      answer,
      workflowId,
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

  private async submitMessage(message: string): Promise<void> {
    this.state.mount.querySelector<HTMLInputElement>("#chat-input")!.value = "";
    if (this.state.chatState.fsmState === "awaiting_clarification") {
      await this.continueClarification(message);
      return;
    }

    const currentSheet = await readActiveSheet(this.state.excelApi);
    const workflowId = this.state.nextWorkflowId++;

    if (
      preprocessingEnabled &&
      !this.state.chatState.preprocessedSheetNames.includes(currentSheet.name)
    ) {
      await this.preprocessWorkflow.run(message, workflowId);
    } else {
      await this.runSubmitMessageWorkflow(message, workflowId, true);
    }
  }

  private async runSubmitMessageWorkflow(
    message: string,
    workflowId: number,
    showHumanMessage = true
  ): Promise<void> {
    const { originalSheet, llmConversationMessages } = await this.gatherSubmitInputs();
    const responseEntry = this.setupSubmitTransition(
      message,
      workflowId,
      showHumanMessage,
      originalSheet
    );
    const result = await this.performSubmitActions(
      message,
      workflowId,
      originalSheet,
      llmConversationMessages,
      responseEntry
    );
    await this.finalizeSubmitTransition(message, workflowId, originalSheet, responseEntry, result);
  }

  private async gatherSubmitInputs(): Promise<{
    originalSheet: SheetSnapshot;
    llmConversationMessages: LlmConversationHistory;
  }> {
    return {
      originalSheet: await readActiveSheet(this.state.excelApi),
      llmConversationMessages: this.state.chatState.llmConversationMessages,
    };
  }

  private setupSubmitTransition(
    message: string,
    workflowId: number,
    showHumanMessage: boolean,
    originalSheet: SheetSnapshot
  ): ChatMessageTranscriptItem {
    this.state.createPotentialRestorePoint(workflowId, originalSheet);
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

  private async performSubmitActions(
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

  private async finalizeSubmitTransition(
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
      this.state.potentialRestorePoints.delete(workflowId);
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
      this.state.potentialRestorePoints.delete(workflowId);
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

  private appendErrorMessage(message: string) {
    if (this.state.chatState.pendingEdit) {
      this.state.chatState.transcript = this.state.chatState.transcript.filter(
        (entry) =>
          entry.workflowId !== this.state.chatState.pendingEdit!.workflowId ||
          (entry.kind !== "diff_review" && entry.kind !== "working")
      );
    } else {
      this.state.chatState.transcript = this.state.chatState.transcript.filter(
        (entry) => entry.kind !== "working"
      );
    }
    this.state.chatState.fsmState = "errored";
    appendMessageAndRender(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.domHandlers,
      "system",
      message,
      0
    );
  }

  private validateInputForCurrentState(input: ChatStateMachineInput) {
    if (input.type === "submit_message") {
      if (
        !this.isTerminalTurnState(this.state.chatState.fsmState) &&
        this.state.chatState.fsmState !== "awaiting_clarification"
      ) {
        throw new Error(
          `Cannot submit a chat message while the chat state is ${this.state.chatState.fsmState}.`
        );
      }
      return;
    }

    if (input.type === "accept_pending_diff") {
      if (!this.isPendingEditState(this.state.chatState.fsmState)) {
        throw new Error("Cannot accept changes unless the latest turn is pending_edit.");
      }
      return;
    }

    if (input.type === "reject_pending_diff") {
      if (!this.isPendingEditState(this.state.chatState.fsmState)) {
        throw new Error("Cannot reject changes unless the latest turn is pending_edit.");
      }
      return;
    }

    if (input.type === "restore_to_point") {
      return;
    }
  }

  private getErrorMessage(input: ChatStateMachineInput): string {
    if (input.type === "submit_message") {
      return "I could not get an assistant response. Check the active worksheet and OpenRouter configuration, then ask again.";
    }

    if (input.type === "accept_pending_diff") {
      return "I could not accept the changes.";
    }

    if (input.type === "reject_pending_diff") {
      return "I could not reject the changes.";
    }

    if (input.type === "restore_to_point") {
      return "I could not restore the sheet.";
    }
  }

  private isTerminalTurnState(state: ChatFsmState): boolean {
    return state === "answered" || state === "errored";
  }

  private isPendingEditState(state: ChatFsmState): boolean {
    return state === "pending_edit" || state === "pending_edit_preprocessed";
  }
}
