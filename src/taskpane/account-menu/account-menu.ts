/* global document, HTMLAnchorElement, HTMLButtonElement, HTMLElement */

import { Component } from "../component";
import accountMenuHtml from "./account-menu.html?raw";

export type AccountMenuUpdateEvent = { type: "close" };

export class AccountMenu implements Component<AccountMenuUpdateEvent> {
  private readonly menu: HTMLElement;

  constructor(
    private readonly mount: HTMLElement,
    onSignOut: () => void
  ) {
    const template = document.createElement("template");
    template.innerHTML = accountMenuHtml;
    this.menu = template.content.querySelector<HTMLElement>(".account-menu")!;
    const helpLink = template.content.querySelector<HTMLAnchorElement>("#open-workbook-help")!;
    helpLink.onclick = () => {
      this.updateState({ type: "close" });
    };
    const signOutButton =
      template.content.querySelector<HTMLButtonElement>("#openrouter-sign-out")!;
    signOutButton.onclick = onSignOut;
    this.mount.replaceChildren(template.content);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: AccountMenuUpdateEvent): void {
    if (event.type === "close") {
      this.menu.hidePopover();
    }
  }
}
