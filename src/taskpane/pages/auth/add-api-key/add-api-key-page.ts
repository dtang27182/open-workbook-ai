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
            back: "Back",
            mark: '<img src="/assets/openai-glyph.svg" alt="" width="24" />',
            markClass: " openai-mark",
            heading: "Connect OpenAI",
            description: "Paste an API key from your OpenAI account to use GPT models.",
            keyUrl: "https://platform.openai.com/api-keys",
            keyDomain: "platform.openai.com",
            details: `<ul class="auth-details auth-steps">
              <li><strong>Sign in to the OpenAI platform</strong><span>Go to platform.openai.com. It’s separate from ChatGPT.</span></li>
              <li><strong>Create a secret key</strong><span>Open API keys and choose Create new secret key. Save it somewhere safe, like a password manager, so you can reuse it next time. OpenAI shows it only once.</span></li>
              <li><strong>Paste it and save</strong><span>Paste the key above and choose Save key.</span></li>
              <li><strong>Start asking</strong><span>You’re ready to go. Usage is billed to your OpenAI API account, not your ChatGPT plan.</span></li>
            </ul>`,
            placeholder: "",
          }
        : {
            back: "OpenRouter",
            mark: '<img src="/assets/openrouter-glyph.svg" alt="" width="24" />',
            markClass: " openrouter-mark",
            heading: "Add your OpenRouter API key",
            description:
              "Paste an API key from your OpenRouter account. It's stored on this device only and sent only to OpenRouter.",
            keyUrl: "https://openrouter.ai/keys",
            keyDomain: "openrouter.ai/keys",
            details:
              '<footer class="auth-footer">Usage is billed to your OpenRouter account.</footer>',
            placeholder: 'placeholder="sk-or-v1-…"',
          };
    template.innerHTML = addApiKeyPageHtml;
    for (const [name, value] of Object.entries({
      id: provider,
      back: values.back,
      mark: values.mark,
      markClass: values.markClass,
      heading: values.heading,
      description: values.description,
      keyUrl: values.keyUrl,
      keyDomain: values.keyDomain,
      details: values.details,
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
