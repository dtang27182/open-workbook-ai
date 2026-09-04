/* global Office, window, URL, btoa, crypto, fetch, TextEncoder */

type OpenRouterDialogMessage =
  | { type: "authorization_code"; code: string }
  | { type: "authorization_error"; message: string };

type OpenRouterPkceValues = {
  verifier: string;
  challenge: string;
};

type OpenRouterAuthorizationExchangeResponse = {
  key: string;
};

let openRouterDialog: Office.Dialog | undefined;

export async function acquireOpenRouterApiKey(): Promise<string> {
  try {
    const { verifier, challenge } = await createPkceValues();
    const code = await requestAuthorizationCode(challenge);
    return await exchangeAuthorizationCode(code, verifier);
  } finally {
    closeAuthorizationDialog();
  }
}

async function requestAuthorizationCode(challenge: string): Promise<string> {
  // Office opens the same-origin callback page in a separate dialog and returns its handle.
  openRouterDialog = await openAuthorizationDialog(createAuthorizationDialogUrl(challenge));

  // We then wait for the office dialog to return with the authorization code
  return waitForAuthorizationCode(openRouterDialog);
}

function createAuthorizationDialogUrl(challenge: string): string {
  const dialogUrl = new URL("/src/auth-dialog/openrouter-auth-dialog.html", window.location.href);
  dialogUrl.searchParams.set("code_challenge", challenge);
  return dialogUrl.toString();
}

function openAuthorizationDialog(dialogUrl: string): Promise<Office.Dialog> {
  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      dialogUrl,
      { height: 60, width: 40, displayInIframe: false },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value);
        } else if (result.status === Office.AsyncResultStatus.Failed) {
          reject(new Error("Could not open the OpenRouter sign-in window. Try again."));
        }
      }
    );
  });
}

function waitForAuthorizationCode(dialog: Office.Dialog): Promise<string> {
  return new Promise((resolve, reject) => {
    // Office raises this event when openrouter-auth-dialog.html calls
    // Office.context.ui.messageParent with a JSON string. The message crosses from the
    // dialog window back to this task pane.
    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
      const message = JSON.parse((args as { message: string }).message) as OpenRouterDialogMessage;
      if (message.type === "authorization_code") {
        resolve(message.code);
      } else if (message.type === "authorization_error") {
        reject(new Error(message.message));
      }
    });

    // Office raises this separate event when the dialog closes or unloads. Rejecting has no
    // effect if an authorization message has already settled the Promise.
    dialog.addEventHandler(Office.EventType.DialogEventReceived, (args) => {
      if ("error" in args) {
        openRouterDialog = undefined;
        reject(new Error("Sign-in was cancelled. Try again when you're ready."));
      }
    });
  });
}

function closeAuthorizationDialog(): void {
  if (openRouterDialog !== undefined) {
    const dialog = openRouterDialog;
    openRouterDialog = undefined;
    dialog.close();
  }
}

async function createPkceValues(): Promise<OpenRouterPkceValues> {
  const verifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encodeBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
  );
  return { verifier, challenge };
}

async function exchangeAuthorizationCode(code: string, verifier: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  });

  if (response.ok) {
    const result = (await response.json()) as OpenRouterAuthorizationExchangeResponse;
    return result.key;
  } else if (response.status === 400 || response.status === 403) {
    throw new Error("OpenRouter authorization expired or was rejected. Try again.");
  } else {
    throw new Error("Could not complete OpenRouter sign-in. Try again.");
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index < bytes.length; index++) {
    value += String.fromCharCode(bytes[index]);
  }
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
