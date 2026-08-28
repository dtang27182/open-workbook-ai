# Taskpane Component FSM Initial Implementation Plan

Status: implemented.

## Behavior

When `TASKPANE_IMPLEMENTATION` is `"taskpane-fsm"`, the add-in displays a taskpane implemented with the component FSM architecture. The OpenRouter authentication and chat pages are placeholders; they identify the selected page but do not provide authentication, chat, OpenRouter, or Excel behavior.

Terminology:

- **Current taskpane**: the existing implementation selected by `TASKPANE_IMPLEMENTATION = "current"`.
- **FSM taskpane**: the new implementation selected by `TASKPANE_IMPLEMENTATION = "taskpane-fsm"`.
- **Active page**: the only child page included in the taskpane component tree.
- **Signed in**: the taskpane has processed a `sign_in` event and made chat active.
- **Signed out**: the taskpane has initialized or processed a `sign_out` event and made OpenRouter authentication active.

The FSM taskpane behaves as follows:

| Situation | Result |
| --- | --- |
| Initial load | The authentication placeholder is active. |
| `sign_in` event | The chat placeholder becomes active. |
| `sign_out` event | The authentication placeholder becomes active. |

Only the active page is present in the generated taskpane view. Placeholder Sign In and Sign Out buttons on the taskpane component initiate the corresponding events so both child pages can be exercised before the real page controls exist.

The current taskpane remains unchanged. Selecting `"current"` preserves all existing authentication, chat, OpenRouter, and Excel behavior.

There are no formulas, aggregation rules, initialization config, or shared mutable page state in this feature.

## Interface Points

Existing interface points that must change:

- `src/taskpane-fsm/taskpane.ts`: replace the placeholder entry-point behavior with construction and initial rendering of `TaskpaneComponent` after Office is ready.

New interface points that must be created:

- `Component` in `src/taskpane-fsm/component.ts`: require a stable component ID and define the common view-generation and state-transition interface, with optional output generation.
- `ComponentView` in `src/taskpane-fsm/component.ts`: represent a detached component root and its stable component ID.
- `render(view, mount?)` in `src/taskpane-fsm/render.ts`: use the supplied mount for an initial render or replace the existing root with the same component ID.
- `TaskpaneComponent` in `src/taskpane-fsm/taskpane-component.ts`: own active-page state, compose the placeholder pages, and expose temporary Sign In and Sign Out controls without constructor config.
- `TaskpanePageName`, `TaskpaneState`, and `TaskpaneUpdateEvent` in `src/taskpane-fsm/taskpane-component.ts`: define the taskpane's page names, owned state, and accepted event variants.
- `OpenRouterAuthPage` in `src/taskpane-fsm/pages/openrouter-auth/openrouter-auth-page.ts`: implement a stateless component that generates the authentication placeholder.
- `ChatPage` in `src/taskpane-fsm/pages/chat/chat-page.ts`: implement a stateless component that generates the chat placeholder.

## Implementation Details

### Component contract

Add `src/taskpane-fsm/component.ts` with the `Component` contract from `taskpane-component-fsm-architecture.md`. Require every component to expose a stable, readonly `componentId`, and use it for the generated root and `ComponentView`. Keep `genOutputs` optional. Define `ComponentView` with only `componentId` and `element`; the initial mount belongs to the renderer call. `TaskpaneComponent` and the placeholder pages omit `genOutputs` because no parent, sibling, view, or effect consumes a generated computational output from them.

### Renderer

Add `src/taskpane-fsm/render.ts`. `render(view, mount?)` looks up `view.componentId` in the live document. If the root exists, replace it with `view.element`; otherwise, use the mount supplied by the initial-render caller. Do not store the mount on `ComponentView`, and do not add reconciliation, post-render callbacks, focus handling, or fallback mounts.

### Placeholder pages

Add separate `OpenRouterAuthPage` and `ChatPage` classes under `src/taskpane-fsm/pages`. Each class implements `Component`, owns no mutable state, and returns a detached `<section>` with a stable component ID, heading, and placeholder message.

The page update-event type is `never`. Its required `updateState` method has no transition behavior because there is no valid event in this feature. Do not add temporary navigation buttons or simulated authentication effects.

### TaskpaneComponent

Add `src/taskpane-fsm/taskpane-component.ts`. The zero-argument constructor constructs both placeholder pages and initializes `activePage` to `"openrouter-auth"`.

`genView()` reads `activePage` directly from taskpane state. Handle `"openrouter-auth"` and `"chat"` explicitly, generate only that child's view, and append it under the stable `taskpane-app` root. Add temporary Sign In and Sign Out buttons that invoke taskpane-owned handlers; disable the button for the active state. The root does not duplicate the layout classes already owned by `#app-body`.

`updateState()` handles the two known event variants directly:

- `sign_in` changes `activePage` to `"chat"`.
- `sign_out` changes `activePage` to `"openrouter-auth"`.

`updateState()` does not render. Future event handlers must preserve the required call order: update state, generate the new view, then render it.

The temporary button handlers follow that order and render `TaskpaneComponent` after each transition.

### FSM taskpane entry point

Replace the placeholder logic in `src/taskpane-fsm/taskpane.ts`. After `Office.onReady`, construct `TaskpaneComponent` with no arguments, call `render(taskpane.genView(), document.getElementById("app-body")!)`, and unhide `#app-body`.

The first render replaces the legacy page roots currently declared inside `#app-body`. This lets the shared `taskpane.html` continue serving both build-selected implementations without changing the existing taskpane.

Do not configure the OpenRouter client because the chat placeholder cannot make model requests. Do not modify the existing page manager, authentication page, chat page, chat state machine, workflows, CSS, HTML fragments, or build selector.

## Verification

- With `TASKPANE_IMPLEMENTATION = "taskpane-fsm"`, verify initial generation contains `taskpane-app` and only the authentication placeholder.
- Starting from the authentication page, apply `sign_in`, regenerate, and verify the chat placeholder replaces it.
- Starting from the chat page, apply `sign_out`, regenerate, and verify the authentication placeholder replaces it.
- Click the placeholder Sign In and Sign Out buttons and verify each transition rerenders the taskpane with the expected child and button enabled states.
- Render the same component twice and verify the existing component root is replaced rather than duplicated.
- Verify neither placeholder performs OpenRouter, Excel, clipboard, or authentication effects.
- Set `TASKPANE_IMPLEMENTATION = "current"` and run the production build to confirm the existing taskpane still compiles unchanged.
- Set `TASKPANE_IMPLEMENTATION = "taskpane-fsm"` and run the production build to confirm the new taskpane and its types compile.
- Run `npm run lint` and `git diff --check`; report unrelated pre-existing lint failures separately.
- Do not add or change unit or integration tests, and do not start the development server.
