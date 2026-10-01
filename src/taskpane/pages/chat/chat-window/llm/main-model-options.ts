import type { OpenRouterRequestBody } from "./openrouter-client";

export const mainModelOptions = [
  {
    label: "GPT-5.6 Sol",
    config: {
      model: "openai/gpt-5.6-sol:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "Claude Opus 4.8",
    config: {
      model: "anthropic/claude-opus-4.8:nitro",
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "GPT-5.4 Mini",
    config: {
      model: "openai/gpt-5.4-mini:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "Gemini 3.5 Flash",
    config: {
      model: "google/gemini-3.5-flash:exacto",
      provider: { order: ["google-ai-studio"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
] as const;

export type MainModelId = (typeof mainModelOptions)[number]["config"]["model"];
export type MainModelConfig = Pick<OpenRouterRequestBody, "model" | "provider" | "reasoning">;
