# model-selector HLD Iteration Summary

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

## Clarification Questions

None

## Review Status

- Desired Behavior, Scope and Assumptions, and User Journeys: explicitly approved by the user after the scope and journey corrections.
- Evaluated iterations: 1.
- Candidate generation and evaluation: all three candidates complete and evaluated; no pending, failed, or unevaluated candidates.
- Selected design: iteration 1, candidate 2. Scope approval preceded generation; the selected implementation design is now available for review.
- Stopping reason: comparison complete; no further improvement approach identified.

## Iteration 1

### Candidates

| Candidate | Approach                                                     | Generation | Evaluation | Changed classes | Changed functions | Changed components | Changed dataflows | Changed state updates | Variable exposure |
| --------- | ------------------------------------------------------------ | ---------- | ---------- | --------------: | ----------------: | -----------------: | ----------------: | --------------------: | ----------------: |
| 1         | Selector owns selection; LLM reads through an injected getter | complete   | evaluated  |               4 |                15 |                  1 |                29 |                     1 |                70 |
| 2         | LLMManager owns selection; UI sends model-change commands      | complete   | evaluated  |               2 |                13 |                  1 |                25 |                     1 |                61 |
| 3         | ChatWindow owns selection; workflows pass request configs     | complete   | evaluated  |               3 |                17 |                  1 |                28 |                     1 |                68 |

- Candidate 1: [HLD doc](iterations/1/candidate-1/model-selector.hld.md).
- Candidate 2: [HLD doc](iterations/1/candidate-2/model-selector.hld.md).
- Candidate 3: [HLD doc](iterations/1/candidate-3/model-selector.hld.md).
- Failures: None.

### Analysis

All candidates use a labeled native dropdown above the transcript, outside the composer and review footer; retain selection outside restorable conversation state; preserve the four complete configurations; and use the current selection separately for every in-scope request. None changes formula preprocessing, transport behavior, or workflow pinning.

Candidate 1 gives local UI state to a new component and preserves workflow signatures, but adds a component class, retained child wiring, and a live getter dependency in LLMManager. Candidate 3 uses the existing chat state holder and explicit per-request arguments, but requires four workflow call sites to read and forward selection after their asynchronous work. Candidate 2 places the current configuration in the service that consumes it and has the existing ChatWindow send a direct selection command. It preserves workflow signatures without a getter dependency or new class.

Candidate 2 has fewer changed classes, functions, dataflow relationships, and exposed class declarations than both alternatives; component and state-update counts tie. Its tradeoff is adding a model-change branch to ChatWindow and narrowing two existing helper parameter types. That branch runs independently of chat-action disabling and completion, so changing the model cannot disturb active request/review controls.

The comparison used consistent graph accounting: removed constant reads are deleted edges, and request transfers carrying the selected configuration are modified edges, while transport functions remain unchanged. All three system graphs and evaluated implementation graphs passed their validators after the final edits. The current toolkit inventories variable exposure only for classes; module declarations are excluded by its schema, so that count is not a complete measure of edit surface. Candidate 2 and 3 retain supplemental module inventories. The ownership and workflow comparison supports the selection independently of that limitation.

### Improvement outcome

- `improvementApproachExists`: false
- Improvement approach: None.
- Rationale: No further improvement approach was identified. Combining candidate 1's selector class with candidate 2 would reintroduce child-component wiring; moving ownership toward candidate 3 would reintroduce request configuration plumbing. Candidate 2 already reuses the existing UI owner, request service, and request builders without a new abstraction. Removing its remaining transfers would omit selection propagation or merge unrelated responsibilities.

## Selected Design

- [High-level design](model-selector.hld.md)
- [System dataflow](model-selector.sys-dataflow.json)
- [Implementation dataflow](model-selector.impl-dataflow.json)
- Source: iteration 1, candidate 2; the three selected artifacts are copied without changes and all candidate artifacts are preserved.
- The selected design was evaluated after its last design edit. One iteration was evaluated; no candidates remain pending, failed, or unevaluated.
- This is a design-only result. The HLD includes planned behavioral and Excel UI verification; application code and tests have not been changed or executed for this task.
