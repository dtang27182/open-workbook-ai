/* global document, HTMLButtonElement, HTMLElement, ResizeObserver */

import { Component } from "../../../component";
import chooseProviderPageHtml from "./choose-provider-page.html?raw";

export type ChooseProviderUpdateEvent = { type: "page_resized" };

export class ChooseProviderPage implements Component<ChooseProviderUpdateEvent> {
  private readonly page: HTMLElement;
  private readonly tryAsking: HTMLElement;

  constructor(
    private readonly mount: HTMLElement,
    onChooseOpenAi: () => void,
    onChooseOpenRouter: () => void
  ) {
    const template = document.createElement("template");
    template.innerHTML = chooseProviderPageHtml;
    template.content.querySelector<HTMLButtonElement>("#choose-openai")!.onclick = onChooseOpenAi;
    template.content.querySelector<HTMLButtonElement>("#choose-openrouter")!.onclick =
      onChooseOpenRouter;
    this.page = template.content.querySelector<HTMLElement>("#choose-provider-page")!;
    this.tryAsking = template.content.querySelector<HTMLElement>("#welcome-try-asking")!;
    this.mount.replaceChildren(template.content);
    new ResizeObserver(() => this.updateState({ type: "page_resized" })).observe(this.page);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: ChooseProviderUpdateEvent): void {
    if (event.type === "page_resized") {
      this.tryAsking.hidden = false;
      this.tryAsking.hidden = this.page.scrollHeight > this.page.clientHeight;
    }
  }
}
