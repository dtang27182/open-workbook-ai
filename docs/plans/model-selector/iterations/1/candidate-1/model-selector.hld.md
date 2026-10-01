# model-selector High Level Design

## Desired Behavior

- Let the user see and change the selected model using a dropdown in the chat task pane.
- Use the selected model for all subsequent main-query, clarification-response, scenario-comparison, and post-acceptance impact-analysis requests.
- Allow switching models within an existing workflow, including between an assistant clarification and the user's answer or between an edit proposal and acceptance. Switching does not restart the conversation or discard pending edits.
- Proposed timing: allow selection changes while work is running. Requests already sent finish with their original model; subsequent requests use the current selection.
- Keep the selection only for the current task-pane lifetime. Reloading initializes the default model.

## Scope and Assumptions

- This work produces a high-level design first; application implementation is out of scope for this stage.
- Formula detection and formula inference are outside the feature scope and retain their existing model configurations.
- Use a fixed list containing the four main-model options already referenced in the code: `openai/gpt-5.6-sol:exacto`, `anthropic/claude-opus-4.8:nitro`, `openai/gpt-5.4-mini:exacto`, and `google/gemini-3.5-flash:exacto`. Preserve each option's existing provider and reasoning configuration. Do not load a model catalog from OpenRouter.
- No selection persistence across task-pane reloads and no workflow-level model pinning or model-change restriction.
- Proposed default: retain the current main model, `openai/gpt-5.6-sol:exacto`.
- Proposed selection lifetime: Clear chat, Restore, and sign-out/sign-in within the same task-pane instance retain the current selection. Restore continues to restore conversation and worksheet state without changing the current model choice.
- Preserve existing worksheet edits, review actions, scenarios, conversation history, authentication, streaming, and error handling except for applying the selected model to the confirmed request categories.
- Do not add model pricing displays, reasoning controls, automatic model switching, or per-message model attribution as part of this feature.

## User Journeys

1. **Select a model and submit a request.** The user opens the task pane and selects a model from the model-selector dropdown. The user enters text into the chat input text box and clicks Submit. All subsequent model requests in scope for this feature use the user-selected model.

## User Flows

1. **Select a model and submit a request.**
   1. The user opens the task pane.
   2. The task pane shows the model dropdown with the current selection.
   3. The user selects a model from the dropdown.
   4. The selector retains the selected model for this task-pane instance.
   5. The dropdown displays the selected model.
   6. The user enters text into the chat input.
   7. The user clicks Submit (the existing Send action).
   8. For each subsequent in-scope model request, the request path reads the current selected model configuration.
   9. The request is sent to OpenRouter with that model configuration.

## Design Context and Related Workflows

- `ChatWindow` creates `ChatInput` through `dom/chat-window-dom.ts:createInitialDom` and retains dependencies in `ChatWindowState`; only `chatState` is restorable.
- The scope/review strip stays visible while `disableChatControls` and `configChatControls` toggle the composer and review footer. Their current DOM queries do not disable a separate selector.
- `LLMManager` has three module request builders plus inline scenario-comparison construction; all four currently use `openRouterModelConfig`. The three commented alternatives in the same file supply the exact allowed configurations.
- Submit and clarification workflows call their corresponding manager methods. `createScenarioWithComparison` calls scenario comparison after recalculation; `accept-diff.ts:appendUpdateAnalysis` calls impact analysis after acceptance and worksheet reads.
- Formula preprocessing uses independent detection/inference configurations. Its accepted or rejected proposal resumes the main-query path later.
- Clear replaces `ChatWindowState.chatState`; Restore replaces it from a checkpoint. `TaskpaneComponent` retains `ChatPage` on sign-out and reattaches it on sign-in.
- `OpenRouterClient` serializes each request body immediately; streaming and error handling belong to that client and its existing callers.

## System Dataflow

[System Dataflow JSON](model-selector.sys-dataflow.json)

## Implementation Dataflow

[Implementation Dataflow JSON](model-selector.impl-dataflow.json)

A new `ModelSelector` leaf component owns the selected model and dropdown. `ChatWindow` owns the child through its existing `ChatWindowState` holder and supplies `LLMManager` a read-only getter that resolves the child’s latest configuration. The service receives no DOM or component reference, and existing workflows keep their signatures.

**Composition and initial display (steps 1–2).** Extend `dom/chat-window-dom.ts:createInitialDom` to create a permanent selector mount between the scope strip and transcript, construct `ModelSelector`, and return `{ chatInput, modelSelector }`. Extend `ChatWindowState` construction to retain that child beside `chatInput`, outside `chatState`. Update `ChatWindow` construction to pass the returned children and a closure calling `modelSelector.getSelectedModelConfig()` to `LLMManager`. This closure is wiring, not a second selection store. The selector’s constructor stores its mount, initializes `selectedModelId` to the GPT default, creates a native select with a visible “Model” label and four options, and binds its own change handler. Implement `getMount`, `updateState`, and the read-only `getSelectedModelConfig` required for composition. No parent selection event is needed because no ancestor state changes.

**Selection (steps 3–5).** `ModelSelector.updateState({ type: "model_selected", modelId })` writes `selectedModelId` and synchronizes the select value under its mount. Each option uses the explicit model ID as its value; display labels are GPT-5.6 Sol, Claude Opus 4.8, GPT-5.4 Mini, and Gemini 3.5 Flash. Selection is never read back from DOM for requests. The shared static `main-model-options.ts` registry has a typed key union, display labels, and complete request configurations. `getSelectedModelConfig` looks up the current key without a fallback, returning its read-only configuration. The fixed-option change handler passes the known model-ID union; no remote catalog or inferred identity is involved.

| Model                             | Provider configuration                                | Reasoning effort |
| --------------------------------- | ----------------------------------------------------- | ---------------- |
| `openai/gpt-5.6-sol:exacto`       | `order: ["openai"], allow_fallbacks: false`           | `medium`         |
| `anthropic/claude-opus-4.8:nitro` | Omitted, matching the existing option                 | `medium`         |
| `openai/gpt-5.4-mini:exacto`      | `order: ["openai"], allow_fallbacks: false`           | `medium`         |
| `google/gemini-3.5-flash:exacto`  | `order: ["google-ai-studio"], allow_fallbacks: false` | `medium`         |

Move the current main model configuration and commented alternatives into this registry. Derive `MainModelConfig` from the request’s `model`, optional `provider`, and optional `reasoning` fields; the registry’s values are immutable. Do not merge an option onto the previous option: choosing Claude must remove OpenAI/Google provider restrictions.

**Submit and dispatch (steps 6–9).** `ChatInput` forwards the existing Send action to the existing `ChatWindow.updateState → submitMessage` path. Existing workflows obtain worksheet context, history and preprocessing results as before; the feature boundary consumes their existing manager invocations. Add a required constructor getter dependency to `LLMManager` and retain it read-only. At request construction, `runMainQueryPrompt`, `runClarificationResponsePrompt`, and `runUpdateAnalysisPrompt` call the getter and pass the returned configuration to their corresponding existing module builders. Add one explicit model-configuration parameter to each builder and replace its constant spread with that parameter. `runScenarioComparisonPrompt` spreads the getter result into its existing inline request body. This is four reads at four request boundaries, not one read at submission or workflow start. Async generators sample when iteration begins. There is no await between these configuration reads and the existing client invocation. Requests already constructed and sent retain their configuration; the next request samples again. Unchanged `OpenRouterClient.request` and `requestStreamEvents` serialize the complete request including selected model, provider and reasoning.

**Lifetime and UI.** The selector is above the transcript, outside both composer and review-footer containers, so it remains enabled during pending review and active requests. Give its local label/select layout wrapping and full available width in taskpane styles; no changes to transcript rendering, control disabling or review logic are needed. Clear and Restore only replace chat state and never reconstruct the selector. Sign-out detaches the existing page, preserving this child. A new task-pane construction resets to GPT-5.6 Sol. Formula detection/inference methods never read this getter. Main requests that resume after preprocessing use the then-current selection.

**Validation planned for implementation.** Add behavior assertions to the existing jsdom/component and mocked-request suite: all four exact option configurations, each of the four in-scope request categories, unchanged formula request configurations, a selection change before clarification/acceptance, a selection change while one request is pending followed by another request, Clear/Restore/sign-out retention, and fresh-instance reset. Verify the permanent selector while busy and in review, keyboard use and narrow-pane layout in Excel. No tests or application changes are made by this design.

**Tradeoff and limits.** This isolates local UI state and avoids workflow plumbing, but `LLMManager` now depends on a live read callback supplied by composition. Non-UI manager construction must provide an explicit getter (tests can return a fixed registry entry). The registry is deliberately fixed; availability and provider failures continue through existing error handling. The graph ends at request dispatch, the required system effect, rather than expanding unchanged model responses and worksheet application.

Evaluation uses the toolkit’s six unweighted counts. Its current exposure schema accepts class inventories only; modified module functions are included in changed-function counts but their local variables cannot contribute to the reported exposure total. This limitation applies to the DOM composition helper and three request builders.
