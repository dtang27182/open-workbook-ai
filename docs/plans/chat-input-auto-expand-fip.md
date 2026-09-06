# FIP: Automatically Expanding Chat Input

## Behavior

- Replace the single-line chat field with a multiline field that grows as the user types or pastes text. Both explicit newlines and text wrapping onto another visible line increase its height.
- Start at one visible line and grow as needed up to half the chat panel's height. Beyond that limit, scroll vertically inside the field while keeping the caret reachable. Long unbroken text wraps without horizontal scrolling.
- Shrink the field when text is deleted, cut, or undone. Recalculate its height when the task pane width or chat panel height changes, including when a retained chat page becomes visible again.
- Keep Clear and Send at their normal height, aligned with the bottom of the field. The transcript gives up space as the field grows and remains independently scrollable.
- Preserve Enter-to-send behavior. Shift+Enter inserts a newline. Enter used to confirm an IME composition must not send a message. Send submits the complete text, preserving internal newlines; visual wrapping does not insert newlines into the submitted value.
- When submission clears the draft, immediately return the field to one line. Preserve the existing Clear behavior: it resets the conversation but retains an unsent draft and its height.
- Preserve the accessible label, placeholder, and existing enabled/disabled rules during requests and pending edit review.

Assumptions: the chat panel is the `#chat-window` content area containing the transcript and input form, excluding the page header; manual dragging to resize is unnecessary. A visible line includes either a wrapped line or a line separated by a newline. Use an 18px line height with the existing 14px total vertical padding and 2px total border: `height = min(max(contentHeight, 34px), panelHeight / 2)`, where `contentHeight` includes padding and borders and `panelHeight` is the chat panel's available content height. The half-panel cap takes precedence over the one-line minimum in an unusually short panel. This is a presentation change; worksheet, model, and simulation behavior remain unchanged.

## Interface Points

Existing interface points to change:

- `ChatWindow.constructor()`: construct a `ChatInput` child, retain it in `ChatWindowState`, and observe the panel height to supply the child's height limit.
- `ChatWindowState.constructor()`: accept and retain the `ChatInput` instance as a readonly field outside restorable `ChatState`.
- `ChatWindow.submitMessage()`: send the child a clear event after reading the submitted message.
- `ChatWindow.reset()` and `updateState()`: pass `this.state.chatInput` to their existing control-helper calls.
- `createInitialDom()`: create and bind the parent-owned Clear button beside an empty child mount, returning the mount and panel element without creating the child's form or controls.
- `disableChatControls()` and `configChatControls()`: accept a `ChatInput` argument and delegate input and Send button enabled/disabled updates while preserving their transcript updates.
- `chat-page.html` and `chat-page.css`: provide the form template used by `ChatInput` and the bounded expanding layout.

New interface points to create:

- `ChatInput` in `chat-input/chat-input.ts`: a small leaf component under `chat-window/` that exclusively owns the form, label, textarea, Send button, and their DOM bindings.
- `ChatInputUpdateEvent`: define the three sizing scenarios and the existing enabled/disabled control transition.
- `ChatInput.constructor(mount, onSubmit)`: create the complete form under its mount, bind local events and the ancestor-owned submit callback, and observe its textarea's width.
- `ChatInput.getMount()`: return the child's permanent mount.
- `ChatInput.updateState(event)`: handle local input changes, panel resizing, clearing, and disabled-state updates.
- `ChatInput.resizeChatInput()`: a private helper that measures and applies the bounded textarea height.

## Implementation Details

### `ChatInput`

Use these update events:

```ts
type ChatInputUpdateEvent =
  | { type: "input_changed" }
  | { type: "panel_resized"; maxHeight: number }
  | { type: "clear" }
  | { type: "set_disabled"; disabled: boolean };
```

The first three events cover the requested sizing scenarios. `set_disabled` preserves existing chat control behavior while keeping all textarea mutations inside its owning component.

- The constructor receives only a permanent empty mount and the `onSubmit(message: string)` callback owned by `ChatWindow`. Clone the form, label, textarea, and Send button from the existing template and attach the complete form beneath the mount. Retain the form, textarea, and Send button references needed for event handling and updates. The child has no panel reference and does not inspect ancestor DOM.
- Keep the draft value in the textarea. Store the latest supplied `maxHeight`, element references, width observer, and previous observed width needed for sizing; do not duplicate the draft or calculated textarea height. Initialize `maxHeight` from the preferred one-line CSS height until the parent supplies the first measured limit.
- Bind the textarea's `input` event to `this.updateState({ type: "input_changed" })`. Typing, paste, cut, and undo then share this path.
- Create a local `ResizeObserver` that watches only the textarea's width. When it changes, dispatch `this.updateState({ type: "panel_resized", maxHeight: this.maxHeight })` to reflow using the latest parent-supplied height limit. Ignore changes to the textarea's own height so autosizing does not repeatedly trigger itself. Record zero-width transitions so reattaching at the previous width still recalculates. The observer follows the existing retained component's lifetime.
- In `updateState()`, use an explicit `if`/`else if` chain. `input_changed` calls the private sizing helper. `panel_resized` stores the supplied `maxHeight` and calls the helper; this event handles both new parent-supplied limits and local width changes. `clear` empties the textarea and calls the same helper. `set_disabled` assigns both the textarea's and Send button's disabled state without clearing or resizing the draft.
- Bind form submission inside the child: prevent the default submit action and invoke `onSubmit(this.input.value)` when submission is enabled. For plain Enter outside composition, prevent the default newline and call the owned form's `requestSubmit()` when Send is enabled. Enter and clicking Send therefore share one form handler. Leave Shift+Enter and other modified Enter shortcuts to native textarea behavior.
- Reserve the child's `clear` event for emptying the draft after submission. The child does not clear itself on a submit attempt; `ChatWindow` sends `clear` at the existing value-reset point after workflow validation. The conversation's Clear button and its callback belong entirely to `ChatWindow`.
- Expose only the component contract to the parent. The child supplies submitted text through `onSubmit(message)`, so no draft getter is needed. Post-construction form/control mutations run through `ChatInput.updateState()`; local input and layout events do not pass through `ChatWindow.updateState()`.

The three sizing call paths are:

```text
Textarea input event
  -> ChatInput.updateState({ type: "input_changed" })
  -> resizeChatInput()

ChatWindow's panel ResizeObserver callback
  -> state.chatInput.updateState({ type: "panel_resized", maxHeight: panelHeight / 2 })
  -> store maxHeight, then resizeChatInput()

ChatInput's textarea-width ResizeObserver callback
  -> ChatInput.updateState({ type: "panel_resized", maxHeight: this.maxHeight })
  -> resizeChatInput()

ChatWindow.submitMessage()
  -> ChatInput.updateState({ type: "clear" })
  -> clear the draft, then resizeChatInput()
```

### `ChatInput.resizeChatInput()`

- Use the stored `maxHeight` supplied through `panel_resized` and derive the effective minimum from the preferred CSS minimum. The helper only measures the owned textarea; it neither measures the panel nor calculates the half-panel limit.
- Temporarily reset the textarea height to the effective minimum and hide vertical overflow, then read `scrollHeight` plus the computed top and bottom border widths and clamp that measurement to the effective minimum and maximum heights. Resetting before measuring allows shrinking as well as growth.
- Enable vertical overflow only when the measured content exceeds the cap. Preserve the element, value, focus, and selection. Keep sizing separate from transcript rendering and control configuration.
- Defer measurement while the textarea is detached or has zero width, or the supplied height limit is zero. The width or panel observer triggers recalculation when it becomes visible. Clearing still empties the draft and resets its inline sizing so stale expanded dimensions are not retained.

### Chat template and styles

- Keep the form markup in `chat-page.html` as a template cloned exclusively by `ChatInput`. Replace its single-line input with `<textarea id="chat-input" rows="1">`, retaining the label association, placeholder, and autocomplete setting and removing the input-only `type` attribute. `ChatWindow` continues to clone the existing Clear button template for its own DOM outside the child's mount and form.
- Add a parent-owned `.chat-composer` row beneath the transcript containing the Clear button followed by `.chat-input-mount`. Use a nonshrinking flex row with an 8px gap and bottom alignment to preserve the current Clear/input/Send arrangement. Give the child mount flexible width and `min-width: 0`. The child-owned form fills the mount's width; the textarea retains the existing input's flexible width and `min-width: 0`. Preserve padding, border, and font size; explicitly inherit the font family and set `line-height: 18px`.
- Use border-box sizing, a preferred minimum height of 34px, `resize: none`, and wrapping for long text. Keep the preferred minimum in a CSS custom property and read it in the sizing helper rather than duplicating the constant. Have the helper apply the supplied `maxHeight` and set the effective minimum to the smaller of that cap and the preferred minimum.
- Set `.chat-form` to align its controls at the bottom. Preserve its existing nonshrinking flex behavior and the transcript's flexible, scrollable layout.

### `ChatWindowState`

- Add `readonly chatInput: ChatInput`, accept the instance as a required constructor argument, and assign it during construction. Keep this reference on `ChatWindowState`, not in restorable `ChatState` or a separate field on `ChatWindow`.
- Resetting or restoring `chatState` retains the same input component. Workflow functions that already receive `ChatWindowState` can access `state.chatInput` directly when needed.

### `ChatWindow` and `chat-window-dom.ts`

- Have `createInitialDom(mount, handlers)` create the panel, transcript, and composer row containing the Clear button and empty permanent child mount, returning the child mount and panel element. Retain the Clear button cloning and `handlers.onClear` binding, placing the button outside the child's mount and form. Remove form cloning and submission bindings. For the child, this helper creates only the mount; it never queries or mutates the child's form or controls.
- In `ChatWindow.constructor()`, create the initial DOM, construct `ChatInput` with the returned child mount and `domHandlers.onSubmit`, then pass the child into `new ChatWindowState(...)` before calling `reset()`. This makes the child available at state construction without optional fields or later initialization.
- After initializing state, register a `ResizeObserver` on the returned panel element. When its content height changes, call `this.state.chatInput.updateState({ type: "panel_resized", maxHeight: panelHeight / 2 })` directly from the callback. The initial observer notification supplies the first measured limit. Observe the full panel rather than the shrinking transcript or growing form so autosizing does not change its own cap. Record and forward zero-height transitions so reattaching at the previous height still updates the child. Retain the observer for the lifetime of `ChatWindow`; no new `ChatWindowUpdateEvent` is needed because the callback delegates the DOM update to the child's update entry point.
- Preserve `ChatWindowDomHandlers.onSubmit(message: string)` and its existing callback that dispatches `submit_message`. `ChatInput` reads its owned textarea and supplies the message; `ChatWindow` does not read form DOM or call a getter. Preserve `onClear()` and its existing conversation-reset event, binding it only in the parent's DOM helper. Keep Clear enabled as it is today; clicking it does not send the child's `clear` event.
- In `submitMessage()`, replace the direct textarea value assignment with `this.state.chatInput.updateState({ type: "clear" })` before starting either clarification or normal submission work. The submitted message has already been captured, so clearing does not change its contents.
- Add a `chatInput: ChatInput` argument to `disableChatControls()` and `configChatControls()`. Each caller passes the instance from its `ChatWindowState`. The current call sites are in `ChatWindow.reset()` and `ChatWindow.updateState()`, not the workflow modules; pass `this.state.chatInput` at those sites without relocating them.
- In `disableChatControls()`, replace the direct textarea and Send button mutations with `chatInput.updateState({ type: "set_disabled", disabled: true })`. In `configChatControls()`, send the same event with `disabled: isPendingEdit`, using its existing pending-edit calculation. These helpers retain transcript updates but no longer query or mutate form controls. Callers do not duplicate the disabled-state calculation or send separate enabled/disabled events.
- Keep `ChatWindowUpdateEvent`, workflow validation, and error handling unchanged. `reset()` retains the draft as before and reuses the child instance. Model requests and restore workflows remain unchanged.

### Documentation and verification coverage

- Update `docs/developer/component-architecture.md` during implementation to show `ChatInput` beneath `ChatWindow`, retained in `ChatWindowState`, and describe its exclusive form/input/Send DOM ownership, local input/width events, parent-supplied height limits, and control-helper delegation. Document that `ChatWindow` observes its own panel and owns the Clear button outside the child, while the child invokes the parent-owned submission callback. Align the `ChatWindowState` responsibility description in `docs/developer/application-architecture.md`. No exception to the component contract is needed.
- Add the multiline submission behavior to `tests/implementation-spec.md` and focused child-component and chat integration coverage in the existing unit suite. Use mocked model responses where submission reaches the workflow.
- Use real browser and Excel checks for text wrapping and height measurement; jsdom does not provide real layout. If needed, provide a minimal observer test double in the existing test setup without asserting observer implementation details.

## Verification

- Empty input and a short draft occupy one line. Typing wrapped text, inserting Shift+Enter, and pasting multiple lines expand the field as needed, including beyond six lines when the panel has room.
- The textarea's outer height never exceeds half the panel's content height. Content beyond that cap scrolls inside the field. Long URLs or unbroken strings wrap, and the caret remains reachable at the end of a long draft.
- Deleting, cutting, and undoing text shrink the field; deleting everything restores its effective minimum height. Crossing the half-panel boundary in either direction updates scrolling correctly.
- Narrowing and widening the task pane reflow an existing draft and adjust height. Increasing and decreasing panel height recalculate the cap, expanding or shrinking a long draft without further typing. Check an unusually short panel where the cap is below the preferred one-line height.
- Sign out and back in with a retained draft, including changing the pane width or height while chat is detached, and verify correct sizing. Confirm that resizing the textarea does not cause repeated observer updates or layout oscillation.
- Enter and Send each submit once with internal newlines preserved. Shift+Enter inserts a newline without submitting, and IME confirmation does not send. Verify typing and resizing do not invoke model or worksheet operations.
- Submission collapses the field immediately, including clarification responses. Clear resets the conversation and retains the unsent draft. Requests and pending edit review disable both the textarea and Send button while preserving the existing Clear button behavior.
- Construct `ChatInput` with only an empty mount and submit callback and verify it creates a complete working form. Supply different `maxHeight` values through `panel_resized` and verify sizing uses the supplied limit without needing a surrounding panel. Verify Send and Enter deliver the same full draft to the submit callback. In `ChatWindow` coverage, verify panel height changes supply half that height to the child and the parent-owned Clear button resets the conversation without submitting or emptying the draft. Reset and restore retain the existing child and form.
- In a browser and a sideloaded Excel task pane, verify bottom-aligned buttons, independently scrolling transcript, narrow-pane layout, keyboard focus, and accessible labeling.
- Run `npm run test:unit` for unit coverage and TypeScript checking, `npm run lint`, and `npm run build` for the production bundle. Live model integration tests are unnecessary unless their coverage or model behavior changes.
