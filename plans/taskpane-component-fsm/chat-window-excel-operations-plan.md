# Chat Window Excel Operations FIP

Status: stub for future planning. This document records the intended ownership boundary and does not authorize runtime changes yet.

## Goal

Introduce a class that owns the chat window's `excelApi` dependency and all operations currently provided by `excel-sheet-utils.ts`.

The future class should own or expose:

- `createNextDiffSheet()`;
- sheet normalization and in-memory cell edits;
- formula-reference retargeting;
- sheet Markdown formatting;
- active-sheet and named-sheet reads;
- formula writes;
- diff-sheet and scenario-sheet creation;
- applying cell edits to a sheet; and
- diff-sheet deletion.

Move `excelApi` and `createNextDiffSheet()` out of `ChatWindowState` when this class is introduced. ChatWindow workflow classes should use the new class instead of directly accessing `excelApi` or importing functions from `excel-sheet-utils.ts`.

The detailed interface, class name, ownership of diff/scenario numbering counters, treatment of pure formatting functions, construction, and migration order remain to be designed before implementation.
