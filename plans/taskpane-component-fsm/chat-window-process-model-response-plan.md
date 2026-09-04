# Chat Window Process Model Response FIP

Status: implemented.

## Goal

Move model-response processing back into `ChatWindow`. Submission and clarification remain responsible for obtaining and streaming a model response, while `ChatWindow` decides the resulting FSM state and updates the rest of the chat state.

Do not add another class or helper module for this operation.

## Scope

Move `SubmitMessageWorkflow.finalizeSubmitTransition()` to a private `ChatWindow.processModelResponse()` method. Move `createNextScenarioSheet()` and `createScenarioWithComparison()` with it because they implement the scenario branch of that transition.

Give `SubmitMessageWorkflow` and `ClarificationWorkflow` the same callback to `ChatWindow.processModelResponse()`. The callback keeps the existing parameters:

```ts
type ProcessModelResponse = (
  userRequest: string,
  workflowId: number,
  originalSheet: SheetSnapshot,
  responseEntry: ChatMessageTranscriptItem,
  response: SpreadsheetPromptCompletionEvent
) => Promise<void>;
```

Define and export the shared callback type from `chat-window.ts`. The workflows import it as a type-only dependency. Do not expose `processModelResponse()` as a public `ChatWindow` method; construct the callback inside the `ChatWindow` constructor and pass it to both workflows.

## Responsibilities

`SubmitMessageWorkflow.run()` continues to gather the active sheet, create the potential restore point, stream the normal prompt, and remove its working item. It then calls the supplied model-response callback with the submitted message and response data.

`ClarificationWorkflow.run()` continues to find the pending clarification, gather the active sheet, stream the clarification response, and remove its working item. It calls the same callback with the original workflow's human message rather than the clarification answer.

`ChatWindow.processModelResponse()`:

- stores the updated LLM conversation history;
- completes the assistant transcript entry;
- transitions to `awaiting_clarification` when another question is required;
- transitions to `answered` and discards the potential restore point for a direct answer;
- creates and analyzes a scenario, then transitions to `answered` and discards the potential restore point; or
- creates a diff and transitions to `pending_edit`, retaining the potential restore point.

Keep the current branch ordering, DOM updates, restore-manager calls, and external-effect ordering unchanged.

## Integration

Construct one callback to the private `ChatWindow.processModelResponse()` method after constructing `ChatWindowState`. Pass it to both `SubmitMessageWorkflow` and `ClarificationWorkflow`.

Remove the direct dependency from `ClarificationWorkflow` to `SubmitMessageWorkflow`. `SubmitMessageWorkflow.run()` still processes the response before returning, so the existing callbacks used by `PreprocessWorkflow`, `AcceptDiffWorkflow`, and `RejectDiffWorkflow` do not change.

Update the implemented Submit Message and Clarification Workflow FIPs to reflect that model-response processing is owned by `ChatWindow`.

## Verification

- Verify normal submission and clarification call the same `ChatWindow` model-response callback.
- Verify clarification passes the original workflow request and reuses its existing potential restore point.
- Verify clarification, answer, scenario, and pending-diff completions produce the same chat state and DOM as today.
- Verify scenario sheet numbering, comparison analysis, and LLM-history updates remain unchanged.
- Verify preprocessing and accept/reject continuations still complete through `SubmitMessageWorkflow.run()`.
- Run lint, build, unit tests, and `git diff --check`.
