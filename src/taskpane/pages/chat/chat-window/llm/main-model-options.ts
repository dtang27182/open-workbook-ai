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
    label: "GPT-6 Sol",
    config: {
      model: "openai/gpt-6-sol:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "GPT-6.1 Sol",
    config: {
      model: "openai/gpt-6.1-sol:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "Claude Sonnet 5.5",
    config: {
      model: "anthropic/claude-sonnet-5.5:nitro",
      reasoning: { effort: "medium" },
    },
  },
] as const;

export type MainModelId = (typeof mainModelOptions)[number]["config"]["model"];
export type MainModelConfig = Pick<OpenRouterRequestBody, "model" | "provider" | "reasoning">;
