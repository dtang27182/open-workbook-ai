/* global document, HTMLAnchorElement, HTMLButtonElement, HTMLDivElement */

import { Component, ComponentView } from "../../component";
import { cloneChatPageElement } from "./chat-page-template";

export class ChatHeader implements Component<void, never, never, never> {
  readonly componentId = "chat-header";

  constructor(private readonly onSignOut: () => void) {}

  genView(): ComponentView {
    const element = document.createElement("div");
    const heading = cloneChatPageElement<HTMLDivElement>(".chat-heading");
    const providerDetails = cloneChatPageElement<HTMLDivElement>(".provider-link-details");
    const manageKeyLink =
      providerDetails.querySelector<HTMLAnchorElement>("#openrouter-manage-key")!;

    element.id = this.componentId;
    element.className = "chat-header";
    heading.querySelector<HTMLButtonElement>("#chat-clear")!.remove();
    heading.querySelector<HTMLButtonElement>("#openrouter-sign-out")!.onclick = this.onSignOut;
    manageKeyLink.hidden = true;
    manageKeyLink.removeAttribute("href");
    element.append(heading, providerDetails);

    return {
      componentId: this.componentId,
      element,
    };
  }

  updateState(): void {}
}
