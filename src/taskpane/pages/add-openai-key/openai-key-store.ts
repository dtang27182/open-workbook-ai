/* global window */

const OPENAI_API_KEY_STORAGE_KEY = "open-workbook-ai-openai-api-key";

export class OpenAIKeyStore {
  private apiKey: string | undefined;

  constructor() {
    if (typeof window !== "undefined") {
      this.apiKey = window.localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) || undefined;
    }
  }

  set(apiKey: string): void {
    this.apiKey = apiKey;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, apiKey);
    }
  }

  get(): string {
    if (this.apiKey === undefined) {
      throw new Error("Add an OpenAI API key before using your OpenAI account.");
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
      window.localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY);
    }
  }
}
