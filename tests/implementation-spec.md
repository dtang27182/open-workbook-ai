# Implementation Specification

This specification describes implementation behaviors covered by unit tests. These behaviors support user-visible features, but are tested below the live integration boundary because they depend on specific internal workflow choices.

## Behavior 1: Model Proposed Updates Are Reflected In The Generated Diff Sheet

When the model returns proposed cell edits, the assistant should create a reviewable diff sheet before applying those edits to the original sheet.

The diff sheet should show the updated sheet contents, keep the original sheet unchanged, activate the diff sheet, and highlight the changed cells.

## Behavior 2: Multiline Chat Input Preserves Drafts And Submission Semantics

`ChatInput` creates its own form and supports multiline drafts. Send and plain Enter submit the complete text once, preserving internal newlines. Shift+Enter, modified Enter shortcuts, and Enter during IME composition do not submit. Disabling the component disables both typing and Send while preserving the draft; clearing the draft leaves the same form in place.

`ChatWindow` owns the separate Clear button. It resets the conversation without submitting or deleting an unsent draft, and it retains the input component. Submission captures the message before clearing the draft. Input and Send remain disabled while a request runs or edits await review, then re-enable when the workflow permits another message.

The input grows and shrinks with content up to the height limit supplied by the parent. Panel height changes supply half the panel height; width changes recalculate wrapping. These layout behaviors require browser verification because jsdom does not calculate text layout.
