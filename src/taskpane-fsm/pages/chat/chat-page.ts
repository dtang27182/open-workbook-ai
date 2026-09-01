/* global document, HTMLElement */

import { Component } from "../../component-v2";
import { LegacyComponentAdapter } from "../../legacy-component-adapter";
import { ChatHeader } from "./chat-header";
import { ChatTranscript, ChatTranscriptUpdateEvent } from "./chat-transcript";

export class ChatPage implements Component<never> {
  private readonly mount: HTMLElement;
  private readonly chatHeader: ChatHeader;
  private readonly chatTranscript: LegacyComponentAdapter<ChatTranscriptUpdateEvent>;

  constructor(mount: HTMLElement, onSignOut: () => void) {
    this.mount = mount;
    const initialDom = this.createInitialDom();
    this.chatHeader = new ChatHeader(initialDom.chatHeaderMount, onSignOut);
    this.chatTranscript = new LegacyComponentAdapter(
      initialDom.chatTranscriptMount,
      new ChatTranscript()
    );
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(): void {}

  private createInitialDom(): {
    chatHeaderMount: HTMLElement;
    chatTranscriptMount: HTMLElement;
  } {
    const element = document.createElement("section");
    const chatHeaderMount = document.createElement("div");
    const chatTranscriptMount = document.createElement("div");

    element.id = "chat-page";
    element.className = "chat-view";
    chatHeaderMount.style.display = "contents";
    chatTranscriptMount.style.display = "contents";
    element.append(chatHeaderMount, chatTranscriptMount);
    this.mount.replaceChildren(element);

    return {
      chatHeaderMount,
      chatTranscriptMount,
    };
  }
}
