/* global console, HTMLInputElement, HTMLElement */

import { Component } from "../../component-v2";
import {
  applyCellEditsToSheet,
  createScenarioSheet,
  readActiveSheet,
  readSheet,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import { runScenarioComparisonPrompt } from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
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
  removeWorkingTranscriptItem,
  upsertTranscriptMessageAndRender,
} from "./chat-window-transcript-helpers";
import { runAcceptDiffWorkflow } from "./chat-window-accept-diff-workflow";
import { runClarificationWorkflow } from "./chat-window-clarification-workflow";
import { runPreprocessWorkflow } from "./chat-window-preprocess-workflow";
import { runRejectDiffWorkflow } from "./chat-window-reject-diff-workflow";
import { runRestoreWorkflow } from "./chat-window-restore-workflow";
import { ChatWindowState } from "./chat-window-state";
import { runSubmitMessageWorkflow } from "./chat-window-submit-message-workflow";

const preprocessingEnabled = true;

export type ChatWindowUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export type ProcessModelResponse = (
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  responseEntry: ChatMessageTranscriptItem,
  response: SpreadsheetPromptCompletionEvent
) => Promise<void>;

export class ChatWindow implements Component<ChatWindowUpdateEvent> {
  private readonly state: ChatWindowState;

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
    this.state = new ChatWindowState(mount, domHandlers, excelApi);
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
      workflowState: "answered",
      preprocessedSheetNames: [],
      nextDiffSheetNumber: 1,
      nextScenarioSheetNumber: 1,
      nextWorkflowId: 1,
    };
    this.state.restoreManager.clearAllRestorePoints();
    configChatControls(
      this.state.mount,
      this.state.chatState.transcript,
      this.state.chatState.workflowState,
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
          await runAcceptDiffWorkflow(this.state, this.processModelResponse);
        } else if (event.type === "reject_pending_diff") {
          await runRejectDiffWorkflow(this.state, this.processModelResponse);
        } else if (event.type === "restore_to_point") {
          await runRestoreWorkflow(this.state, event.restorePointId);
        }
      } catch (err) {
        console.debug(err);
        this.appendErrorMessage(this.getErrorMessage(event));
      } finally {
        configChatControls(
          this.state.mount,
          this.state.chatState.transcript,
          this.state.chatState.workflowState,
          this.state.domHandlers
        );
      }
    }
  }

  private async submitMessage(message: string): Promise<void> {
    this.state.mount.querySelector<HTMLInputElement>("#chat-input")!.value = "";
    if (this.state.chatState.workflowState === "awaiting_clarification") {
      await runClarificationWorkflow(this.state, this.processModelResponse, message);
      return;
    }

    const currentSheet = await readActiveSheet(this.state.excelApi);
    const workflowId = this.state.chatState.nextWorkflowId++;

    if (
      preprocessingEnabled &&
      !this.state.chatState.preprocessedSheetNames.includes(currentSheet.name)
    ) {
      await runPreprocessWorkflow(this.state, this.processModelResponse, message, workflowId);
    } else {
      await runSubmitMessageWorkflow(
        this.state,
        this.processModelResponse,
        message,
        workflowId,
        true
      );
    }
  }

  private readonly processModelResponse: ProcessModelResponse = async (
    userRequest: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    responseEntry: ChatMessageTranscriptItem,
    response: SpreadsheetPromptCompletionEvent
  ): Promise<void> => {
    this.state.chatState.llmConversationMessages = response.updatedLlmConversationMessages;

    if (response.type === "clarification_requested") {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: response.question }
      );
      this.state.chatState.workflowState = "awaiting_clarification";
    } else if (!response.reply.shouldEditSheet) {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: response.reply.message }
      );
      this.state.restoreManager.discardPotentialRestorePoint(workflowId);
      this.state.chatState.workflowState = "answered";
    } else if (response.reply.createNewSheet) {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: response.reply.message }
      );
      await this.createScenarioWithComparison(
        userRequest,
        workflowId,
        originalSheet,
        response.reply.cellEdits,
        response.reply.comparisonRanges,
        this.state.chatState.llmConversationMessages
      );
      this.state.restoreManager.discardPotentialRestorePoint(workflowId);
      this.state.chatState.workflowState = "answered";
    } else {
      upsertTranscriptMessageAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        responseEntry,
        { text: response.reply.message }
      );
      const diff = await this.state.createNextDiffSheet(originalSheet, response.reply.cellEdits);
      this.state.chatState.pendingEdit = {
        sourceSheetName: originalSheet.name,
        diffSheetName: diff.sheetName,
        workflowId,
      };
      this.state.chatState.workflowState = "pending_edit";
      appendDiffReviewTranscriptItemAndRender(
        this.state.mount,
        this.state.chatState.transcript,
        this.state.domHandlers,
        workflowId
      );
    }
  };

  private async createNextScenarioSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<string> {
    const sheetName = await createScenarioSheet(
      this.state.excelApi,
      this.state.chatState.nextScenarioSheetNumber,
      originalSheet,
      cellEdits
    );
    this.state.chatState.nextScenarioSheetNumber++;
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
    this.state.chatState.workflowState = "errored";
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
        !this.isTerminalTurnState(this.state.chatState.workflowState) &&
        this.state.chatState.workflowState !== "awaiting_clarification"
      ) {
        throw new Error(
          `Cannot submit a chat message while the chat state is ${this.state.chatState.workflowState}.`
        );
      }
      return;
    }

    if (input.type === "accept_pending_diff") {
      if (!this.isPendingEditState(this.state.chatState.workflowState)) {
        throw new Error("Cannot accept changes unless the latest turn is pending_edit.");
      }
      return;
    }

    if (input.type === "reject_pending_diff") {
      if (!this.isPendingEditState(this.state.chatState.workflowState)) {
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
