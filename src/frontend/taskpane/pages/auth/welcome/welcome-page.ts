/* global document, HTMLButtonElement, HTMLElement, ResizeObserver */

import { Component } from "../../../component";
import welcomePageHtml from "./welcome-page.html?raw";

export type WelcomeUpdateEvent = { type: "page_resized" };

export class WelcomePage implements Component<WelcomeUpdateEvent> {
  private readonly page: HTMLElement;
  private readonly tryAsking: HTMLElement;

  constructor(
    private readonly mount: HTMLElement,
    onGetStarted: () => void
  ) {
    const template = document.createElement("template");
    template.innerHTML = welcomePageHtml;
    template.content.querySelector<HTMLButtonElement>("#get-started")!.onclick = onGetStarted;
    this.page = template.content.querySelector<HTMLElement>("#welcome-page")!;
    this.tryAsking = template.content.querySelector<HTMLElement>("#welcome-try-asking")!;
    this.mount.replaceChildren(template.content);
    new ResizeObserver(() => this.updateState({ type: "page_resized" })).observe(this.page);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: WelcomeUpdateEvent): void {
    if (event.type === "page_resized") {
      this.tryAsking.hidden = false;
      this.tryAsking.hidden = this.page.scrollHeight > this.page.clientHeight;
    }
  }
}
