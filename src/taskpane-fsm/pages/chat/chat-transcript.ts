/* global document, Excel, HTMLButtonElement, HTMLFormElement, HTMLInputElement, HTMLElement */

import { Component, ComponentView } from "../../component";
import { ChatStateMachine } from "../../../taskpane/pages/chat/chat-state-machine/chat-state-machine";
import { ChatStateMachineInput } from "../../../taskpane/pages/chat/chat-state-machine/chat-types";
import { cloneChatPageElement } from "./chat-page-template";
import { LegacyChatRendering } from "./legacy-chat-rendering";

export type ChatTranscriptUpdateEvent = { type: "clear" } | ChatStateMachineInput;

export class ChatTranscript implements Component<void, never, never, ChatTranscriptUpdateEvent> {
  readonly componentId = "chat-transcript";

  private readonly element: HTMLElement;
  private readonly chatStateMachine: ChatStateMachine;

  constructor() {
    this.element = this.createElement();
    const legacyChatRendering = new LegacyChatRendering(this.element, {
      onAccept: () => {
        void this.updateState({ type: "accept_pending_diff" });
      },
      onReject: () => {
        void this.updateState({ type: "reject_pending_diff" });
      },
      onRestore: (restorePointId) => {
        void this.updateState({ type: "restore_to_point", restorePointId });
      },
    });

    this.chatStateMachine = new ChatStateMachine(Excel, legacyChatRendering);
    this.chatStateMachine.reset();
  }

  genView(): ComponentView {
    return {
      componentId: this.componentId,
      element: this.element,
    };
  }

  async updateState(event: ChatTranscriptUpdateEvent): Promise<void> {
    if (event.type === "clear") {
      this.chatStateMachine.reset();
    } else if (
      event.type === "submit_message" ||
      event.type === "accept_pending_diff" ||
      event.type === "reject_pending_diff" ||
      event.type === "restore_to_point"
    ) {
      await this.chatStateMachine.updateState(event);
    }
  }

  private createElement(): HTMLElement {
    const element = document.createElement("div");
    const messages = cloneChatPageElement<HTMLElement>("#chat-messages");
    const form = cloneChatPageElement<HTMLFormElement>("#chat-form");
    const clearButton = cloneChatPageElement<HTMLButtonElement>("#chat-clear");
    const input = form.querySelector<HTMLInputElement>("#chat-input")!;

    element.id = this.componentId;
    element.className = "chat-transcript";
    clearButton.onclick = () => {
      void this.updateState({ type: "clear" });
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const message = input.value;

      input.value = "";
      void this.updateState({ type: "submit_message", message });
    };
    form.prepend(clearButton);
    element.append(messages, form);

    return element;
  }
}
