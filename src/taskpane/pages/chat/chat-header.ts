/* global document, HTMLButtonElement, HTMLDivElement, HTMLElement */

import { Component } from "../../component";
import { cloneChatPageElement } from "./chat-page-template";

export class ChatHeader implements Component<never> {
  private readonly mount: HTMLElement;

  constructor(
    mount: HTMLElement,
    private readonly onSignOut: () => void
  ) {
    this.mount = mount;
    this.createInitialDom();
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(): void {}

  private createInitialDom(): void {
    const element = document.createElement("div");
    const heading = cloneChatPageElement<HTMLDivElement>(".chat-heading");

    element.id = "chat-header";
    element.className = "chat-header";
    heading.querySelector<HTMLButtonElement>("#openrouter-sign-out")!.onclick = this.onSignOut;
    element.append(heading);

    this.mount.replaceChildren(element);
  }
}
