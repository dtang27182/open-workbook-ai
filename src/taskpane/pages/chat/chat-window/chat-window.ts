/* global HTMLElement, ResizeObserver */

import { Component } from "../../../component";
import type {
  ChatSession,
  ChatSessionSnapshot,
  MainModelId,
} from "../../../../backend/chat-session";
import { ChatInput } from "./chat-input/chat-input";
import {
  type ChatWindowDomHandlers,
  createInitialDom,
  configChatControls,
  renderChatTranscript,
  updateReviewWarning,
} from "./dom/chat-window-dom";

export type ChatWindowUpdateEvent =
  | { type: "submit_message"; message: string }
  | { type: "accept_pending_diff" }
  | { type: "reject_pending_diff" }
  | { type: "restore_to_point"; restorePointId: number }
  | { type: "select_model"; modelId: MainModelId }
  | { type: "provider_changed" }
  | { type: "clear" };

export class ChatWindow implements Component<ChatWindowUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly session: ChatSession;
  private readonly chatInput: ChatInput;
  private readonly domHandlers: ChatWindowDomHandlers;
  private readonly panelObserver: ResizeObserver;

  constructor(mount: HTMLElement, session: ChatSession) {
    this.mount = mount;
    this.session = session;
    this.domHandlers = {
      onClear: () => {
        void this.updateState({ type: "clear" });
      },
      onSubmit: (message) => {
        void this.updateState({ type: "submit_message", message });
      },
      onModelSelected: (modelId) => {
        void this.updateState({ type: "select_model", modelId });
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
    const initialSnapshot = this.session.getSessionSnapshot();
    const initialDom = createInitialDom(mount, this.domHandlers);
    this.chatInput = new ChatInput(
      initialDom.chatInputMount,
      initialSnapshot,
      this.domHandlers.onSubmit,
      this.domHandlers.onModelSelected
    );
    let previousHeight = 0;
    this.panelObserver = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height !== previousHeight) {
        previousHeight = entry.contentRect.height;
        this.chatInput.updateState({
          type: "panel_resized",
          maxHeight: entry.contentRect.height / 2,
        });
      }
    });
    this.panelObserver.observe(initialDom.panel);
    this.applySessionSnapshot(initialSnapshot);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  async updateState(event: ChatWindowUpdateEvent): Promise<void> {
    if (event.type === "clear") {
      this.session.resetChat();
      this.applySessionSnapshot(this.session.getSessionSnapshot());
    } else if (event.type === "select_model") {
      this.session.setModel(event.modelId);
      this.updateModelOptions();
    } else if (event.type === "provider_changed") {
      this.applySessionSnapshot(this.session.getSessionSnapshot());
      this.updateModelOptions();
    } else if (event.type === "submit_message") {
      if (this.session.getSessionSnapshot().canSubmit) {
        this.chatInput.updateState({ type: "clear" });
      }
      await this.consumeUpdates(this.session.submitMessage(event.message));
    } else if (event.type === "accept_pending_diff") {
      await this.consumeUpdates(this.session.acceptPendingDiff());
    } else if (event.type === "reject_pending_diff") {
      await this.consumeUpdates(this.session.rejectPendingDiff());
    } else if (event.type === "restore_to_point") {
      await this.consumeUpdates(this.session.restoreToPoint(event.restorePointId));
    }
  }

  private async consumeUpdates(updates: AsyncIterable<ChatSessionSnapshot>): Promise<void> {
    this.applySessionSnapshot(this.session.getSessionSnapshot());
    for await (const snapshot of updates) {
      this.applySessionSnapshot(snapshot);
    }
  }

  private applySessionSnapshot(snapshot: ChatSessionSnapshot): void {
    renderChatTranscript(this.mount, snapshot.transcript, this.domHandlers, snapshot.canRestore);
    configChatControls(this.mount, snapshot, this.chatInput);
    updateReviewWarning(this.mount, snapshot.reviewSheetName);
  }

  private updateModelOptions(): void {
    const snapshot = this.session.getSessionSnapshot();
    this.chatInput.updateState({
      type: "set_model_options",
      options: snapshot.modelOptions,
      selectedModelId: snapshot.selectedModelId,
    });
  }
}
