# Implementation Specification

This specification describes implementation behaviors covered by unit tests. These behaviors support user-visible features, but are tested below the live integration boundary because they depend on specific internal workflow choices.

## Behavior 1: Model Proposed Updates Are Reflected In The Generated Diff Sheet

When the model returns proposed cell edits, the assistant should create a reviewable diff sheet before applying those edits to the original sheet.

The diff sheet should show the updated sheet contents, keep the original sheet unchanged, activate the diff sheet, and highlight the changed cells.
