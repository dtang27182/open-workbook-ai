/* global document, Office, window, URL, URLSearchParams */

type OpenRouterDialogMessage =
  | { type: "authorization_code"; code: string }
  | { type: "authorization_error"; message: string };

type OpenRouterDialogState =
  | { type: "start"; challenge: string }
  | { type: "authorized"; code: string }
  | { type: "rejected" }
  | { type: "invalid" };

const state = parseDialogState(new URLSearchParams(window.location.search));
const callbackUrl = `${window.location.origin}${window.location.pathname}`;

switch (state.type) {
  case "start": {
    const authorizationUrl = new URL("https://openrouter.ai/auth");
    authorizationUrl.searchParams.set("callback_url", callbackUrl);
    authorizationUrl.searchParams.set("code_challenge", state.challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    window.location.replace(authorizationUrl.toString());
    break;
  }
  case "authorized":
    cleanCallbackUrl();
    document.getElementById("openrouter-auth-status")!.textContent = "Finishing sign-in…";
    sendMessageToTaskPane({ type: "authorization_code", code: state.code });
    break;
  case "rejected":
    cleanCallbackUrl();
    showAuthorizationError("OpenRouter authorization was not completed.");
    break;
  case "invalid":
    showAuthorizationError("OpenRouter sign-in could not be started.");
    break;
}

function parseDialogState(parameters: URLSearchParams): OpenRouterDialogState {
  const code = parameters.get("code");
  const authorizationError = parameters.get("error");
  const challenge = parameters.get("code_challenge");
  let state: OpenRouterDialogState;
  if (code !== null) {
    state = { type: "authorized", code };
  } else if (authorizationError !== null) {
    state = { type: "rejected" };
  } else if (challenge !== null) {
    state = { type: "start", challenge };
  } else {
    state = { type: "invalid" };
  }
  return state;
}

function cleanCallbackUrl(): void {
  if (typeof window.history.replaceState === "function") {
    window.history.replaceState({}, document.title, callbackUrl);
  }
}

function showAuthorizationError(message: string): void {
  document.getElementById("openrouter-auth-status")!.hidden = true;
  const error = document.getElementById("openrouter-auth-error")!;
  error.hidden = false;
  error.textContent = message;
  sendMessageToTaskPane({ type: "authorization_error", message });
}

function sendMessageToTaskPane(message: OpenRouterDialogMessage): void {
  Office.onReady(() => {
    Office.context.ui.messageParent(JSON.stringify(message), {
      targetOrigin: window.location.origin,
    });
  });
}
