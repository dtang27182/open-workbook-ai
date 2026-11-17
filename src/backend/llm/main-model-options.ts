import type { OpenRouterRequestBody } from "./inference-client";

export const openRouterMainModelOptions = [
  {
    label: "GPT-6.1 Sol",
    selectionKey: "gpt-6.1-sol",
    config: {
      model: "openai/gpt-6.1-sol:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "GPT-6 Sol",
    selectionKey: "gpt-6-sol",
    config: {
      model: "openai/gpt-6-sol:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "GPT-5.6 Sol",
    selectionKey: "gpt-5.6-sol",
    config: {
      model: "openai/gpt-5.6-sol:exacto",
      provider: { order: ["openai"], allow_fallbacks: false },
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "Claude Sonnet 5.5",
    selectionKey: "claude-sonnet-5.5",
    config: {
      model: "anthropic/claude-sonnet-5.5:nitro",
      reasoning: { effort: "medium" },
    },
  },
  {
    label: "Claude Opus 4.8",
    selectionKey: "claude-opus-4.8",
    config: {
      model: "anthropic/claude-opus-4.8:nitro",
      reasoning: { effort: "medium" },
    },
  },
] as const;

export const openAiMainModelOptions = [
  {
    label: "GPT-6.1 Sol",
    selectionKey: "gpt-6.1-sol",
    config: { model: "gpt-6.1-sol", reasoning: { effort: "medium" } },
  },
  {
    label: "GPT-6 Sol",
    selectionKey: "gpt-6-sol",
    config: { model: "gpt-6-sol", reasoning: { effort: "medium" } },
  },
  {
    label: "GPT-5.6 Sol",
    selectionKey: "gpt-5.6-sol",
    config: { model: "gpt-5.6-sol", reasoning: { effort: "medium" } },
  },
] as const;

export type MainModelOption =
  | (typeof openRouterMainModelOptions)[number]
  | (typeof openAiMainModelOptions)[number];
export type MainModelConfig = Pick<OpenRouterRequestBody, "model" | "provider" | "reasoning">;
