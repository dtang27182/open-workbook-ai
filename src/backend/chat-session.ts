/* global console, structuredClone */

import {
  ChatSessionState,
  type ChatWorkflowStateVals,
  type PendingEdit,
} from "./chat-session-state";
import { ProviderManager } from "./provider-manager";
import { ExcelManager, type ExcelApi } from "./excel-manager";
import { LLMManager } from "./llm/llm-manager";
import type { MainModelOption } from "./llm/main-model-options";
import type { FormulaInferencePlan } from "./llm/preprocess-formula-inference";
import { appendMessage } from "./transcript-helpers";
import { runAcceptDiffWorkflow } from "./workflows/accept-diff";
import { runClarificationWorkflow } from "./workflows/clarification";
import { runPreprocessWorkflow } from "./workflows/preprocess";
import { runRejectDiffWorkflow } from "./workflows/reject-diff";
import { runRestoreWorkflow } from "./workflows/restore";
import { runSubmitMessageWorkflow } from "./workflows/submit-message";

export { acquireOpenRouterApiKey } from "./openrouter-3p-auth/openrouter-key-exchange";

export type ModelProvider = "openai" | "openrouter";
export type MainModelId = MainModelOption["config"]["model"];

export type ChatTranscriptSource = "human" | "system";

export type ChatFormulaInferenceTranscriptItem = {
  kind: "formula_inference";
  plan: FormulaInferencePlan;
  workflowId: number;
};

export type ChatMessagePresentation = {
  kind: "edit_decision";
  decision: "accepted" | "rejected";
  sourceSheetName: string;
};

export type ChatTranscriptItem =
  | ChatFormulaInferenceTranscriptItem
  | {
      kind: "message";
      source: ChatTranscriptSource;
      text: string;
      workflowId: number;
      presentation?: ChatMessagePresentation;
    }
  | {
      kind: "restore";
      restorePointId: number;
      workflowId: number;
    }
  | {
      kind: "working";
      source: "system";
      text: string;
      workflowId: number;
    };

export type ChatTranscriptEntry = ChatTranscriptItem;

export type ChatMessageTranscriptItem = Extract<ChatTranscriptItem, { kind: "message" }>;

export type ChatWorkingTranscriptItem = Extract<ChatTranscriptItem, { kind: "working" }>;

export type ReadonlySnapshot<T> = { readonly [K in keyof T]: ReadonlySnapshot<T[K]> };

export type ChatModelOption = {
  readonly label: string;
  readonly modelId: MainModelId;
};

export type ChatSessionSnapshot = ReadonlySnapshot<{
  transcript: ChatTranscriptItem[];
  workflowState: ChatWorkflowStateVals;
  actionRunning: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canRestore: boolean;
  pendingEdit?: PendingEdit;
  reviewSheetName?: string;
  restorePoints: { id: number; sheetName: string }[];
  provider: ModelProvider | undefined;
  modelOptions: ChatModelOption[];
  selectedModelId: MainModelId | undefined;
}>;

const preprocessingEnabled = false;

type ChatAction =
  | { type: "submit_message"; message: string }
  | { type: "accept_pending_diff" }
  | { type: "reject_pending_diff" }
  | { type: "restore_to_point"; restorePointId: number };

export class ChatSession {
  private readonly state: ChatSessionState;
  private readonly providerManager: ProviderManager;
  private actionRunning = false;

  constructor(providerManager = new ProviderManager(), excelApi?: ExcelApi) {
    this.providerManager = providerManager;
    this.state = new ChatSessionState(new ExcelManager(excelApi), new LLMManager(providerManager));
    this.resetChat();
  }

  getSessionSnapshot(): ChatSessionSnapshot {
    const pendingReview =
      this.state.chatState.workflowState === "pending_edit" ||
      this.state.chatState.workflowState === "pending_edit_preprocessed";
    return structuredClone({
      transcript: this.state.chatState.transcript,
      workflowState: this.state.chatState.workflowState,
      actionRunning: this.actionRunning,
      canSubmit: !this.actionRunning && !pendingReview,
      canReview: !this.actionRunning && pendingReview,
      canRestore: !this.actionRunning,
      pendingEdit: this.state.chatState.pendingEdit,
      reviewSheetName: pendingReview ? this.state.chatState.pendingEdit!.diffSheetName : undefined,
      restorePoints: this.state.restoreManager.getRestorePointSummaries(),
      provider: this.providerManager.getProvider()?.provider,
      modelOptions: this.providerManager.getModelOptions().map((option) => ({
        label: option.label,
        modelId: option.config.model,
      })),
      selectedModelId:
        this.providerManager.getProvider() === undefined
          ? undefined
          : this.providerManager.getModel().config.model,
    });
  }

  getProviderStatus(): { provider: ModelProvider; keySuffix: string } | undefined {
    const active = this.providerManager.getProvider();
    if (active !== undefined) {
      return { provider: active.provider, keySuffix: active.keyStore.get().slice(-4) };
    }
  }

  signIn(provider: ModelProvider, apiKey: string): void {
    this.providerManager.signIn(provider, apiKey);
  }

  signOut(): void {
    this.providerManager.signOut();
  }

  resetChat(): void {
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
  }

  setModel(model: MainModelId): void {
    this.providerManager.setModel(model);
  }

  submitMessage(message: string): AsyncIterable<ChatSessionSnapshot> {
    return this.startAction({ type: "submit_message", message });
  }

  acceptPendingDiff(): AsyncIterable<ChatSessionSnapshot> {
    return this.startAction({ type: "accept_pending_diff" });
  }

  rejectPendingDiff(): AsyncIterable<ChatSessionSnapshot> {
    return this.startAction({ type: "reject_pending_diff" });
  }

  restoreToPoint(restorePointId: number): AsyncIterable<ChatSessionSnapshot> {
    return this.startAction({ type: "restore_to_point", restorePointId });
  }

  private startAction(action: ChatAction): AsyncIterable<ChatSessionSnapshot> {
    // Expose busy state immediately so the UI can disable controls before its first await.
    this.actionRunning = true;
    return this.runAction(action);
  }

  private async *runAction(action: ChatAction): AsyncIterable<ChatSessionSnapshot> {
    try {
      yield this.getSessionSnapshot();
      this.validateAction(action);
      if (action.type === "submit_message") {
        for await (const update of this.runSubmitMessage(action.message)) {
          void update;
          yield this.getSessionSnapshot();
        }
      } else if (action.type === "accept_pending_diff") {
        for await (const update of runAcceptDiffWorkflow(this.state)) {
          void update;
          yield this.getSessionSnapshot();
        }
      } else if (action.type === "reject_pending_diff") {
        for await (const update of runRejectDiffWorkflow(this.state)) {
          void update;
          yield this.getSessionSnapshot();
        }
      } else if (action.type === "restore_to_point") {
        await runRestoreWorkflow(this.state, action.restorePointId);
      }
    } catch (error) {
      console.debug(error);
      const messages = {
        submit_message:
          "I could not get an assistant response. Check the active worksheet and OpenRouter configuration, then ask again.",
        accept_pending_diff: "I could not accept the changes.",
        reject_pending_diff: "I could not reject the changes.",
        restore_to_point: "I could not restore the sheet.",
      };
      this.appendErrorMessage(messages[action.type]);
    } finally {
      this.actionRunning = false;
    }
    yield this.getSessionSnapshot();
  }

  private async *runSubmitMessage(message: string): AsyncGenerator<void> {
    if (this.state.chatState.workflowState === "awaiting_clarification") {
      yield* runClarificationWorkflow(this.state, message);
    } else if (
      this.state.chatState.workflowState === "answered" ||
      this.state.chatState.workflowState === "errored"
    ) {
      const currentSheet = await this.state.excelManager.readActiveSheet();
      const workflowId = this.state.chatState.nextWorkflowId++;
      if (
        preprocessingEnabled &&
        !this.state.chatState.preprocessedSheetNames.includes(currentSheet.name)
      ) {
        yield* runPreprocessWorkflow(this.state, message, workflowId);
      } else {
        yield* runSubmitMessageWorkflow(this.state, message, workflowId, true);
      }
    }
  }

  private validateAction(action: ChatAction): void {
    if (action.type === "submit_message") {
      if (
        this.state.chatState.workflowState !== "answered" &&
        this.state.chatState.workflowState !== "errored" &&
        this.state.chatState.workflowState !== "awaiting_clarification"
      ) {
        throw new Error(
          `Cannot submit a chat message while the chat state is ${this.state.chatState.workflowState}.`
        );
      }
    } else if (action.type === "accept_pending_diff" || action.type === "reject_pending_diff") {
      if (
        this.state.chatState.workflowState !== "pending_edit" &&
        this.state.chatState.workflowState !== "pending_edit_preprocessed"
      ) {
        throw new Error("Cannot decide changes unless the latest turn is pending_edit.");
      }
    }
  }

  private appendErrorMessage(message: string): void {
    if (this.state.chatState.pendingEdit) {
      this.state.chatState.transcript = this.state.chatState.transcript.filter(
        (entry) =>
          entry.workflowId !== this.state.chatState.pendingEdit!.workflowId ||
          entry.kind !== "working"
      );
    } else {
      this.state.chatState.transcript = this.state.chatState.transcript.filter(
        (entry) => entry.kind !== "working"
      );
    }
    this.state.chatState.workflowState = "errored";
    appendMessage(this.state.chatState.transcript, "system", message, 0);
  }
}
