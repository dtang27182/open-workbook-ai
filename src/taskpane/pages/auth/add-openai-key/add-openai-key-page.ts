/* global document, HTMLButtonElement, HTMLFormElement, HTMLInputElement, HTMLElement */

import { Component } from "../../../component";
import addOpenAiKeyPageHtml from "./add-openai-key-page.html?raw";

export type AddOpenAIKeyUpdateEvent = { type: "toggle_visibility" } | { type: "reset" };

export class AddOpenAIKeyPage implements Component<AddOpenAIKeyUpdateEvent> {
  private readonly input: HTMLInputElement;
  private readonly visibilityButton: HTMLButtonElement;

  constructor(
    private readonly mount: HTMLElement,
    onSave: (apiKey: string) => void,
    onBack: () => void
  ) {
    const template = document.createElement("template");
    template.innerHTML = addOpenAiKeyPageHtml;
    this.input = template.content.querySelector<HTMLInputElement>("#openai-api-key")!;
    this.visibilityButton =
      template.content.querySelector<HTMLButtonElement>("#openai-key-visibility")!;
    template.content.querySelector<HTMLButtonElement>("#openai-all-providers")!.onclick = onBack;
    template.content.querySelector<HTMLFormElement>("#openai-key-form")!.onsubmit = (event) => {
      event.preventDefault();
      onSave(this.input.value);
    };
    this.visibilityButton.onclick = () => {
      this.updateState({ type: "toggle_visibility" });
    };
    this.mount.replaceChildren(template.content);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: AddOpenAIKeyUpdateEvent): void {
    if (event.type === "toggle_visibility") {
      this.input.type = this.input.type === "password" ? "text" : "password";
    } else if (event.type === "reset") {
      this.input.value = "";
      this.input.type = "password";
    }

    this.visibilityButton.textContent = this.input.type === "password" ? "Show" : "Hide";
    this.visibilityButton.setAttribute("aria-pressed", String(this.input.type === "text"));
    this.visibilityButton.setAttribute(
      "aria-label",
      this.input.type === "password" ? "Show API key" : "Hide API key"
    );
  }
}
