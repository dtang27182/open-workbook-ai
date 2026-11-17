# Implementation Specification

This specification describes implementation behaviors covered by unit tests. These behaviors support user-visible features, but are tested below the live integration boundary because they depend on specific internal workflow choices.

The preprocessing workflow remains implemented but is disabled during normal chat submissions.

## Behavior 1: Model Proposed Updates Are Reflected In The Generated Diff Sheet

When the model returns proposed cell edits, the assistant should create a reviewable diff sheet before applying those edits to the original sheet.

The diff sheet should show the updated sheet contents, keep the original sheet unchanged, activate the diff sheet, and highlight the changed cells.

## Behavior 2: Multiline Chat Input Preserves Drafts And Submission Semantics

`ChatInput` creates its own form and supports multiline drafts. Send and plain Enter submit the complete text once, preserving internal newlines. Shift+Enter, modified Enter shortcuts, and Enter during IME composition do not submit. Disabling the component disables both typing and Send while preserving the draft; clearing the draft leaves the same form in place.

`ChatWindow` owns the separate Clear button. It resets the conversation without submitting or deleting an unsent draft, and it retains the input component. Submission captures the message before clearing the draft. Input and Send remain disabled while a request runs or edits await review, then re-enable when the workflow permits another message.

The input grows and shrinks with content up to the height limit supplied by the parent. Panel height changes supply half the panel height; width changes recalculate wrapping. These layout behaviors require browser verification because jsdom does not calculate text layout.

## Behavior 3: Review Footer Preserves Existing Edit And Restore Actions

While a regular or preprocessing diff awaits review, one Accept/Reject footer replaces the visible composer. The same input and form remain mounted, preserving their draft and model selection. Review buttons are constructed once outside the transcript and input form and reused across transcript updates, successive reviews, Clear, and Restore; their callbacks retain their existing meaning. Their container visibility controls availability; the buttons are not individually disabled. No transcript entry represents the buttons. Clear chat remains available.

The workflow state determines review availability: only `pending_edit` and `pending_edit_preprocessed` show review; `answered`, `awaiting_clarification`, and `errored` enable input after processing. The warning identifies the actual pending diff sheet as soon as the workflow enters either pending state. At action start, the footer disappears and the composer returns disabled, while the warning remains until the workflow leaves pending review. Successful decisions, errors, Clear, and Restore update the warning at their state transitions; its visibility is derived independently from action availability. Transcript updates cannot show the review footer or re-enable the input or Restore controls during processing, including acceptance analysis and preprocessing continuation. Send, Enter, and form submission cannot submit while input is disabled. An error with retained pending-edit data does not leave stale review controls or a success confirmation.

Accepted and rejected decisions show distinct confirmation strips only after the corresponding worksheet operations succeed. Acceptance preserves the existing analysis request and restore control at its saved transcript boundary. For preprocessing edits this is before the initiating request; when preprocessing proposes no edits, the subsequent main-query checkpoint already includes that request. Rejection leaves the source sheet unchanged and creates no restore control. Either preprocessing decision continues the original request, which can produce another review within the same workflow. Restore removes the same later conversation and pending diff as before.

## Behavior 4: Formula Inference Uses Structured Transcript Content

Each detection result produces one structured inference entry. Its summary, confidence, and region data render directly as an assistant bubble and sibling cards, without an additional Markdown copy. Low, medium, and high confidence fill one, two, and three bars respectively, accompanied by a readable label. Empty region lists render no cards. All provided ranges, relationships, structures, sources, and evidence remain visible and HTML-like text is escaped.

Ordinary assistant Markdown retains sanitization and is not interpreted as an inference result or a completed decision based on its wording. Human messages preserve literal text and newlines without a visible role label. Structured inference data and decision presentation annotations stay out of model conversation history and follow the existing transcript snapshot/restore behavior.

## Behavior 5: Model Selection Applies To Subsequent Main Requests

The native model select sits below the textarea alongside Send. OpenRouter authentication shows the five existing GPT and Claude choices; OpenAI authentication shows the three direct GPT choices. It remains operable while a request runs and is hidden with the composer while a diff awaits review. Clear chat and Restore retain the selection. Sign-out/sign-in preserves the selected model when the new provider offers it, otherwise selecting GPT-6.1 Sol. A new task pane has no selected model until a provider is signed in; its first sign-in selects GPT-6.1 Sol.

Main query, clarification response, scenario comparison, and post-acceptance analysis requests use the latest selected model, provider settings, and medium reasoning effort. An already dispatched request keeps its original configuration. Formula detection and inference use separate provider-specific configurations and remain independent of the main-model selector.

When a model asks for clarification, the continuation includes the function call and matching function output without replaying reasoning items from the prior response. A pending clarification is not guaranteed to continue after switching providers.

## Behavior 6: Signed-In Account Menu Preserves Sign-Out And Chat Retention

The signed-in task pane shows an accessible Menu trigger targeting a native `popover="auto"`, with a Help & documentation link and divider above the noninteractive provider/key-suffix caption and a single native Sign out button beneath it. The browser owns opening, toggling, outside-click dismissal, Escape, focus navigation, and the trigger's implicit expanded state. Sign out uses `autofocus`; it remains in the native Tab order. The popup is an account group rather than an ARIA menu requiring custom arrow-key navigation. Tab/focus changes and pane blur follow native browser behavior; no custom menu navigation handlers or open-state field are maintained.

Help & documentation is a standard link to `https://www.openworkbookai.org/` with `target="_blank"` and `rel="noopener"`. Its click handler closes the popover through `AccountMenu.updateState()` without cancelling the link's default navigation or invoking an Office browser API. The link uses the v3 help-circle and external-arrow icons and existing menu item styling.

Sign out calls `hidePopover()` before clearing the active provider's key from memory/storage, clearing the caption, resetting the active auth page, and showing Welcome. OpenRouter sign-out also retains its existing legacy-key cleanup. Only the active top-level view is attached; the signed-in view and popover are detached while signed out. Reentry preserves the same chat and draft, and updates the model selector for the authenticated provider. Opening and dismissing the overlay do not replace chat DOM or change its layout. Native popover interactions, expanded accessibility state, geometry, and visible focus indicators require browser verification at 300px and 500px widths because jsdom does not implement the Popover API.

## Behavior 7: Provider Navigation And OpenAI Key Configuration Preserve Credential Boundaries

AuthPagesComponent retains Welcome, the provider picker, and two provider setup pages, attaching only the active page's existing mount. Welcome's Get started action asks AuthPagesComponent to show the picker. The picker shows OpenRouter and OpenAI; both choices navigate locally. Choosing OpenRouter does not start authorization until its auth page's Sign in action is used. OpenRouter status updates retain the existing authorization presentation and request path.

OpenRouter's Back button returns to the retained picker and resets its authorization presentation. The button is disabled while authorization is in progress and reenabled on failure.

Taskpane construction throws an explicit error when both provider keys exist, preserving both saved credentials.

OpenAI entry starts masked. Show/Hide toggles the native input type without changing its value. Back discards the unsaved key and resets masking, and reentry reuses the same empty input. Save requires a nonempty key after trimming, persists it through OpenAIKeyStore without a network request, clears the entry, and shows the retained chat shell without availability notices or disabled controls. Reload restores the configured provider and masked last-four-character caption. OpenAI sign-out closes the popover and clears its store's memory and localStorage record without clearing OpenRouter credentials. The inference client reads the OpenAI store only for direct OpenAI requests and sends those requests to the OpenAI Responses endpoint with native model IDs.

OpenRouter's auth page retains its own key-entry child and switches between method selection and entry without changing AuthPagesComponent's active page. Returning to method selection clears an unsaved key. Like OpenAI, the Save key button stays enabled while the form blocks empty or whitespace-only submissions; the save handler trims the key. Saving a nonempty key stores it in the existing OpenRouter key store without a verification request, enters the retained chat view, and shows the key suffix in the account menu. Both pasted keys and keys from the existing sign-in window use the same OpenRouter completion path. Sign-out clears either key and returns to Welcome.

## Behavior 8: ChatSession Exposes Detached Display Snapshots

ChatSession runs conversation workflows without DOM access. Its asynchronous action methods expose AsyncIterable snapshots at action start, during streaming/progress, and after completion or handled failure. Snapshots contain the full transcript, workflow status, transient execution status, action availability, review details, restore-point summaries, provider, and model choices. They omit credentials, LLM history, and worksheet checkpoint contents. Later actions and consumer mutations cannot change previously emitted snapshots or session-owned state, respectively.

Taskpane retains provider status for UI navigation and account display. ChatSession owns a ProviderManager for both key stores, the signed-in provider, model selection and options, preprocessing model settings, and request endpoints. Taskpane calls ChatSession.signIn()/signOut(), reads the account caption through ChatSession.getProviderStatus(), and updates its UI provider status after the command succeeds. LLMManager and InferenceClient use the session's ProviderManager. Sign-out removes the active credential while preserving conversation state and model-selection continuity. Clear and Restore retain model selection. UI updates consume snapshots through ChatWindow.updateState(), retain ChatInput, and keep draft/focus/layout behavior on the UI side.
