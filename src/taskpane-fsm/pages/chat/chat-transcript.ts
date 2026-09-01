/* global console, document, HTMLButtonElement, HTMLFormElement, HTMLInputElement, HTMLElement, structuredClone */

import DOMPurify from "dompurify";
import { marked } from "marked";
import { Component } from "../../component-v2";
import {
  applyCellEditsToSheet,
  createDiffSheet,
  createScenarioSheet,
  deleteDiffSheet,
  readActiveSheet,
  readSheet,
  retargetFormulaSheetReferences,
  writeSheetFormulas,
} from "../../../taskpane/pages/chat/chat-state-machine/excel-sheet-utils";
import {
  getPendingClarificationToolCall,
  runClarificationResponsePrompt,
  runMainQueryPrompt,
  runPreprocessPrompt,
  runScenarioComparisonPrompt,
  runUpdateAnalysisPrompt,
} from "../../../taskpane/pages/chat/chat-state-machine/llm-model-workflow";
import {
  CellEdit,
  ChatFsmState,
  ChatMessageTranscriptItem,
  ChatState,
  ChatStateMachineInput,
  ChatTranscriptEntry,
  ChatWorkingTranscriptItem,
  ComparisonRange,
  ExcelApi,
  FormulaInferenceDetectionEvent,
  FormulaInferenceRegionEvent,
  LlmConversationHistory,
  PendingEdit,
  RestorePoint,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { cloneChatPageElement } from "./chat-page-template";

const preprocessingEnabled = true;

export type ChatTranscriptUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export class ChatTranscript implements Component<ChatTranscriptUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly rootElement: HTMLElement;
  private readonly excelApi: ExcelApi;
  private chatState: ChatState = {
    transcript: [],
    llmConversationMessages: [],
    fsmState: "answered",
    preprocessedSheetNames: [],
  };
  private restorePoints: RestorePoint[] = [];
  private potentialRestorePoints = new Map<number, RestorePoint>();
  private nextDiffSheetNumber = 1;
  private nextScenarioSheetNumber = 1;
  private nextWorkflowId = 1;
  private nextRestorePointId = 1;

  constructor(mount: HTMLElement, excelApi?: ExcelApi) {
    this.mount = mount;
    this.excelApi = excelApi;
    this.rootElement = this.createInitialDom();
    this.reset();
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  private reset(): void {
    this.chatState = {
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
    this.restorePoints.length = 0;
    this.potentialRestorePoints.clear();
    this.nextDiffSheetNumber = 1;
    this.nextScenarioSheetNumber = 1;
    this.configChatControls();
  }

  async updateState(event: ChatTranscriptUpdateEvent): Promise<void> {
    if (event.type === "clear") {
      this.reset();
    } else if (
      event.type === "submit_message" ||
      event.type === "accept_pending_diff" ||
      event.type === "reject_pending_diff" ||
      event.type === "restore_to_point"
    ) {
      this.disableChatControls();
      try {
        this.validateInputForCurrentState(event);

        if (event.type === "submit_message") {
          await this.submitMessage(event.message);
        } else if (event.type === "accept_pending_diff") {
          await this.acceptPendingDiff();
        } else if (event.type === "reject_pending_diff") {
          await this.rejectPendingDiff();
        } else if (event.type === "restore_to_point") {
          await this.restoreToPoint(event.restorePointId);
        }
      } catch (err) {
        console.debug(err);
        this.appendErrorMessage(this.getErrorMessage(event));
      } finally {
        this.configChatControls();
      }
    }
  }

  private async continueClarification(answer: string): Promise<void> {
    const pendingToolCall = getPendingClarificationToolCall(this.chatState.llmConversationMessages);
    const workflowId = pendingToolCall.workflowId;
    const originalSheet = await readActiveSheet(this.excelApi);
    const responseEntry = this.setupClarificationResponseTransition(answer, workflowId);
    const result = await this.performClarificationResponseActions(
      answer,
      workflowId,
      this.chatState.llmConversationMessages,
      responseEntry
    );
    await this.finalizeSubmitTransition(
      this.getWorkflowHumanMessage(workflowId),
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
    this.appendMessage("human", answer, workflowId);
    this.appendWorkingTranscriptItem("Working...", workflowId);
    this.renderChatTranscript();
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
        this.upsertTranscriptMessage(responseEntry, { text: event.text });
      }

      if (event.type === "creating_proposed_change") {
        this.updateWorkingTranscriptItem("Creating proposed change...", workflowId);
      }

      if (event.type === "creating_scenario_sheet") {
        this.updateWorkingTranscriptItem("Creating new sheet to model scenario...", workflowId);
      }

      if (event.type === "clarification_requested" || event.type === "complete") {
        completionEvent = event;
      }
    }
    this.removeWorkingTranscriptItem(workflowId);

    return completionEvent!;
  }

  private async submitMessage(message: string): Promise<void> {
    this.rootElement.querySelector<HTMLInputElement>("#chat-input")!.value = "";
    if (this.chatState.fsmState === "awaiting_clarification") {
      await this.continueClarification(message);
      return;
    }

    const currentSheet = await readActiveSheet(this.excelApi);
    const workflowId = this.nextWorkflowId++;

    if (
      preprocessingEnabled &&
      !this.chatState.preprocessedSheetNames.includes(currentSheet.name)
    ) {
      await this.runPreprocessWorkflow(message, workflowId);
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
      originalSheet: await readActiveSheet(this.excelApi),
      llmConversationMessages: this.chatState.llmConversationMessages,
    };
  }

  private setupSubmitTransition(
    message: string,
    workflowId: number,
    showHumanMessage: boolean,
    originalSheet: SheetSnapshot
  ): ChatMessageTranscriptItem {
    this.createPotentialRestorePoint(workflowId, originalSheet);
    if (showHumanMessage) {
      this.appendMessage("human", message, workflowId);
    }
    this.appendWorkingTranscriptItem("Working...", workflowId);
    this.renderChatTranscript();
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
        this.upsertTranscriptMessage(responseEntry, { text: event.text });
      }

      if (event.type === "creating_proposed_change") {
        this.updateWorkingTranscriptItem("Creating proposed change...", workflowId);
      }

      if (event.type === "creating_scenario_sheet") {
        this.updateWorkingTranscriptItem("Creating new sheet to model scenario...", workflowId);
      }

      if (event.type === "clarification_requested" || event.type === "complete") {
        completionEvent = event;
      }
    }
    this.removeWorkingTranscriptItem(workflowId);

    return completionEvent!;
  }

  private async finalizeSubmitTransition(
    message: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    responseEntry: ChatMessageTranscriptItem,
    result: SpreadsheetPromptCompletionEvent
  ): Promise<void> {
    this.chatState.llmConversationMessages = result.updatedLlmConversationMessages;

    if (result.type === "clarification_requested") {
      this.upsertTranscriptMessage(responseEntry, { text: result.question });
      this.chatState.fsmState = "awaiting_clarification";
    } else if (!result.reply.shouldEditSheet) {
      this.upsertTranscriptMessage(responseEntry, {
        text: result.reply.message,
      });
      this.potentialRestorePoints.delete(workflowId);
      this.chatState.fsmState = "answered";
    } else if (result.reply.createNewSheet) {
      this.upsertTranscriptMessage(responseEntry, {
        text: result.reply.message,
      });
      await this.createScenarioWithComparison(
        message,
        workflowId,
        originalSheet,
        result.reply.cellEdits,
        result.reply.comparisonRanges,
        this.chatState.llmConversationMessages
      );
      this.potentialRestorePoints.delete(workflowId);
      this.chatState.fsmState = "answered";
    } else {
      this.upsertTranscriptMessage(responseEntry, {
        text: result.reply.message,
      });
      const diff = await this.createNextDiffSheet(originalSheet, result.reply.cellEdits);
      this.chatState.pendingEdit = {
        sourceSheetName: originalSheet.name,
        diffSheetName: diff.sheetName,
        workflowId,
      };
      this.chatState.fsmState = "pending_edit";
      this.appendDiffReviewTranscriptItem(workflowId);
    }
  }

  private async runPreprocessWorkflow(message: string, workflowId: number): Promise<void> {
    const originalSheet = await readActiveSheet(this.excelApi);
    this.setupPreprocessTransition(message, workflowId, originalSheet);
    let cellEdits: CellEdit[] | undefined;
    for await (const event of runPreprocessPrompt(originalSheet)) {
      if (event.type === "detection_complete") {
        this.appendMessage("system", formatFormulaInferencePlan(event), workflowId);
      } else if (event.type === "region_complete") {
        this.appendMessage("system", formatFormulaInferenceRegionResult(event), workflowId);
      } else if (event.type === "complete") {
        cellEdits = event.cellEdits;
      }
    }
    this.removeWorkingTranscriptItem(workflowId);
    await this.finalizePreprocessTransition(workflowId, originalSheet, cellEdits!);
  }

  private setupPreprocessTransition(
    message: string,
    workflowId: number,
    originalSheet: SheetSnapshot
  ): void {
    this.createPotentialRestorePoint(workflowId, originalSheet);
    this.appendMessage("human", message, workflowId);
    this.appendWorkingTranscriptItem("Analyzing worksheet..", workflowId);
    this.chatState.preprocessedSheetNames.push(originalSheet.name);
    this.renderChatTranscript();
  }

  private async finalizePreprocessTransition(
    workflowId: number,
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<void> {
    if (cellEdits.length > 0) {
      this.appendMessage(
        "system",
        "**Completed formula inference. Please review the inferred formulas (highlighted)**",
        workflowId
      );
      const diff = await this.createNextDiffSheet(originalSheet, cellEdits);
      this.chatState.pendingEdit = {
        sourceSheetName: originalSheet.name,
        diffSheetName: diff.sheetName,
        workflowId,
      };
      this.chatState.fsmState = "pending_edit_preprocessed";
      this.appendDiffReviewTranscriptItem(workflowId);
    } else {
      await this.runSubmitMessageWorkflow(
        this.getWorkflowHumanMessage(workflowId),
        workflowId,
        false
      );
    }
  }

  private async appendUpdateAnalysis(
    userRequest: string,
    workflowId: number,
    originalSheet: SheetSnapshot,
    updatedSheetName: string
  ): Promise<void> {
    this.appendWorkingTranscriptItem("Analyzing accepted changes...", workflowId);
    this.renderChatTranscript();
    try {
      const updatedSheet = await readSheet(this.excelApi, updatedSheetName);
      const analysis = await runUpdateAnalysisPrompt(
        userRequest,
        originalSheet,
        updatedSheet,
        this.chatState.llmConversationMessages
      );
      this.removeWorkingTranscriptItem(workflowId);
      this.appendMessage("system", analysis, workflowId);
      this.appendAssistantLlmMessage(analysis, workflowId);
    } catch (err) {
      console.debug("OpenRouter update analysis request failed.", err);
      this.removeWorkingTranscriptItem(workflowId);
      this.renderChatTranscript();
    }
  }

  private async acceptPendingDiff(): Promise<void> {
    const pendingEdit = this.chatState.pendingEdit!;
    const shouldAnalyzeUpdate = this.chatState.fsmState === "pending_edit";
    const userRequest = this.getWorkflowHumanMessage(pendingEdit.workflowId);
    const originalSheet = this.potentialRestorePoints.get(pendingEdit.workflowId)!.sheet;
    await this.setupAcceptPendingDiff(pendingEdit);
    await this.performAcceptPendingDiffActions(pendingEdit);
    await this.finalizeAcceptPendingDiff(pendingEdit);
    if (shouldAnalyzeUpdate) {
      await this.appendUpdateAnalysis(
        userRequest,
        pendingEdit.workflowId,
        originalSheet,
        pendingEdit.sourceSheetName
      );
    }
  }

  private async setupAcceptPendingDiff(pendingEdit: PendingEdit): Promise<void> {
    this.removeDiffReviewTranscriptItem(pendingEdit.workflowId);
    this.appendWorkingTranscriptItem("Applying changes...", pendingEdit.workflowId);
    this.renderChatTranscript();
  }

  private async performAcceptPendingDiffActions(pendingEdit: PendingEdit): Promise<void> {
    const diffSheet = await readSheet(this.excelApi, pendingEdit.diffSheetName);
    await writeSheetFormulas(
      this.excelApi,
      retargetFormulaSheetReferences(diffSheet, pendingEdit.sourceSheetName)
    );
    await deleteDiffSheet(this.excelApi, pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
  }

  private async finalizeAcceptPendingDiff(pendingEdit: PendingEdit): Promise<void> {
    const shouldContinueOriginalQuery = this.chatState.fsmState === "pending_edit_preprocessed";
    const restorePoint = this.potentialRestorePoints.get(pendingEdit.workflowId)!;
    this.potentialRestorePoints.delete(pendingEdit.workflowId);
    this.restorePoints.push(restorePoint);
    this.chatState.pendingEdit = undefined;
    this.chatState.fsmState = "answered";

    this.removeWorkingTranscriptItem(pendingEdit.workflowId);
    this.insertRestoreTranscriptItem(restorePoint, pendingEdit.workflowId);
    this.appendMessage("system", "Accepted changes.", pendingEdit.workflowId);
    this.appendUserDecisionLlmMessage("Accepted changes.", pendingEdit.workflowId);

    if (shouldContinueOriginalQuery) {
      this.appendMessage("system", "Continuing with original query.", pendingEdit.workflowId);
      await this.runSubmitMessageWorkflow(
        this.getWorkflowHumanMessage(pendingEdit.workflowId),
        pendingEdit.workflowId,
        false
      );
    }
  }

  private async rejectPendingDiff(): Promise<void> {
    const pendingEdit = this.chatState.pendingEdit!;
    await this.setupRejectPendingDiff(pendingEdit);
    await this.performRejectPendingDiffActions(pendingEdit);
    await this.finalizeRejectPendingDiff(pendingEdit);
  }

  private async setupRejectPendingDiff(pendingEdit: PendingEdit): Promise<void> {
    this.removeDiffReviewTranscriptItem(pendingEdit.workflowId);
    this.appendWorkingTranscriptItem("Rejecting changes...", pendingEdit.workflowId);
    this.renderChatTranscript();
  }

  private async performRejectPendingDiffActions(pendingEdit: PendingEdit): Promise<void> {
    await deleteDiffSheet(this.excelApi, pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
  }

  private async finalizeRejectPendingDiff(pendingEdit: PendingEdit): Promise<void> {
    const shouldContinueOriginalQuery = this.chatState.fsmState === "pending_edit_preprocessed";
    this.potentialRestorePoints.delete(pendingEdit.workflowId);
    this.chatState.pendingEdit = undefined;
    this.chatState.fsmState = "answered";

    this.removeWorkingTranscriptItem(pendingEdit.workflowId);
    this.appendMessage("system", "Rejected changes.", pendingEdit.workflowId);
    this.appendUserDecisionLlmMessage("Rejected changes.", pendingEdit.workflowId);

    if (shouldContinueOriginalQuery) {
      this.appendMessage("system", "Continuing with original query.", pendingEdit.workflowId);
      await this.runSubmitMessageWorkflow(
        this.getWorkflowHumanMessage(pendingEdit.workflowId),
        pendingEdit.workflowId,
        false
      );
    }
  }

  private async restoreToPoint(restorePointId: number): Promise<void> {
    const restorePointIndex = this.restorePoints.findIndex(
      (restorePoint) => restorePoint.id === restorePointId
    );
    const restorePoint = this.restorePoints[restorePointIndex]!;
    if (this.chatState.pendingEdit) {
      await deleteDiffSheet(
        this.excelApi,
        this.chatState.pendingEdit.sourceSheetName,
        this.chatState.pendingEdit.diffSheetName
      );
    }

    await writeSheetFormulas(this.excelApi, restorePoint.sheet);
    this.potentialRestorePoints.clear();
    this.chatState = this.copyChatState(restorePoint.chatState);
    this.restorePoints.length = restorePointIndex;
  }

  private async createNextDiffSheet(originalSheet: SheetSnapshot, cellEdits: CellEdit[]) {
    const diff = await createDiffSheet(
      this.excelApi,
      this.nextDiffSheetNumber,
      originalSheet,
      cellEdits
    );
    this.nextDiffSheetNumber++;
    return diff;
  }

  private async createNextScenarioSheet(
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<string> {
    const sheetName = await createScenarioSheet(
      this.excelApi,
      this.nextScenarioSheetNumber,
      originalSheet,
      cellEdits
    );
    this.nextScenarioSheetNumber++;
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
    if (this.chatState.preprocessedSheetNames.includes(originalSheet.name)) {
      this.chatState.preprocessedSheetNames.push(scenarioSheetName);
    }
    const scenarioSheet = await readSheet(this.excelApi, scenarioSheetName);
    this.appendWorkingTranscriptItem(
      "Creating comparison between new scenario against baseline...",
      workflowId
    );
    this.renderChatTranscript();
    const comparison = await runScenarioComparisonPrompt(
      userRequest,
      originalSheet,
      scenarioSheet,
      comparisonRanges,
      llmConversationMessages
    );
    await applyCellEditsToSheet(this.excelApi, scenarioSheet, comparison.cellEdits);
    this.removeWorkingTranscriptItem(workflowId);
    this.appendMessage("system", comparison.analysis, workflowId);
    this.appendAssistantLlmMessage(comparison.analysis, workflowId);
  }

  private disableChatControls(): void {
    this.chatState.transcript.forEach((entry) => {
      if (entry.kind === "restore" || entry.kind === "diff_review") {
        entry.disabled = true;
      }
    });
    this.rootElement.querySelector<HTMLInputElement>("#chat-input")!.disabled = true;
    this.rootElement.querySelector<HTMLButtonElement>("#chat-send")!.disabled = true;
    this.renderChatTranscript();
  }

  private configChatControls(): void {
    this.chatState.transcript.forEach((entry) => {
      if (entry.kind === "restore" || entry.kind === "diff_review") {
        entry.disabled = false;
      }
    });
    this.renderChatTranscript();
    const isPendingEdit =
      this.chatState.fsmState === "pending_edit" ||
      this.chatState.fsmState === "pending_edit_preprocessed";

    this.rootElement.querySelector<HTMLInputElement>("#chat-input")!.disabled = isPendingEdit;
    this.rootElement.querySelector<HTMLButtonElement>("#chat-send")!.disabled = isPendingEdit;
  }

  private renderChatTranscript(): void {
    const messages = this.rootElement.querySelector<HTMLElement>("#chat-messages")!;

    messages.innerHTML = "";
    this.buildChatTranscript().forEach((entry) => {
      if (entry.kind === "restore") {
        messages.appendChild(this.createRestoreDivider(entry.restorePointId, entry.disabled));
      }
      if (entry.kind === "message") {
        messages.appendChild(this.createChatMessage(entry));
      }
      if (entry.kind === "diff_review") {
        messages.appendChild(this.createDiffReviewDivider(entry.disabled));
      }
      if (entry.kind === "working") {
        messages.appendChild(this.createWorkingMessage(entry));
      }
    });
    messages.scrollTop = messages.scrollHeight;
  }

  private buildChatTranscript(): ChatTranscriptEntry[] {
    return structuredClone(this.chatState.transcript);
  }

  private createChatMessage(entry: ChatMessageTranscriptItem): HTMLElement {
    const message = document.createElement("div");
    const label = document.createElement("div");
    const body = document.createElement("div");

    message.className = `chat-message ${entry.source}`;
    label.className = "chat-message-source";
    label.textContent = entry.source;
    body.className = "chat-message-text";
    if (entry.source === "human") {
      body.textContent = entry.text;
    }
    if (entry.source === "system") {
      body.innerHTML = DOMPurify.sanitize(marked.parse(entry.text, { async: false }), {
        USE_PROFILES: { html: true },
      });
    }
    message.appendChild(label);
    message.appendChild(body);
    return message;
  }

  private createWorkingMessage(
    entry: Extract<ChatTranscriptEntry, { kind: "working" }>
  ): HTMLElement {
    const message = document.createElement("div");
    const label = document.createElement("div");
    const body = document.createElement("div");
    const indicator = document.createElement("span");

    message.className = `chat-message ${entry.source}`;
    label.className = "chat-message-source";
    label.textContent = entry.source;
    body.className = "chat-message-text chat-working";
    body.textContent = entry.text;
    body.setAttribute("role", "status");
    indicator.className = "chat-working-indicator";
    indicator.setAttribute("aria-hidden", "true");
    body.prepend(indicator);
    message.appendChild(label);
    message.appendChild(body);
    return message;
  }

  private createRestoreDivider(restorePointId: number, disabled: boolean): HTMLElement {
    const divider = document.createElement("div");
    const line = document.createElement("div");
    const restoreButton = document.createElement("button");

    divider.className = "chat-restore-divider";
    line.className = "chat-restore-line";
    restoreButton.className = "btn btn-secondary btn-compact chat-message-restore";
    restoreButton.type = "button";
    restoreButton.disabled = disabled;
    restoreButton.textContent = "Restore";
    restoreButton.onclick = () => {
      void this.updateState({ type: "restore_to_point", restorePointId });
    };
    divider.appendChild(line);
    divider.appendChild(restoreButton);
    return divider;
  }

  private createDiffReviewDivider(disabled: boolean): HTMLElement {
    const divider = document.createElement("div");
    const line = document.createElement("div");
    const acceptButton = document.createElement("button");
    const rejectButton = document.createElement("button");

    divider.className = "chat-restore-divider";
    line.className = "chat-restore-line";
    acceptButton.className = "btn btn-secondary btn-compact chat-diff-action";
    acceptButton.type = "button";
    acceptButton.disabled = disabled;
    acceptButton.textContent = "Accept";
    acceptButton.onclick = () => {
      void this.updateState({ type: "accept_pending_diff" });
    };
    rejectButton.className = "btn btn-secondary btn-compact chat-diff-action";
    rejectButton.type = "button";
    rejectButton.disabled = disabled;
    rejectButton.textContent = "Reject";
    rejectButton.onclick = () => {
      void this.updateState({ type: "reject_pending_diff" });
    };
    divider.appendChild(line);
    divider.appendChild(acceptButton);
    divider.appendChild(rejectButton);
    return divider;
  }

  private appendErrorMessage(message: string) {
    if (this.chatState.pendingEdit) {
      this.chatState.transcript = this.chatState.transcript.filter(
        (entry) =>
          entry.workflowId !== this.chatState.pendingEdit!.workflowId ||
          (entry.kind !== "diff_review" && entry.kind !== "working")
      );
    } else {
      this.chatState.transcript = this.chatState.transcript.filter(
        (entry) => entry.kind !== "working"
      );
    }
    this.chatState.fsmState = "errored";
    this.appendMessage("system", message, 0);
  }

  private validateInputForCurrentState(input: ChatStateMachineInput) {
    if (input.type === "submit_message") {
      if (
        !this.isTerminalTurnState(this.chatState.fsmState) &&
        this.chatState.fsmState !== "awaiting_clarification"
      ) {
        throw new Error(
          `Cannot submit a chat message while the chat state is ${this.chatState.fsmState}.`
        );
      }
      return;
    }

    if (input.type === "accept_pending_diff") {
      if (!this.isPendingEditState(this.chatState.fsmState)) {
        throw new Error("Cannot accept changes unless the latest turn is pending_edit.");
      }
      return;
    }

    if (input.type === "reject_pending_diff") {
      if (!this.isPendingEditState(this.chatState.fsmState)) {
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

  private appendMessage(
    source: "human" | "system",
    text: string,
    workflowId: number
  ): ChatMessageTranscriptItem {
    const entry: ChatMessageTranscriptItem = {
      kind: "message",
      source,
      text,
      workflowId,
    };
    this.chatState.transcript.push(entry);
    this.renderChatTranscript();
    return entry;
  }

  private upsertTranscriptMessage(
    entry: ChatMessageTranscriptItem,
    update: Partial<Pick<ChatMessageTranscriptItem, "text">>
  ) {
    if (!this.hasTranscriptMessage(entry)) {
      this.chatState.transcript.push(entry);
    }
    Object.assign(entry, update);
    this.renderChatTranscript();
  }

  private hasTranscriptMessage(entry: ChatMessageTranscriptItem): boolean {
    return this.chatState.transcript.some(
      (transcriptEntry) =>
        transcriptEntry.kind === "message" &&
        transcriptEntry.workflowId === entry.workflowId &&
        transcriptEntry === entry
    );
  }

  private insertRestoreTranscriptItem(restorePoint: RestorePoint, workflowId: number) {
    this.chatState.transcript.splice(restorePoint.chatState.transcript.length, 0, {
      kind: "restore",
      restorePointId: restorePoint.id,
      workflowId,
      disabled: true,
    });
    this.renderChatTranscript();
  }

  private appendDiffReviewTranscriptItem(workflowId: number) {
    this.chatState.transcript.push({
      kind: "diff_review",
      workflowId,
      disabled: true,
    });
    this.renderChatTranscript();
  }

  private removeDiffReviewTranscriptItem(workflowId: number) {
    const entryIndex = this.chatState.transcript.findIndex(
      (entry) => entry.kind === "diff_review" && entry.workflowId === workflowId
    );
    this.chatState.transcript.splice(entryIndex, 1);
  }

  private appendWorkingTranscriptItem(text: string, workflowId: number) {
    this.chatState.transcript.push({
      kind: "working",
      source: "system",
      text,
      workflowId,
    });
  }

  private removeWorkingTranscriptItem(workflowId: number) {
    this.chatState.transcript = this.chatState.transcript.filter(
      (entry) => entry.kind !== "working" || entry.workflowId !== workflowId
    );
  }

  private updateWorkingTranscriptItem(text: string, workflowId: number) {
    const entryIndex = this.chatState.transcript.findIndex(
      (entry) => entry.kind === "working" && entry.workflowId === workflowId
    );
    const [entry] = this.chatState.transcript.splice(entryIndex, 1) as ChatWorkingTranscriptItem[];
    entry.text = text;
    this.chatState.transcript.push(entry);
    this.renderChatTranscript();
  }

  private appendUserDecisionLlmMessage(text: string, workflowId: number) {
    this.chatState.llmConversationMessages = [
      ...this.chatState.llmConversationMessages,
      { role: "user", text, workflowId },
    ];
  }

  private appendAssistantLlmMessage(text: string, workflowId: number) {
    this.chatState.llmConversationMessages = [
      ...this.chatState.llmConversationMessages,
      { role: "assistant", text, workflowId },
    ];
  }

  private getWorkflowHumanMessage(workflowId: number): string {
    return (
      this.chatState.transcript.find(
        (entry) =>
          entry.kind === "message" && entry.source === "human" && entry.workflowId === workflowId
      ) as ChatMessageTranscriptItem
    ).text;
  }

  private createRestorePoint(sheet: SheetSnapshot): RestorePoint {
    const restorePoint: RestorePoint = {
      id: this.nextRestorePointId,
      chatState: this.copyChatState(this.chatState),
      sheet: this.copySheetSnapshot(sheet),
    };
    this.nextRestorePointId++;
    return restorePoint;
  }

  private createPotentialRestorePoint(workflowId: number, sheet: SheetSnapshot): void {
    this.potentialRestorePoints.set(workflowId, this.createRestorePoint(sheet));
  }

  private copyChatState(chatState: ChatState): ChatState {
    return {
      transcript: structuredClone(chatState.transcript),
      llmConversationMessages: [...chatState.llmConversationMessages],
      fsmState: chatState.fsmState,
      pendingEdit: chatState.pendingEdit ? this.copyPendingEdit(chatState.pendingEdit) : undefined,
      preprocessedSheetNames: [...chatState.preprocessedSheetNames],
    };
  }

  private copyPendingEdit(pendingEdit: PendingEdit): PendingEdit {
    return {
      sourceSheetName: pendingEdit.sourceSheetName,
      diffSheetName: pendingEdit.diffSheetName,
      workflowId: pendingEdit.workflowId,
    };
  }

  private copySheetSnapshot(sheet: SheetSnapshot): SheetSnapshot {
    return {
      name: sheet.name,
      values: sheet.values.map((row) => [...row]),
      formulas: sheet.formulas.map((row) => [...row]),
      rowIndex: sheet.rowIndex,
      columnIndex: sheet.columnIndex,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
    };
  }

  private createInitialDom(): HTMLElement {
    const element = document.createElement("div");
    const messages = cloneChatPageElement<HTMLElement>("#chat-messages");
    const form = cloneChatPageElement<HTMLFormElement>("#chat-form");
    const clearButton = cloneChatPageElement<HTMLButtonElement>("#chat-clear");
    const input = form.querySelector<HTMLInputElement>("#chat-input")!;

    element.id = "chat-transcript";
    element.className = "chat-transcript";
    clearButton.onclick = () => {
      void this.updateState({ type: "clear" });
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const message = input.value;

      void this.updateState({ type: "submit_message", message });
    };
    form.prepend(clearButton);
    element.append(messages, form);
    this.mount.replaceChildren(element);

    return element;
  }
}

function formatFormulaInferencePlan(event: FormulaInferenceDetectionEvent): string {
  let message = `**Formula inference:** ${
    event.plan.shouldInferFormulas ? "Required" : "Not required"
  }\n\n${event.plan.summary}\n\n**Confidence:** ${event.plan.confidence}`;
  if (event.plan.regions.length > 0) {
    message += `\n\n**Inference plan**\n\n${event.plan.regions
      .map(
        (region) =>
          `- \`${region.targetRange}\` — ${region.relationship}\n  - Structure: ${region.structure}\n  - Sources: ${region.sourceRanges.join(", ")}\n  - Evidence: ${region.evidenceCells.join(", ")}`
      )
      .join("\n")}`;
  }
  return message;
}

function formatFormulaInferenceRegionResult(event: FormulaInferenceRegionEvent): string {
  return `**Formula inference complete: \`${event.region.targetRange}\`**

Generated ${event.cellEditCount} formula edits.`;
}
