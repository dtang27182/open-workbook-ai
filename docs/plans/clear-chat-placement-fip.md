# FIP: Move Clear Chat Above the Transcript

## Behavior

- Move the Clear button from the input row to the right of the “OpenRouter linked” row, directly above the transcript. Rename it **Clear chat**.
- Keep the title and Sign Out in the top row. Use the existing compact secondary button style for Clear chat, matching Sign Out's visual weight.
- Keep the provider status left-aligned and Clear chat right-aligned across the available panel width. At narrow widths, allow the status text to wrap while keeping the button label intact and avoiding horizontal overflow.
- The bottom row contains only the textarea and Send, giving the textarea the space previously occupied by Clear.
- Preserve the existing clear action: reset the conversation and restore history, retain the unsent draft, and leave worksheet contents unchanged. Keep Clear chat enabled under the same conditions as the current Clear button.
- Preserve submission, keyboard behavior, and the textarea's existing autosizing rule. This change introduces no model requests or simulation behavior.

Assumption: clearing remains an immediate action without an additional confirmation step, as it is today.

## Interface Points

Existing interface points to change:

- `ChatHeader.createInitialDom()`: render only the title and Sign Out row, transferring provider-status rendering to `ChatWindow`.
- `createInitialDom()` in `chat-window-dom.ts`: render the provider-status row and Clear chat above the transcript and remove Clear from the composer.
- `chat-page.html`: place the renamed button in the provider-status template rather than the heading template.
- `chat-page.css`: make the provider-status row span the available width and align its button to the right.

New interface points to create:

- None. Reuse the existing components, `onClear` callback, and `clear` update event.

## Implementation Details

### Component ownership

- `ChatHeader` owns the title and Sign Out DOM. `ChatWindow` owns the provider-status row, Clear chat button, transcript, and `ChatInput` child.
- Move the entire provider-status row into `ChatWindow` so the button and its binding remain inside the component whose conversation state they affect. Keep `ChatPage` composition unchanged; no sibling DOM access or callback routing through `ChatPage` is needed.
- `ChatInput` continues to exclusively own its form, textarea, and Send button.

### `chat-page.html` and `chat-page.css`

- Move `#chat-clear` into `.provider-link-details` and change its visible text to `Clear chat`. Preserve its ID, `type="button"`, and `btn btn-secondary btn-compact` classes.
- Keep the provider text and remove the unused hidden Manage OpenRouter key link from the template.
- Change `.provider-link-details` from start-aligned to stretched across the panel. Vertically center its contents, retain the existing gap, and give Clear chat `margin-left: auto`, nonshrinking sizing, and a nonwrapping label.
- Preserve the title row and form styles. Keep the existing composer wrapper with just the input mount; its flexible layout gives the textarea the released width without changing `ChatInput`.

### `ChatHeader.createInitialDom()`

- Stop cloning and appending `.provider-link-details` and remove the associated Manage OpenRouter key link setup.
- Remove the code that removes `#chat-clear` from the cloned heading, since the button is no longer in that template.
- Retain the heading and Sign Out binding. Remove only imports/global declarations made unused by this move.

### `chat-window-dom.ts` / `createInitialDom()`

- Clone `.provider-link-details` during initialization and bind its Clear chat button to the existing `handlers.onClear` callback.
- Append the provider row, transcript, and composer to the panel in that order. Append only the `ChatInput` mount to the composer.
- Keep `ChatInput` construction and the panel observer in this helper. The observer continues to supply half the `#chat-window` content height as the input limit; that container now includes the provider row. Its existing width observer handles the additional width available to the textarea.
- Leave `ChatWindowState`, `ChatWindow.updateState()`, `reset()`, and the control helpers unchanged. The existing `onClear` callback still dispatches `ChatWindow.updateState({ type: "clear" })`.

### Documentation

- Keep Component Architecture and its implementation guide unchanged: this placement change follows the existing contract.

## Verification

- In a browser and a sideloaded Excel task pane, verify the title/Sign Out row is unchanged and Clear chat appears at the right of the provider-status row above the transcript.
- Check narrow and wide panels for wrapping, spacing, button alignment, and horizontal overflow. Verify the textarea gains width and continues to grow, shrink, and scroll at its height limit.
- Confirm there is exactly one Clear chat button, it is outside the input form, and keyboard activation clears the conversation without submitting the draft.
- Clear a populated conversation with an unsent multiline draft: verify the initial transcript returns, the draft remains, and the existing input component is reused. Preserve current availability during requests and pending edit review.
- Confirm Send, Enter, Shift+Enter, and Sign Out retain their existing behavior, and the unused Manage OpenRouter key link is absent.
- Run the existing `npm run test:unit` suite, which includes TypeScript checking and clear/draft behavior, plus `npm run lint` and `npm run build`. No new test framework or live model tests are needed for this placement change.
