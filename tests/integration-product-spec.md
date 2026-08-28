# Integration Product Specification

This specification describes the user-visible assistant behaviors covered by the integration tests. Each tested behavior maps to one integration test.

## Behavior 1: Analysis Request Does Not Edit The Sheet

When the user asks an analysis-only question, such as:

```txt
Summarize what this spreadsheet contains.
```

The assistant should:

- return a non-empty response message
- leave the spreadsheet unchanged

## Behavior 2: Accepted Sheet Edit Request Updates The Intended Cells

When the user asks for a sheet edit, such as:

```txt
Make all column headers lower case.
```

The assistant should:

- return a non-empty response message
- create a reviewable diff without immediately editing the original sheet

When the user accepts the diff, the assistant should:

- update the header row to:

```ts
["product", "units", "price", "growth", "revenue"];
```

- preserve formulas and unrelated cells
- apply targeted cell edits rather than replacing the whole sheet

## Behavior 3: Rejected Sheet Edit Request Does Not Edit The Sheet

When the user asks for a sheet edit, such as:

```txt
Make all column headers lower case.
```

The assistant should:

- return a non-empty response message
- create a reviewable diff without immediately editing the original sheet

When the user rejects the diff, the assistant should:

- leave the original spreadsheet unchanged
- remove the reviewable diff
- not create a restore control for the rejected edit

## Behavior 4: Follow-Up Requests Use Conversation Context

When the user makes a series of analysis-only requests, the assistant should retain enough conversation context to answer follow-up questions.

Example flow:

```txt
Remember this label: alpha-test-forecast.
What label did I ask you to remember?
```

The assistant should answer with the remembered label.

## Behavior 5: Restore Reverts An Accepted Sheet Edit And Later Chat Context

When the user accepts an assistant-created diff, the chat transcript should show a restore control before the human message that started that edit.

When the user clicks that restore control, the assistant should:

- restore the spreadsheet to the checkpoint from before that edit
- remove the transcript entries for that edit and any later messages
- revert the assistant conversation context to the same checkpoint

## Behavior 6: Analysis Request Can Trigger Accepted Preprocessing Edit

From a new chat session, when the active sheet contains hardcoded calculated values and the user asks an analysis-only question, the assistant should:

- create a reviewable preprocessing diff before answering the analysis question
- leave the original sheet unchanged until the user accepts the diff

When the user accepts the preprocessing diff, the assistant should:

- apply the inferred formula edits
- continue with the original analysis question

## Behavior 7: Restore Reverts An Accepted Preprocessing Edit

When the user accepts a preprocessing diff, the chat transcript should show a restore control for that preprocessing edit.

When the user clicks that restore control, the assistant should:

- restore the spreadsheet to the checkpoint from before preprocessing
- remove the transcript entries for the preprocessing edit and any later messages

## Behavior 8: Accepted Preprocessing Does Not Repeat For The Same Sheet

After the preprocessing workflow has run for a sheet and the user accepts the preprocessing diff, later user queries against the same sheet should not trigger another preprocessing review.

## Behavior 9: Rejected Preprocessing Does Not Repeat For The Same Sheet

After the preprocessing workflow has run for a sheet and the user rejects the preprocessing diff, later user queries against the same sheet should not trigger another preprocessing review.
