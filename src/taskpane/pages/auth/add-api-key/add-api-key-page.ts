/* global document, HTMLButtonElement, HTMLFormElement, HTMLInputElement, HTMLElement */

import { Component } from "../../../component";
import addApiKeyPageHtml from "./add-api-key-page.html?raw";

type Provider = "openai" | "openrouter";
export type AddApiKeyUpdateEvent = { type: "toggle_visibility" } | { type: "reset" };

export class AddApiKeyPage implements Component<AddApiKeyUpdateEvent> {
  private readonly input: HTMLInputElement;
  private readonly visibilityButton: HTMLButtonElement;

  constructor(
    private readonly mount: HTMLElement,
    provider: Provider,
    onSave: (apiKey: string) => void,
    onBack: () => void
  ) {
    const template = document.createElement("template");
    const values =
      provider === "openai"
        ? {
            back: "All providers",
            mark: "OA",
            name: "OpenAI",
            keyUrl: "https://platform.openai.com/api-keys",
            keyDomain: "platform.openai.com",
            billing: "OpenAI API",
            placeholder: "",
          }
        : {
            back: "OpenRouter",
            mark: "OR",
            name: "OpenRouter",
            keyUrl: "https://openrouter.ai/keys",
            keyDomain: "openrouter.ai/keys",
            billing: "OpenRouter",
            placeholder: 'placeholder="sk-or-v1-…"',
          };
    template.innerHTML = addApiKeyPageHtml;
    for (const [name, value] of Object.entries({
      id: provider,
      back: values.back,
      mark: values.mark,
      provider: values.name,
      keyUrl: values.keyUrl,
      keyDomain: values.keyDomain,
      billing: values.billing,
      placeholder: values.placeholder,
    })) {
      template.innerHTML = template.innerHTML.split(`{{${name}}}`).join(value);
    }
    this.input = template.content.querySelector<HTMLInputElement>(`#${provider}-api-key`)!;
    this.visibilityButton = template.content.querySelector<HTMLButtonElement>(
      `#${provider}-key-visibility`
    )!;
    template.content.querySelector<HTMLButtonElement>(`#${provider}-all-providers`)!.onclick =
      onBack;
    template.content.querySelector<HTMLFormElement>(`#${provider}-key-form`)!.onsubmit = (
      event
    ) => {
      event.preventDefault();
      onSave(this.input.value);
    };
    this.visibilityButton.onclick = () => this.updateState({ type: "toggle_visibility" });
    this.mount.replaceChildren(template.content);
  }

  getMount(): HTMLElement {
    return this.mount;
  }

  updateState(event: AddApiKeyUpdateEvent): void {
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
