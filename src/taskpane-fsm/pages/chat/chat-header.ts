/* global document, HTMLAnchorElement, HTMLButtonElement, HTMLDivElement, HTMLElement */

import { Component } from "../../component-v2";
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
    const providerDetails = cloneChatPageElement<HTMLDivElement>(".provider-link-details");
    const manageKeyLink =
      providerDetails.querySelector<HTMLAnchorElement>("#openrouter-manage-key")!;

    element.id = "chat-header";
    element.className = "chat-header";
    heading.querySelector<HTMLButtonElement>("#chat-clear")!.remove();
    heading.querySelector<HTMLButtonElement>("#openrouter-sign-out")!.onclick = this.onSignOut;
    manageKeyLink.hidden = true;
    manageKeyLink.removeAttribute("href");
    element.append(heading, providerDetails);

    this.mount.replaceChildren(element);
  }
}
