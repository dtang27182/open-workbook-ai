/* global console, HTMLInputElement, HTMLElement */

import { Component } from "../../../component";
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
} from "../../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  ChatWindowDomHandlers,
  configChatControls,
  createInitialDom,
  disableChatControls,
  renderChatTranscript,
} from "./dom/chat-window-dom";
import {
  appendDiffReviewTranscriptItemAndRender,
  appendMessageAndRender,
  appendWorkingTranscriptItem,
  removeWorkingTranscriptItem,
  upsertTranscriptMessageAndRender,
} from "./dom/transcript-helpers";
import { ChatWindowState } from "./chat-window-state";
import { ChatState } from "./chat-window-types";
import { ExcelManager } from "./excel-manager";
import { LLMManager } from "./llm-manager";
import { OpenrouterKeyStore } from "../../../../taskpane/pages/openrouter-auth/openrouter-api-key";
import { runAcceptDiffWorkflow } from "./workflows/accept-diff";
import { runClarificationWorkflow } from "./workflows/clarification";
import { runPreprocessWorkflow } from "./workflows/preprocess";
import { runRejectDiffWorkflow } from "./workflows/reject-diff";
import { runRestoreWorkflow } from "./workflows/restore";
import { runSubmitMessageWorkflow } from "./workflows/submit-message";

const preprocessingEnabled = true;

export type ChatWindowUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export class ChatWindow implements Component<ChatWindowUpdateEvent> {
  private readonly state: ChatWindowState;

  constructor(mount: HTMLElement, keyStore: OpenrouterKeyStore, excelApi?: ExcelApi) {
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
    this.state = new ChatWindowState(
      mount,
      domHandlers,
      new ExcelManager(excelApi),
      new LLMManager(keyStore)
    );
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
      nextWorkflowId: 1,
    };
    this.state.restoreManager.clearAllRestorePoints();
    this.state.excelManager.resetSheetNumbers();
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
          await runAcceptDiffWorkflow(this.state);
        } else if (event.type === "reject_pending_diff") {
          await runRejectDiffWorkflow(this.state);
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
      await runClarificationWorkflow(this.state, message);
      return;
    }

    const currentSheet = await this.state.excelManager.readActiveSheet();
    const workflowId = this.state.chatState.nextWorkflowId++;

    if (
      preprocessingEnabled &&
      !this.state.chatState.preprocessedSheetNames.includes(currentSheet.name)
    ) {
      await runPreprocessWorkflow(this.state, message, workflowId);
    } else {
      await runSubmitMessageWorkflow(this.state, message, workflowId, true);
    }
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

export async function processModelResponse(
  state: ChatWindowState,
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  responseEntry: ChatMessageTranscriptItem,
  response: SpreadsheetPromptCompletionEvent
): Promise<void> {
  state.chatState.llmConversationMessages = response.updatedLlmConversationMessages;

  if (response.type === "clarification_requested") {
    upsertTranscriptMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      responseEntry,
      { text: response.question }
    );
    state.chatState.workflowState = "awaiting_clarification";
  } else if (!response.reply.shouldEditSheet) {
    upsertTranscriptMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      responseEntry,
      { text: response.reply.message }
    );
    state.restoreManager.discardPotentialRestorePoint(workflowId);
    state.chatState.workflowState = "answered";
  } else if (response.reply.createNewSheet) {
    upsertTranscriptMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      responseEntry,
      { text: response.reply.message }
    );
    await createScenarioWithComparison(
      state,
      userRequest,
      workflowId,
      originalSheet,
      response.reply.cellEdits,
      response.reply.comparisonRanges,
      state.chatState.llmConversationMessages
    );
    state.restoreManager.discardPotentialRestorePoint(workflowId);
    state.chatState.workflowState = "answered";
  } else {
    upsertTranscriptMessageAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      responseEntry,
      { text: response.reply.message }
    );
    const diff = await state.excelManager.createNextDiffSheet(
      originalSheet,
      response.reply.cellEdits
    );
    state.chatState.pendingEdit = {
      sourceSheetName: originalSheet.name,
      diffSheetName: diff.sheetName,
      workflowId,
    };
    state.chatState.workflowState = "pending_edit";
    appendDiffReviewTranscriptItemAndRender(
      state.mount,
      state.chatState.transcript,
      state.domHandlers,
      workflowId
    );
  }
}

async function createScenarioWithComparison(
  state: ChatWindowState,
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  scenarioModelEdits: CellEdit[],
  comparisonRanges: ComparisonRange[],
  llmConversationMessages: LlmConversationHistory
): Promise<void> {
  const scenarioSheetName = await state.excelManager.createNextScenarioSheet(
    originalSheet,
    scenarioModelEdits
  );
  if (state.chatState.preprocessedSheetNames.includes(originalSheet.name)) {
    state.chatState.preprocessedSheetNames.push(scenarioSheetName);
  }
  const scenarioSheet = await state.excelManager.readSheet(scenarioSheetName);
  appendWorkingTranscriptItem(
    state.chatState.transcript,
    "Creating comparison between new scenario against baseline...",
    workflowId
  );
  renderChatTranscript(state.mount, state.chatState.transcript, state.domHandlers);
  const comparison = await state.llmManager.runScenarioComparisonPrompt(
    userRequest,
    originalSheet,
    scenarioSheet,
    comparisonRanges,
    llmConversationMessages
  );
  await state.excelManager.applyCellEditsToSheet(scenarioSheet, comparison.cellEdits);
  removeWorkingTranscriptItem(state.chatState.transcript, workflowId);
  appendMessageAndRender(
    state.mount,
    state.chatState.transcript,
    state.domHandlers,
    "system",
    comparison.analysis,
    workflowId
  );
  appendAssistantLlmMessage(state.chatState, comparison.analysis, workflowId);
}

export function appendUserDecisionLlmMessage(
  chatState: ChatState,
  text: string,
  workflowId: number
): void {
  chatState.llmConversationMessages = [
    ...chatState.llmConversationMessages,
    { role: "user", text, workflowId },
  ];
}

export function appendAssistantLlmMessage(
  chatState: ChatState,
  text: string,
  workflowId: number
): void {
  chatState.llmConversationMessages = [
    ...chatState.llmConversationMessages,
    { role: "assistant", text, workflowId },
  ];
}
