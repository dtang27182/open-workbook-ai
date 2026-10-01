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
   2. The system shows the model dropdown with the default selection.
   3. The user selects a model from the task-pane dropdown.
   4. The system retains the selected model for the task-pane instance.
   5. The system displays the selected model in the dropdown.
   6. The user enters text into the chat input.
   7. The user submits the chat input.
   8. The system reads the worksheet and conversation context required for the request.
   9. The system reads the current selected model when each in-scope request is ready.
   10. The system sends each subsequent main-query, clarification-response, scenario-comparison, or impact-analysis request with the selected model configuration.

## Design Context and Related Workflows

- `ChatWindow` owns chat events and delegates asynchronous work to functions that already receive its retained `ChatWindowState`. `ChatState` is the separate restorable conversation snapshot.
- `LLMManager` currently applies one hard-coded `openRouterModelConfig` at four construction sites: three request builders and `runScenarioComparisonPrompt`. The three alternative configurations are commented beside the active configuration.
- Main-query and clarification calls originate in their workflow modules' `performActions`; scenario comparison starts in `createScenarioWithComparison`; accepted-change analysis starts in `appendUpdateAnalysis` after worksheet work.
- Preprocessing can delay or defer the original main query. Its continuation calls the same submit workflow after preprocessing, acceptance, or rejection. Formula detection and inference use separate configurations.
- `disableChatControls` and `configChatControls` target the composer, review footer, and restore actions. `updateReviewWarning` updates the scope strip. Transcript rendering replaces only the messages container.
- Clear replaces `chatState`; Restore restores that snapshot. `TaskpaneComponent` retains its `ChatPage` and `ChatWindow` when signing out and back in.

## System Dataflow

[System Dataflow JSON](model-selector.sys-dataflow.json)

The flow ends at request dispatch. Existing model results and worksheet edits explain later request contexts but are not additional user journeys or newly designed response paths.

## Implementation Dataflow

[Implementation Dataflow JSON](model-selector.impl-dataflow.json)

`ChatWindow` owns selection in its existing `ChatWindowState` holder, outside `chatState`. The existing workflow functions explicitly supply the latest configuration to `LLMManager`. The manager receives a request argument and retains no selection state. This keeps the request contract explicit at the cost of touching all four workflow call sites.

- **Task-pane opening (steps 1–2).** The existing `Office.onReady` callback in `taskpane.ts` reveals the initialized `app-body` after constructing the component tree. The new selector appears with that existing page reveal. Construction supplies its initial DOM and default before the selection action; the core graph represents page visibility, not object setup.
- **Fixed options and initialization.** Add `llm/main-models.ts` containing a readonly list of the four existing configurations, their user-facing labels, a default configuration, and the `MainModelConfig` type. The labels are GPT-5.6 Sol, Claude Opus 4.8, GPT-5.4 Mini, and Gemini 3.5 Flash. Preserve `reasoning: { effort: "medium" }` on every entry. Sol and Mini retain provider order `["openai"]` and disabled fallbacks; Flash retains `["google-ai-studio"]` and disabled fallbacks; Opus retains its omitted provider field. Remove the old active constant and commented alternatives after these become the single source of configuration. Add `selectedMainModelConfig`, initialized to Sol, directly on `ChatWindowState`, beside `chatState`. No new state-holder constructor parameter is needed.
- **Dropdown ownership (steps 3–5).** Extend `ChatWindowDomHandlers` with `onModelChange(config)` and add a `select_model` update event. The existing `ChatWindow` constructor supplies the ancestor-owned handler through `createInitialDom`. That DOM helper builds a labelled native select between the scope strip and transcript, outside the composer and review footer. Its option bindings use the catalog entries directly; native change selects the corresponding catalog config, without heuristic lookup or fallback. Pass the default configuration to initial DOM creation so the initial UI and state agree. `ChatWindow.updateState` handles `select_model` in its own explicit branch, assigns `state.selectedMainModelConfig`, and calls added `renderSelectedModel(mount, config)`. This helper synchronizes the select from owned state. The branch performs no conversation validation, busy-control update, worksheet action, or await. Narrow the two existing validation/error helper parameter types to exclude this event as well as Clear. Their behavior is unchanged. Selection remains enabled and visible during running work and review.
- **Submit and latest-value reads (steps 6–9).** `ChatInput` and its existing submit callback pass the user's text through `ChatWindow.updateState` and `submitMessage` to the current workflow. Retain all current worksheet/context gathering and preprocessing. Modify only the main workflow `performActions`, clarification workflow `performActions`, `createScenarioWithComparison`, and accept workflow `appendUpdateAnalysis` to pass `state.selectedMainModelConfig` directly as the final argument of their respective manager calls. Each read occurs after that call site's sheet reads or other awaits. Never capture the configuration in `submitMessage`, workflow entry, `gatherInputs`, a restore checkpoint, or `pendingEdit`. Existing preprocess continuations automatically use the latest selection through the unchanged shared submit workflow entry. The scenario call reads after scenario creation and recalculation; acceptance analysis reads after accepted edits and updated-sheet reading.
- **Request construction and dispatch (step 10).** Add the required final `MainModelConfig` argument to `runMainQueryPrompt`, `runClarificationResponsePrompt`, `runScenarioComparisonPrompt`, and `runUpdateAnalysisPrompt`. The main, clarification, and analysis methods pass it through their existing request builders; each builder spreads that supplied configuration instead of the removed constant. Scenario comparison spreads the argument in its inline request body. Prompt text, history formatting, tools, schemas, output limits, and response parsing retain their current behavior. `OpenRouterClient.request` and `requestStreamEvents` remain unchanged and immediately serialize the constructed body before awaiting HTTP. Existing API-key reads remain unchanged. In this code path, there is no asynchronous gap between the call-site configuration read and request construction/dispatch; generators are immediately consumed by their existing `for await` loops.
- **Timing and lifetime.** A selected catalog entry is immutable; changing the selection replaces the field, so an already dispatched request keeps its original body. Every later manager invocation gets a fresh call-site read, including later calls in the same workflow. No workflow record owns a model choice. Clear and Restore only replace `chatState` and leave the sibling field and dropdown intact. Sign-out detaches the retained chat page without reconstruction. A new task-pane instance constructs a new state holder and resets to Sol.

The JSON includes the unchanged task-pane reveal callback, unchanged workflow entry points and client functions to preserve the direct call paths. Its constructor/DOM initialization entries are marked outside the core user flow because construction precedes the selection action. All four changed request paths are represented. Variable exposure is inventoried from the current TypeScript declarations; the companion [exposure audit](model-selector.exposure-audit.json) also records module-function declarations, which the supplied metric schema does not include in its class-only exposure count.

### Future verification

- Use existing jsdom component tests and captured mock HTTP request bodies to verify the four dropdown options, default, and each complete model/provider/reasoning configuration.
- Exercise main query, clarification, scenario comparison, and accepted-change analysis; assert the selected configuration at the outgoing request boundary.
- Hold worksheet work or an earlier request open, change the selector, then release it. Verify that already dispatched bodies stay unchanged and later requests use the new configuration, including preprocessing continuations.
- Verify unchanged detection/inference request bodies; selection remains operable during busy work and pending review; Clear, Restore, and sign-out/sign-in retain the choice; a newly constructed pane resets it.
- Run the repository's relevant unit/type checks, lint and build when implementing, then inspect native dropdown layout and keyboard access in the Excel task pane. No tests or application code are changed by this design.

### Tradeoffs

The design uses the existing state owner and introduces no selection service or callback dependency inside `LLMManager`. Explicit request arguments make tests and per-call behavior straightforward. The tradeoff is a broader edit across workflow call sites and builder signatures; any future main-model request category must deliberately pass a current configuration. Keeping UI construction in the existing DOM helper avoids another component class but increases that helper's responsibility slightly.
