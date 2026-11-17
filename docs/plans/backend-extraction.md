# Backend extraction plan

Move `ChatSession` and its session state, workflows, LLM, provider, and Excel logic into `src/backend`. The backend continues to run inside the Office add-in and uses the existing Office.js workbook APIs.

## Directory layout

```text
src/
  backend/
    chat-session.ts            # ChatSession and its public types
    chat-session-state.ts
    transcript-helpers.ts      # Transcript mutation helpers
    restore-manager.ts
    excel-manager.ts
    provider-manager.ts
    auth/
      openai-key-store.ts      # OpenAIKeyStore
      openrouter-api-key.ts    # OpenrouterKeyStore
    llm/                       # Inference client, model configuration, and prompts
    workflows/                 # Submit, clarify, review, restore, and scenarios
  taskpane/                    # UI components and OpenRouter key acquisition
  auth-dialog/                 # Office dialog page and callback UI
```

## Taskpane boundary

- `TaskpaneComponent` creates one `ChatSession` and passes it through `ChatPage` to `ChatWindow`. `ChatSession` is the taskpane's only runtime import from `src/backend`. Backend modules have no imports from `src/taskpane`.
- Define the public types directly in `chat-session.ts`. Move `ChatSessionSnapshot`, `ReadonlySnapshot`, and `ChatModelOption` out of `chat-session-snapshot.ts` and remove that file. Move the transcript type declarations out of `transcript.ts` and rename the remaining helper module to `transcript-helpers.ts`. Move the `MainModelId` declaration out of `llm/main-model-options.ts`, keeping it derived from the model catalog. UI modules import their types from `chat-session.ts`.
- Keep `acquireOpenRouterApiKey()` in `src/taskpane/pages/auth/openrouter-auth/openrouter-key-exchange.ts`. The taskpane calls it and passes the resulting key to `chatSession.signIn("openrouter", apiKey)`, the same session command used for pasted OpenRouter keys. `ProviderManager` handles credential storage and provider configuration inside the session. The taskpane owns loading and error display, reads account status through `getProviderStatus()`, and dispatches `provider_changed` after sign-in or sign-out.
- Keep the existing chat command and snapshot contract. `ChatWindow` renders each snapshot from the session's `AsyncIterable`, preserving partial responses and workflow progress in the transcript. The session keeps key stores, LLM history, and workbook checkpoints internal.

## Auth extraction scope

Only these two class modules move from `src/taskpane/pages/auth` into `src/backend/auth`:

- `OpenAIKeyStore` from `add-openai-key/openai-key-store.ts` to `src/backend/auth/openai-key-store.ts`.
- `OpenrouterKeyStore` from `openrouter-auth/openrouter-api-key.ts` to `src/backend/auth/openrouter-api-key.ts`.

The modules carry their existing storage constants with them. Every other file under `src/taskpane/pages/auth` stays in place, including auth components, templates, styles, and the OpenRouter key exchange.

## Implementation sequence

1. Move the session modules and their dependencies. From `src/taskpane/pages/auth`, move only the two key store modules listed above. Update imports and test fixtures to follow the new paths.
2. Move the public type declarations into `chat-session.ts`. Check that taskpane imports from `src/backend` use only `chat-session.ts` and that no backend module imports from `src/taskpane`.
3. Run the existing unit suite, lint, and build. Verify that OpenRouter sign-in still reaches the relocated session in Excel.
