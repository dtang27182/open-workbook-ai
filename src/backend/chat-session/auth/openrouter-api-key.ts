/* global window, crypto, TextEncoder */

const LEGACY_OPENROUTER_API_KEY_STORAGE_KEY = "open-workbook-ai-openrouter-api-key";
const OPENROUTER_API_KEY_STORAGE_KEY = "open-workbook-ai-openrouter-oauth-key";

export class OpenrouterKeyStore {
  private apiKey: string | undefined;

  constructor() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LEGACY_OPENROUTER_API_KEY_STORAGE_KEY);
      this.apiKey = window.localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) || undefined;
    }
  }

  set(apiKey: string): void {
    this.apiKey = apiKey;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, apiKey);
    }
  }

  get(): string {
    if (this.apiKey === undefined) {
      throw new Error("Sign in with OpenRouter before sending a message.");
    } else {
      return this.apiKey;
    }
  }

  hasKey(): boolean {
    return this.apiKey !== undefined;
  }

  clear(): void {
    this.apiKey = undefined;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_OPENROUTER_API_KEY_STORAGE_KEY);
    }
  }

  async createManagementUrl(): Promise<string> {
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.get()))
    );
    const hexadecimalHash = Array.from(hash)
      .map((byte) => `0${byte.toString(16)}`.slice(-2))
      .join("");
    return `https://openrouter.ai/keys/${hexadecimalHash}`;
  }
}
