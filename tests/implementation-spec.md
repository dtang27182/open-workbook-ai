# Implementation Specification

This specification describes implementation behaviors covered by unit tests. These behaviors support user-visible features, but are tested below the live integration boundary because they depend on specific internal workflow choices.

## Behavior 1: Model Proposed Updates Are Reflected In The Generated Diff Sheet

When the model returns proposed cell edits, the assistant should create a reviewable diff sheet before applying those edits to the original sheet.

The diff sheet should show the updated sheet contents, keep the original sheet unchanged, activate the diff sheet, and highlight the changed cells.

## Behavior 2: Multiline Chat Input Preserves Drafts And Submission Semantics

`ChatInput` creates its own form and supports multiline drafts. Send and plain Enter submit the complete text once, preserving internal newlines. Shift+Enter, modified Enter shortcuts, and Enter during IME composition do not submit. Disabling the component disables both typing and Send while preserving the draft; clearing the draft leaves the same form in place.

`ChatWindow` owns the separate Clear button. It resets the conversation without submitting or deleting an unsent draft, and it retains the input component. Submission captures the message before clearing the draft. Input and Send remain disabled while a request runs or edits await review, then re-enable when the workflow permits another message.

The input grows and shrinks with content up to the height limit supplied by the parent. Panel height changes supply half the panel height; width changes recalculate wrapping. These layout behaviors require browser verification because jsdom does not calculate text layout.

## Behavior 3: Review Footer Preserves Existing Edit And Restore Actions

While a regular or preprocessing diff awaits review, one Accept/Reject footer replaces the visible composer. The same input and form remain mounted, preserving their draft. Review controls render outside the transcript and input form; their disabled flags and callbacks retain their existing meaning. Clear chat remains available.

The warning identifies the actual pending diff sheet. When the review entry is removed, the footer and warning disappear and the composer returns, remaining disabled until the current workflow permits submission. An error with retained pending-edit data does not leave stale review controls or a success confirmation.

Accepted and rejected decisions show distinct confirmation strips only after the corresponding worksheet operations succeed. Acceptance preserves the existing analysis request and restore control at its saved transcript boundary. For preprocessing edits this is before the initiating request; when preprocessing proposes no edits, the subsequent main-query checkpoint already includes that request. Rejection leaves the source sheet unchanged and creates no restore control. Either preprocessing decision continues the original request, which can produce another review within the same workflow. Restore removes the same later conversation and pending diff as before.

## Behavior 4: Formula Inference Uses Structured Transcript Content

Each detection result produces one structured inference entry. Its summary, confidence, and region data render directly as an assistant bubble and sibling cards, without an additional Markdown copy. Low, medium, and high confidence fill one, two, and three bars respectively, accompanied by a readable label. Empty region lists render no cards. All provided ranges, relationships, structures, sources, and evidence remain visible and HTML-like text is escaped.

Ordinary assistant Markdown retains sanitization and is not interpreted as an inference result or a completed decision based on its wording. Human messages preserve literal text and newlines without a visible role label. Structured inference data and decision presentation annotations stay out of model conversation history and follow the existing transcript snapshot/restore behavior.
