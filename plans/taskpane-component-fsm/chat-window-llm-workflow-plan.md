# Chat Window LLM Workflow FIP

Status: stub for future planning. This document records the intended ownership boundary and does not authorize runtime changes yet.

## Goal

Introduce a class that owns the chat window's LLM conversation history and all calls to functions currently provided by `llm-model-workflow.ts`.

The future class should own:

- `llmConversationMessages`;
- `appendUserDecisionLlmMessage()`;
- `appendAssistantLlmMessage()`;
- pending clarification lookup;
- clarification-response prompts;
- main-query prompts;
- preprocessing prompts;
- scenario-comparison prompts; and
- update-analysis prompts.

Move `llmConversationMessages`, `appendUserDecisionLlmMessage()`, and `appendAssistantLlmMessage()` out of `ChatWindowState` when this class is introduced. ChatWindow workflow functions should use the new class instead of directly reading or replacing LLM conversation history or importing `llm-model-workflow.ts` functions.

The detailed interface, class name, construction, state-copy behavior, and migration order remain to be designed before implementation.
