/* global document, HTMLAnchorElement, HTMLButtonElement, HTMLElement */

import { Component } from "../component";
import accountMenuHtml from "./account-menu.html?raw";

export type AccountIdentity = {
  provider: "openai" | "openrouter";
  keySuffix: string;
};

export type AccountMenuUpdateEvent =
  | { type: "close" }
  | { type: "set_identity"; identity: AccountIdentity | undefined };

export class AccountMenu implements Component<AccountMenuUpdateEvent> {
  private readonly menu: HTMLElement;
  private readonly caption: HTMLElement;

  constructor(
    private readonly mount: HTMLElement,
    onSignOut: () => void,
    identity: AccountIdentity | undefined
  ) {
    const template = document.createElement("template");
    template.innerHTML = accountMenuHtml;
    this.menu = template.content.querySelector<HTMLElement>(".account-menu")!;
    this.caption = template.content.querySelector<HTMLElement>(".account-menu-caption")!;
    const helpLink = template.content.querySelector<HTMLAnchorElement>("#open-workbook-help")!;
    helpLink.onclick = () => {
      this.updateState({ type: "close" });
    };
    const signOutButton = template.content.querySelector<HTMLButtonElement>("#account-sign-out")!;
    signOutButton.onclick = onSignOut;
    this.mount.replaceChildren(template.content);
    this.updateState({ type: "set_identity", identity });
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: AccountMenuUpdateEvent): void {
    if (event.type === "close") {
      this.menu.hidePopover();
    } else if (event.type === "set_identity") {
      if (event.identity === undefined) {
        this.caption.textContent = "";
      } else if (event.identity.provider === "openai") {
        this.caption.textContent = `Signed in to OpenAI · key …${event.identity.keySuffix}`;
      } else if (event.identity.provider === "openrouter") {
        this.caption.textContent = `Signed in to OpenRouter · key …${event.identity.keySuffix}`;
      }
    }
  }
}
