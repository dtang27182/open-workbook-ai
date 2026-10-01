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
   2. The task pane displays the model dropdown with the default selection.
   3. The user selects a model from the visible task-pane dropdown.
   4. The system retains the selected model configuration for this task-pane instance.
   5. The dropdown displays the selected model.
   6. The user enters text in the chat input.
   7. The user submits the chat input.
   8. The existing chat workflow supplies the main-model request inputs.
   9. For each subsequent in-scope request, the system reads the current selected model configuration.
   10. The system sends the request to OpenRouter using that configuration.

## Design Context and Related Workflows

- `ChatWindow` owns its DOM and dispatches chat actions through `updateState()`. `createInitialDom()` composes the scope strip, transcript, `ChatInput`, and review footer. Only the composer and review footer change visibility during requests and review.
- `ChatWindowState` retains `LLMManager` separately from restorable `chatState`. Clear resets the latter, Restore replaces it, and `TaskpaneComponent` retains the chat page through sign-out/sign-in.
- `runSubmitMessageWorkflow.performActions()` and `runClarificationWorkflow.performActions()` consume the manager's streaming generators. `createScenarioWithComparison()` and `accept-diff.appendUpdateAnalysis()` make the two non-streaming main-model calls.
- `LLMManager` currently uses `openRouterModelConfig` directly in scenario comparison and in three module-level body builders. The four configurations already exist as the active object and three commented alternatives.
- Formula detection/inference use separate configuration constants and `runPreprocessPrompt()`. Preprocessing may delay the main query until preprocessing review is decided.
- `OpenRouterClient` serializes request bodies when beginning HTTP work. Its key-store lookup, streaming, failures, and response handling can remain unchanged.

## System Dataflow

[System Dataflow JSON](model-selector.sys-dataflow.json)

## Implementation Dataflow

[Implementation Dataflow JSON](model-selector.impl-dataflow.json)

`LLMManager` owns the current main-model configuration because it already owns all four request categories. `ChatWindow` owns a simple native dropdown and sends selection commands to that service. There is no new component class and no second model field in chat state. Existing workflows keep their current signatures.

### Opening, selection, and presentation — steps 1–5

- The existing Excel host opens the task pane and makes its initialized DOM visible. Construction remains a supporting path outside the core dataflow; the new visible dropdown is the output of opening the pane.
- Replace the active configuration and commented alternatives with an exported, fixed `mainModelOptions` record in `llm-manager.ts`, keyed by the four exact model IDs and containing a display label and existing config. Export `defaultMainModelId` and a key union `MainModelId`. Both UI initialization and the manager's field initializer use that default. The options preserve `reasoning.effort: medium`; both OpenAI choices retain the OpenAI provider restriction, Gemini retains `google-ai-studio`, and Claude has no provider override, matching the current code.
- Add mutable `LLMManager.mainModelConfig`, initialized from the default option, and `setMainModel(modelId)`, which replaces that field with the selected option's config. This setter is the only post-construction writer; it neither resets conversation data nor changes a workflow.
- Extend `ChatWindowDomHandlers` with `onModelChange(modelId)`. Define its callback in the existing `ChatWindow` constructor, calling `updateState({ type: model_changed, modelId })`. In `createInitialDom()`, create a visibly labeled native select above the transcript, outside the composer and review-footer regions, populate its options from the fixed record, initialize its value to the shared default, and bind the supplied callback using the chosen option's exact ID. Labels are GPT-5.6 Sol, Claude Opus 4.8, GPT-5.4 Mini, and Gemini 3.5 Flash. Existing CSS may be extended narrowly for a full-width control that fits the narrow pane.
- Add the explicit `model_changed` event branch to `ChatWindow.updateState()`. It calls the manager's setter and synchronizes the owned select's value directly under the existing mount. It performs no await and never enters `disableChatControls()`, action validation, or `configChatControls()`. Thus selection during another asynchronous update does not re-enable chat controls or alter review visibility. `validateInputForCurrentState()` and `getErrorMessage()` narrow their parameter types to exclude both `clear` and `model_changed`; their behavior remains unchanged.
- The native select is retained with the existing DOM. There is no component-owned selection copy to restore. `ChatWindow` owns the handler and DOM transition because it owns the UI and the retained manager dependency; the service remains outside the visual component tree.

### Submit and dispatch — steps 6–10

- Existing `ChatInput` keeps local input sizing behavior and invokes the existing `onSubmit` callback. The journey's Submit means the current Send action; no button text changes. `ChatWindow.updateState()` delegates to `submitMessage()`, which routes to clarification or preprocessing/main submission as today. Formula preprocessing and worksheet gathering remain unchanged.
- The unchanged main path is `submitMessage()` → `runSubmitMessageWorkflow()` → its `performActions()` → `LLMManager.runMainQueryPrompt()`. Continuation after preprocessing reaches the same main workflow. `runClarificationWorkflow()` → its `performActions()` → `runClarificationResponsePrompt()` is unchanged. Scenario and acceptance paths retain `createScenarioWithComparison()` → `runScenarioComparisonPrompt()` and `appendUpdateAnalysis()` → `runUpdateAnalysisPrompt()`.
- At each manager method's existing request-body construction, read `this.mainModelConfig`. The main, clarification, and update-analysis methods pass this value as a new final argument to their existing module-level body builders. Each builder spreads the supplied config where it previously spread `openRouterModelConfig`. Scenario comparison spreads `this.mainModelConfig` directly in its existing request body. No generic request wrapper or workflow-level capture is introduced.
- The existing `OpenRouterClient.requestStreamEvents()` receives the finished main/clarification body; `request()` receives comparison/analysis bodies. Each synchronously serializes the body before its first HTTP await. Config replacement never mutates previously chosen option objects, so an already dispatched request remains unchanged. The next body construction reads the then-current field, including a scenario follow-up or impact analysis after the user switches during the preceding request or worksheet work.
- The graph ends at HTTP dispatch, which completes the feature's required system effect. Existing streaming, response application, worksheet edits, clarification/review decisions, and errors continue as before. The existing workflow boundary supplies follow-on request inputs; it does not supply or retain a model selection.

### Lifetime and verification

- The field initializer resets selection on each newly constructed manager after task-pane reload. Clear and Restore touch `ChatState` but never this field or the selector DOM. Sign-out/sign-in retains the page, manager, and select. No storage or checkpoint schema changes are required.
- During implementation, extend the existing jsdom component and mocked HTTP tests to assert all four exact model/provider/reasoning payloads and all four request categories. Check a switch while a request is pending, before clarification, before acceptance, and before a scenario follow-up; assert unchanged already-sent bodies and updated subsequent bodies. Verify preprocessing still uses its separate configs, selection remains enabled in busy/review states, Clear/Restore/sign-out retain it, and reconstruction resets to the default. Use the existing unit, lint, and build checks; visually verify the native dropdown in Excel. No tests or application files are changed in this design stage.
- Tradeoff: the simple design adds a selection event to `ChatWindow` and a setter to `LLMManager`. The UI and manager share the exported default, while runtime request configuration has one owner. Module-level body builders gain explicit config arguments; workflows and the transport do not.

### Evaluation inventory notes

The metric tooling inventories class declarations only. [Supplemental module exposure](module-variable-exposure.json) records the 18 existing parameter/local declarations in the four modified module functions; these are outside the tool-derived exposure count. Class inventories include all accessible existing instance fields and existing parameters/locals owned by modified methods, including catch bindings. Nested callback declarations belong to their own functions and are excluded from their outer function inventories.
