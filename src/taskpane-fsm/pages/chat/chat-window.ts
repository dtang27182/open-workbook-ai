/* global console, HTMLInputElement, HTMLElement */

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
  ComparisonRange,
  ExcelApi,
  LlmConversationHistory,
  PendingEdit,
  RestorePoint,
  SheetSnapshot,
  SpreadsheetPromptCompletionEvent,
} from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import {
  formatFormulaInferencePlan,
  formatFormulaInferenceRegionResult,
} from "../../../taskpane/pages/chat/chat-state-machine/preprocess-formula-inference";
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
  insertRestoreTranscriptItemAndRender,
  removeDiffReviewTranscriptItem,
  removeWorkingTranscriptItem,
  updateWorkingTranscriptItemAndRender,
  upsertTranscriptMessageAndRender,
} from "./chat-window-transcript-helpers";
import { copyChatState, createRestorePoint } from "./chat-window-restore-point-helpers";

const preprocessingEnabled = true;

export type ChatWindowUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export class ChatWindow implements Component<ChatWindowUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly excelApi: ExcelApi;
  private readonly domHandlers: ChatWindowDomHandlers = {
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
    createInitialDom(this.mount, this.domHandlers);
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
    configChatControls(
      this.mount,
      this.chatState.transcript,
      this.chatState.fsmState,
      this.domHandlers
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
      disableChatControls(this.mount, this.chatState.transcript, this.domHandlers);
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
        configChatControls(
          this.mount,
          this.chatState.transcript,
          this.chatState.fsmState,
          this.domHandlers
        );
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
    appendMessageAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      "human",
      answer,
      workflowId
    );
    appendWorkingTranscriptItem(this.chatState.transcript, "Working...", workflowId);
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
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
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          responseEntry,
          { text: event.text }
        );
      }

      if (event.type === "creating_proposed_change") {
        updateWorkingTranscriptItemAndRender(
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          "Creating proposed change...",
          workflowId
        );
      }

      if (event.type === "creating_scenario_sheet") {
        updateWorkingTranscriptItemAndRender(
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          "Creating new sheet to model scenario...",
          workflowId
        );
      }

      if (event.type === "clarification_requested" || event.type === "complete") {
        completionEvent = event;
      }
    }
    removeWorkingTranscriptItem(this.chatState.transcript, workflowId);

    return completionEvent!;
  }

  private async submitMessage(message: string): Promise<void> {
    this.mount.querySelector<HTMLInputElement>("#chat-input")!.value = "";
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
      appendMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        "human",
        message,
        workflowId
      );
    }
    appendWorkingTranscriptItem(this.chatState.transcript, "Working...", workflowId);
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
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
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          responseEntry,
          { text: event.text }
        );
      }

      if (event.type === "creating_proposed_change") {
        updateWorkingTranscriptItemAndRender(
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          "Creating proposed change...",
          workflowId
        );
      }

      if (event.type === "creating_scenario_sheet") {
        updateWorkingTranscriptItemAndRender(
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          "Creating new sheet to model scenario...",
          workflowId
        );
      }

      if (event.type === "clarification_requested" || event.type === "complete") {
        completionEvent = event;
      }
    }
    removeWorkingTranscriptItem(this.chatState.transcript, workflowId);

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
      upsertTranscriptMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        responseEntry,
        { text: result.question }
      );
      this.chatState.fsmState = "awaiting_clarification";
    } else if (!result.reply.shouldEditSheet) {
      upsertTranscriptMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        responseEntry,
        { text: result.reply.message }
      );
      this.potentialRestorePoints.delete(workflowId);
      this.chatState.fsmState = "answered";
    } else if (result.reply.createNewSheet) {
      upsertTranscriptMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        responseEntry,
        { text: result.reply.message }
      );
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
      upsertTranscriptMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        responseEntry,
        { text: result.reply.message }
      );
      const diff = await this.createNextDiffSheet(originalSheet, result.reply.cellEdits);
      this.chatState.pendingEdit = {
        sourceSheetName: originalSheet.name,
        diffSheetName: diff.sheetName,
        workflowId,
      };
      this.chatState.fsmState = "pending_edit";
      appendDiffReviewTranscriptItemAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        workflowId
      );
    }
  }

  private async runPreprocessWorkflow(message: string, workflowId: number): Promise<void> {
    const originalSheet = await readActiveSheet(this.excelApi);
    this.setupPreprocessTransition(message, workflowId, originalSheet);
    let cellEdits: CellEdit[] | undefined;
    for await (const event of runPreprocessPrompt(originalSheet)) {
      if (event.type === "detection_complete") {
        appendMessageAndRender(
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          "system",
          formatFormulaInferencePlan(event.plan),
          workflowId
        );
      } else if (event.type === "region_complete") {
        appendMessageAndRender(
          this.mount,
          this.chatState.transcript,
          this.domHandlers,
          "system",
          formatFormulaInferenceRegionResult(event.region, event.cellEditCount),
          workflowId
        );
      } else if (event.type === "complete") {
        cellEdits = event.cellEdits;
      }
    }
    removeWorkingTranscriptItem(this.chatState.transcript, workflowId);
    await this.finalizePreprocessTransition(workflowId, originalSheet, cellEdits!);
  }

  private setupPreprocessTransition(
    message: string,
    workflowId: number,
    originalSheet: SheetSnapshot
  ): void {
    this.createPotentialRestorePoint(workflowId, originalSheet);
    appendMessageAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      "human",
      message,
      workflowId
    );
    appendWorkingTranscriptItem(this.chatState.transcript, "Analyzing worksheet..", workflowId);
    this.chatState.preprocessedSheetNames.push(originalSheet.name);
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
  }

  private async finalizePreprocessTransition(
    workflowId: number,
    originalSheet: SheetSnapshot,
    cellEdits: CellEdit[]
  ): Promise<void> {
    if (cellEdits.length > 0) {
      appendMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
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
      appendDiffReviewTranscriptItemAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        workflowId
      );
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
    appendWorkingTranscriptItem(
      this.chatState.transcript,
      "Analyzing accepted changes...",
      workflowId
    );
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
    try {
      const updatedSheet = await readSheet(this.excelApi, updatedSheetName);
      const analysis = await runUpdateAnalysisPrompt(
        userRequest,
        originalSheet,
        updatedSheet,
        this.chatState.llmConversationMessages
      );
      removeWorkingTranscriptItem(this.chatState.transcript, workflowId);
      appendMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        "system",
        analysis,
        workflowId
      );
      this.appendAssistantLlmMessage(analysis, workflowId);
    } catch (err) {
      console.debug("OpenRouter update analysis request failed.", err);
      removeWorkingTranscriptItem(this.chatState.transcript, workflowId);
      renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
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
    removeDiffReviewTranscriptItem(this.chatState.transcript, pendingEdit.workflowId);
    appendWorkingTranscriptItem(
      this.chatState.transcript,
      "Applying changes...",
      pendingEdit.workflowId
    );
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
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

    removeWorkingTranscriptItem(this.chatState.transcript, pendingEdit.workflowId);
    insertRestoreTranscriptItemAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      restorePoint,
      pendingEdit.workflowId
    );
    appendMessageAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      "system",
      "Accepted changes.",
      pendingEdit.workflowId
    );
    this.appendUserDecisionLlmMessage("Accepted changes.", pendingEdit.workflowId);

    if (shouldContinueOriginalQuery) {
      appendMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        "system",
        "Continuing with original query.",
        pendingEdit.workflowId
      );
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
    removeDiffReviewTranscriptItem(this.chatState.transcript, pendingEdit.workflowId);
    appendWorkingTranscriptItem(
      this.chatState.transcript,
      "Rejecting changes...",
      pendingEdit.workflowId
    );
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
  }

  private async performRejectPendingDiffActions(pendingEdit: PendingEdit): Promise<void> {
    await deleteDiffSheet(this.excelApi, pendingEdit.sourceSheetName, pendingEdit.diffSheetName);
  }

  private async finalizeRejectPendingDiff(pendingEdit: PendingEdit): Promise<void> {
    const shouldContinueOriginalQuery = this.chatState.fsmState === "pending_edit_preprocessed";
    this.potentialRestorePoints.delete(pendingEdit.workflowId);
    this.chatState.pendingEdit = undefined;
    this.chatState.fsmState = "answered";

    removeWorkingTranscriptItem(this.chatState.transcript, pendingEdit.workflowId);
    appendMessageAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      "system",
      "Rejected changes.",
      pendingEdit.workflowId
    );
    this.appendUserDecisionLlmMessage("Rejected changes.", pendingEdit.workflowId);

    if (shouldContinueOriginalQuery) {
      appendMessageAndRender(
        this.mount,
        this.chatState.transcript,
        this.domHandlers,
        "system",
        "Continuing with original query.",
        pendingEdit.workflowId
      );
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
    this.chatState = copyChatState(restorePoint.chatState);
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
    appendWorkingTranscriptItem(
      this.chatState.transcript,
      "Creating comparison between new scenario against baseline...",
      workflowId
    );
    renderChatTranscript(this.mount, this.chatState.transcript, this.domHandlers);
    const comparison = await runScenarioComparisonPrompt(
      userRequest,
      originalSheet,
      scenarioSheet,
      comparisonRanges,
      llmConversationMessages
    );
    await applyCellEditsToSheet(this.excelApi, scenarioSheet, comparison.cellEdits);
    removeWorkingTranscriptItem(this.chatState.transcript, workflowId);
    appendMessageAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      "system",
      comparison.analysis,
      workflowId
    );
    this.appendAssistantLlmMessage(comparison.analysis, workflowId);
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
    appendMessageAndRender(
      this.mount,
      this.chatState.transcript,
      this.domHandlers,
      "system",
      message,
      0
    );
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

  private createPotentialRestorePoint(workflowId: number, sheet: SheetSnapshot): void {
    const restorePoint = createRestorePoint(this.nextRestorePointId, this.chatState, sheet);
    this.nextRestorePointId++;
    this.potentialRestorePoints.set(workflowId, restorePoint);
  }
}
