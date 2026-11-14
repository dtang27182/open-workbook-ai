/* global document, HTMLButtonElement, HTMLElement */

import { Component } from "../../../component";
import chooseProviderPageHtml from "./choose-provider-page.html?raw";

export class ChooseProviderPage implements Component<never> {
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
    this.mount.replaceChildren(template.content);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(): void {}
}
