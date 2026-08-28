# OpenRouter Auth Component Implementation Plan

Status: implemented.

## Behavior

When the FSM taskpane is selected and no OpenRouter key is stored, the taskpane displays the same OpenRouter authentication content, styling, and sign-in behavior as the current taskpane. The authentication page is implemented through the component FSM contract rather than the legacy page lifecycle and direct live-DOM rendering methods.

Terminology:

- **Select provider**: the authentication page is waiting for the user to start sign-in.
- **Signing in**: the OpenRouter OAuth dialog and authorization-code exchange are in progress.
- **Authentication error**: sign-in failed or was cancelled and the page is waiting for another attempt.
- **Signed in**: the acquired OpenRouter key has been stored and the chat placeholder is active.

The authentication component behaves as follows:

| Situation                                | Visible behavior                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Initial load without a stored key        | Show the existing provider description and enabled “Sign in with OpenRouter” button.                               |
| Initial load with a stored key           | Skip authentication and show the chat placeholder.                                                                 |
| Sign In clicked                          | Disable the button, show “Signing in…”, and display the existing completion instruction while the OAuth flow runs. |
| OAuth succeeds                           | Store the returned key and replace the authentication page with the chat placeholder.                              |
| OAuth fails or is cancelled              | Restore the enabled sign-in button and display the existing error message.                                         |
| Sign Out clicked on the chat placeholder | Clear the stored key and return to a reset authentication page.                                                    |

The existing HTML text, CSS classes, OAuth dialog behavior, PKCE generation, authorization-code exchange, persistence key, cancellation behavior, and error messages remain unchanged. The existing `openrouter-auth-page.css` continues styling both taskpane implementations.

The temporary taskpane-level Sign In button is removed because the authentication page owns the real button. The temporary Sign Out button remains available with the chat placeholder until the chat component is implemented.

The chat page remains a placeholder. This feature does not configure the OpenRouter model client, send model requests, or add Excel behavior.

## Interface Points

Existing interface points that must change:

- `OpenRouterAuthPage` in `src/taskpane-fsm/pages/openrouter-auth/openrouter-auth-page.ts`: replace the stateless placeholder with the stateful authentication component while reusing the current HTML fragment and taskpane-owned sign-in handler.
- `TaskpaneComponent` in `src/taskpane-fsm/taskpane-component.ts`: own the shared key store and OAuth coordination, initialize the active page from stored authentication state, and replace the temporary Sign In control with the real auth-page flow.
- `TaskpaneComponent.genView()`: render the real authentication component when signed out and retain only a temporary Sign Out control with the chat placeholder.
- `TaskpaneComponent.updateState(event)`: coordinate auth-child reset/success state, key clearing, and active-page changes for `sign_in` and `sign_out`.
- `TaskpaneComponent.handleSignIn()`: replace the simulated page switch with the asynchronous OAuth flow and targeted intermediate auth-page renders.

New interface points that must be created:

- `OpenRouterAuthState` in `src/taskpane-fsm/pages/openrouter-auth/openrouter-auth-page.ts`: represent `select_provider`, `signing_in`, and error phases with the error message stored in the error variant.
- `OpenRouterAuthUpdateEvent` in `src/taskpane-fsm/pages/openrouter-auth/openrouter-auth-page.ts`: define the explicit started, succeeded, failed, and reset transitions.
- `OpenRouterAuthPage.constructor(onSignIn)`: store the taskpane-owned asynchronous sign-in handler directly and initialize the page to `select_provider`.

The existing `acquireOpenRouterApiKey()`, `OpenrouterKeyStore`, auth HTML fragment, auth CSS, and auth-dialog entry points do not change.

## Implementation Details

### Existing auth assets and services

Import `openrouter-auth-page.html?raw`, `acquireOpenRouterApiKey()`, and `OpenrouterKeyStore` directly from `src/taskpane/pages/openrouter-auth`. Do not copy these files or fork their behavior. The existing taskpane HTML already loads `openrouter-auth-page.css`, so no new stylesheet or CSS import is needed.

This cross-implementation import is intentional for the migration: the HTML fragment, credential store, and OAuth handshake are shared implementation assets, while the legacy `OpenRouterAuthPage` class is not reused.

### OpenRouterAuthPage state

Replace the placeholder state with:

```ts
type OpenRouterAuthState =
  | { phase: "select_provider" }
  | { phase: "signing_in" }
  | { phase: "error"; message: string };
```

Handle these events explicitly:

```ts
type OpenRouterAuthUpdateEvent =
  | { type: "sign_in_started" }
  | { type: "sign_in_succeeded" }
  | { type: "sign_in_failed"; message: string }
  | { type: "reset" };
```

`sign_in_started` enters `signing_in`. `sign_in_failed` enters the error phase with its supplied message. `sign_in_succeeded` and `reset` return the page to `select_provider`, ready for a later sign-out or new attempt.

`genView()` derives the existing presentation directly from each phase:

- `select_provider`: enabled button, “Sign in with OpenRouter”, no status, and no error;
- `signing_in`: disabled button, “Signing in…”, the existing completion instruction, and no error;
- `error`: enabled button, “Sign in with OpenRouter”, no status, and the stored error message.

Do not store button-disabled, button-label, status, or visibility flags independently from the authentication state.

### OpenRouterAuthPage view

`genView()` creates a detached `<section>` using the component’s stable ID and `auth-view` class, inserts the existing raw HTML fragment, applies the current state to the existing element IDs, and binds the stored `onSignIn` handler to the existing button. Do not add `genOutputs()` or an auth-output type because no data from this component crosses a component boundary or feeds an external effect.

Do not add an `OpenRouterAuthPageConfig` type. The page has no startup configuration; its only constructor dependency is the stable `onSignIn` handler, which is accepted directly.

Set the sign-in button’s `autofocus` property in the selectable and error phases so initial and retry renders retain the current focus behavior without mutating attached DOM from `genView()`.

The component does not call `acquireOpenRouterApiKey()`, store credentials, change the active page, or invoke the renderer. Those operations affect both authentication and taskpane state and remain owned by `TaskpaneComponent`.

### TaskpaneComponent authentication coordination

Keep the `TaskpaneComponent` constructor argument-free. Construct one `OpenrouterKeyStore`, initialize `activePage` to chat when it already has a key and authentication otherwise, and construct `OpenRouterAuthPage` with `handleSignIn`.

Change `handleSignIn` to the following call path:

1. Send `sign_in_started` to `OpenRouterAuthPage`.
2. Render only the authentication component so progress appears without replacing the taskpane root.
3. Await `acquireOpenRouterApiKey()` unchanged.
4. Store the returned key in the shared `OpenrouterKeyStore`.
5. Send `sign_in` to `TaskpaneComponent`; this delegates `sign_in_succeeded` to the auth child and changes the active page to chat.
6. Render `TaskpaneComponent` so the chat placeholder replaces authentication.

If acquisition throws, convert the value to the same user-facing message used by the current page, send `sign_in_failed` to the auth child, and render only the auth component.

For `sign_out`, clear the key store, send `reset` to the auth child, and change the active page to authentication before rerendering the taskpane.

### Temporary taskpane controls

Remove the temporary taskpane-level Sign In button and its simulated handler. Generate the temporary Sign Out button only when chat is active. Its handler continues to follow `updateState → genView → render` and will be removed when the real chat header is ported.

Leave `src/taskpane-fsm/taskpane.ts`, the chat placeholder component, the legacy taskpane implementation, OAuth handshake implementation, auth dialog, HTML fragment, and CSS unchanged.

## Verification

- With no stored key, verify the FSM taskpane initially renders the existing auth heading, provider description, sign-in button, status element, and error element with the existing classes and text.
- With a stored key, verify the FSM taskpane initially renders only the chat placeholder and temporary Sign Out button.
- Click Sign In and verify the button is disabled, its label changes to “Signing in…”, the completion instruction appears, and the error remains hidden.
- Complete OAuth successfully and verify the returned key is stored and the chat placeholder replaces the auth component.
- Cancel the dialog and verify the existing cancellation message appears with an enabled, focused sign-in button.
- Exercise an authorization rejection and a generic failure and verify the current error messages and retry behavior are preserved.
- Click the temporary Sign Out button and verify the stored key is removed and a reset auth page replaces chat.
- Verify repeated sign-in attempts do not fork or duplicate the existing OAuth handshake logic.
- Verify the current taskpane still uses its existing page class and behaves unchanged.
- Build both `TASKPANE_IMPLEMENTATION` selections for production and run a focused TypeScript check for `src/taskpane-fsm`.
- Run `npm run lint` and `git diff --check`; report unrelated pre-existing lint failures separately.
- Do not add or change unit or integration tests, and do not start the development server.
