## Repository Architecture

- Read `docs/application-architecture.md` before making broad changes to module responsibilities, assistant workflows, or restore behavior.
- Read `docs/testing.md` before changing tests or the test architecture.
- Before changing Component Architecture or code under `src/taskpane`, read `docs/component-architecture.md` as the authoritative component contract and behavior description.
- Also read `docs/component-architecture-implementation-guide.md` for recommended component structure. Its guidance is not enforced by the architecture unless the architecture document says otherwise.

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

## Feature Implementation Plans (Referred to as FIP)

- Write feature implementation plans in the following order: `Behavior`, `Interface Points`, `Implementation Details`, and `Verification`.
- In `Behavior`, describe the user-visible and simulation behavior, define formulas and terminology, and state assumptions needed to make the behavior unambiguous. Keep implementation mechanics out of this section.
- In `Interface Points`, provide separate concise lists of the existing interface points that must change and the new interface points that must be created. Interface points include functions, methods, and classes. Give each interface point a one-sentence, high-level description of the required change or addition. Keep detailed mechanics in `Implementation Details`.
- In `Implementation Details`, group changes by class or module. For each interface point, describe the specific state, event, calculation, and call-path changes. Identify behavior that remains unchanged and prefer the smallest number of touched or new functions.
- In `Verification`, list behavior-focused scenarios that cover the primary behavior, boundary conditions, aggregation or sharing rules, and integration checks such as type checking and the production build.
