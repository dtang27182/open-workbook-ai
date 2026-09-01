## Repository Architecture

- Read `ARCHITECTURE.md` before making broad changes to the current runtime, assistant state, streaming, edit lifecycle, or test architecture.
- Before changing Component FSM architecture or code under `src/taskpane-fsm`, read `docs/taskpane-component-fsm-architecture-v2.md` as the authoritative component contract and behavior description.
- Also read `docs/component-fsm-architecture-v2-implementation-guide.md` for recommended component structure. Its guidance is not enforced by the architecture unless the architecture document says otherwise.

## Coding Style

- Prefer the simplest direct implementation.
- Avoid early returns for mutually exclusive known outcomes; express the full decision as an `if`/`else if`/`else` chain.
- Do not use fallthrough `else`, default branches, or catch-all cases for known input variants unless the fallback behavior is explicitly intended; check expected cases directly.
- Do not add defensive code preemptively.
- Do not fall back to unreliable identifiers or inferred relationships when explicit reliable IDs are absent.
- Prefer a simple monotonically increasing counter over deriving IDs from unrelated state.
- Write tests against the behavior that matters, not implementation details like ID string formats.
- Follow the repository's existing formatter and naming conventions.
- Avoid new abstractions unless they remove real duplication.
- Share helper functions for generating file names when possible.
- Keep state ownership and call paths clear. Put behavior near the object that owns the state it mutates, and avoid designs where unrelated operations repeatedly bounce through a central object.
- Do not introduce a local variable only to extract a field nested one level deep, such as assigning `const value = object.field` solely to avoid writing `object.field` at the call site.

## Markdown Style

- Align Markdown table columns with padding so the table remains readable in the source file.

## Editing Discipline

- Keep diffs narrowly scoped to the requested task. Do not make unrelated code changes, formatting churn, trailing-newline changes, indentation changes, or refactors, even when behavior-preserving. Every changed line should directly contribute to the specified task.
