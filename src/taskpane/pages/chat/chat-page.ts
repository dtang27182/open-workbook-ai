/* global document, HTMLElement */

import { Component } from "../../component";
import { ChatHeader } from "./chat-header";
import { ChatWindow } from "./chat-window/chat-window";
import type { ChatSession } from "./chat-window/chat-session";

export type ChatPageUpdateEvent = { type: "provider_changed" };

export class ChatPage implements Component<ChatPageUpdateEvent> {
  private readonly mount: HTMLElement;
  private readonly chatHeader: ChatHeader;
  private readonly chatWindow: ChatWindow;

  constructor(mount: HTMLElement, session: ChatSession) {
    this.mount = mount;
    const initialDom = this.createInitialDom();
    this.chatHeader = new ChatHeader(initialDom.chatHeaderMount);
    this.chatWindow = new ChatWindow(initialDom.chatWindowMount, session);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: ChatPageUpdateEvent): void {
    if (event.type === "provider_changed") {
      void this.chatWindow.updateState(event);
    }
  }

  private createInitialDom(): {
    chatHeaderMount: HTMLElement;
    chatWindowMount: HTMLElement;
  } {
    const element = document.createElement("section");
    const chatHeaderMount = document.createElement("div");
    const chatWindowMount = document.createElement("div");

    element.id = "chat-page";
    element.className = "chat-view";
    chatHeaderMount.style.display = "contents";
    chatWindowMount.style.display = "contents";
    element.append(chatHeaderMount, chatWindowMount);
    this.mount.replaceChildren(element);

    return {
      chatHeaderMount,
      chatWindowMount,
    };
  }
}
