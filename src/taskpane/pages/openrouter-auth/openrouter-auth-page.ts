/* global HTMLButtonElement, HTMLElement */

import type { PageManager, TaskpanePage } from "../../taskpane";
import openrouterAuthPageHtml from "./openrouter-auth-page.html?raw";
import { OpenrouterKeyStore } from "./openrouter-api-key";
import { acquireOpenRouterApiKey } from "./openrouter-key-exchange";

export class OpenRouterAuthPage implements TaskpanePage {
  readonly name = "openrouter-auth";

  constructor(
    readonly element: HTMLElement,
    private readonly openrouterKeyStore: OpenrouterKeyStore,
    private readonly pageManager: PageManager
  ) {}

  initialize(): void {
    this.element.innerHTML = openrouterAuthPageHtml;
    this.element.querySelector<HTMLButtonElement>("#openrouter-sign-in")!.onclick = () => {
      void this.handleSignIn();
    };
  }

  activate(): void {
    this.renderSelectProvider();
  }

  private async handleSignIn(): Promise<void> {
    this.renderInProgress();

    try {
      this.openrouterKeyStore.set(await acquireOpenRouterApiKey());
      this.pageManager.showPage("chat");
    } catch (error) {
      this.renderError(
        error instanceof Error ? error.message : "Could not sign in to OpenRouter. Try again."
      );
    }
  }

  private renderSelectProvider(): void {
    const signInButton = this.element.querySelector<HTMLButtonElement>("#openrouter-sign-in")!;
    const status = this.element.querySelector<HTMLElement>("#openrouter-auth-status")!;
    const error = this.element.querySelector<HTMLElement>("#openrouter-auth-error")!;

    signInButton.disabled = false;
    signInButton.textContent = "Sign in with OpenRouter";
    status.hidden = true;
    status.textContent = "";
    error.hidden = true;
    error.textContent = "";
    signInButton.focus();
  }

  private renderInProgress(): void {
    const signInButton = this.element.querySelector<HTMLButtonElement>("#openrouter-sign-in")!;
    const status = this.element.querySelector<HTMLElement>("#openrouter-auth-status")!;
    const error = this.element.querySelector<HTMLElement>("#openrouter-auth-error")!;

    signInButton.disabled = true;
    signInButton.textContent = "Signing in…";
    status.hidden = false;
    status.textContent = "Complete sign-in in the OpenRouter window.";
    error.hidden = true;
    error.textContent = "";
  }

  private renderError(message: string): void {
    const signInButton = this.element.querySelector<HTMLButtonElement>("#openrouter-sign-in")!;
    const status = this.element.querySelector<HTMLElement>("#openrouter-auth-status")!;
    const error = this.element.querySelector<HTMLElement>("#openrouter-auth-error")!;

    signInButton.disabled = false;
    signInButton.textContent = "Sign in with OpenRouter";
    status.hidden = true;
    status.textContent = "";
    error.hidden = false;
    error.textContent = message;
    signInButton.focus();
  }
}
