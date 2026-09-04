/* global document, HTMLElement */

import { Component } from "../../component-v2";
import { ChatHeader } from "./chat-header";
import { ChatWindow } from "./chat-window/chat-window";

export class ChatPage implements Component<never> {
  private readonly mount: HTMLElement;
  private readonly chatHeader: ChatHeader;
  private readonly chatWindow: ChatWindow;

  constructor(mount: HTMLElement, onSignOut: () => void) {
    this.mount = mount;
    const initialDom = this.createInitialDom();
    this.chatHeader = new ChatHeader(initialDom.chatHeaderMount, onSignOut);
    this.chatWindow = new ChatWindow(initialDom.chatWindowMount);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(): void {}

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
