import { ProviderManager } from "../src/taskpane/pages/chat/chat-window/provider-manager";
import { ChatSession } from "../src/taskpane/pages/chat/chat-window/chat-session";
import type { ChatSessionSnapshot } from "../src/taskpane/pages/chat/chat-window/chat-session-snapshot";
import assert from "node:assert/strict";
import { ChatInput } from "../src/taskpane/pages/chat/chat-window/chat-input/chat-input";
import test, { type TestContext } from "node:test";
import { AccountMenu } from "../src/taskpane/account-menu/account-menu";
import { TaskpaneComponent } from "../src/taskpane/taskpane-component";
import { OpenRouterAuthPage } from "../src/taskpane/pages/auth/openrouter-auth/openrouter-auth-page";
import { OpenAIKeyStore } from "../src/taskpane/pages/auth/add-openai-key/openai-key-store";
import { AuthPagesComponent } from "../src/taskpane/pages/auth/auth-pages-component";

import {
  type LlmConversationHistory,
  type SpreadsheetPromptEvent,
  LLMManager,
} from "../src/taskpane/pages/chat/chat-window/llm/llm-manager";
import {
  type OpenRouterRequestBody,
  InferenceClient,
} from "../src/taskpane/pages/chat/chat-window/llm/inference-client";
import {
  type SheetSnapshot,
  ExcelManager,
} from "../src/taskpane/pages/chat/chat-window/excel-manager";
import type { ChatState } from "../src/taskpane/pages/chat/chat-window/chat-session-state";
import {
  type ChatWindowDomHandlers,
  configChatControls,
  createInitialDom,
  renderChatTranscript,
  updateReviewWarning,
} from "../src/taskpane/pages/chat/chat-window/dom/chat-window-dom";
import type { ChatTranscriptEntry } from "../src/taskpane/pages/chat/chat-window/transcript";
import type {
  FormulaInferencePlan,
  PreprocessPromptEvent,
} from "../src/taskpane/pages/chat/chat-window/llm/preprocess-formula-inference";
import { OpenrouterKeyStore } from "../src/taskpane/pages/auth/openrouter-auth/openrouter-api-key";
import { RestoreManager } from "../src/taskpane/pages/chat/chat-window/restore-manager";
import { runPreprocessWorkflow } from "../src/taskpane/pages/chat/chat-window/workflows/preprocess";
import {
  formatSheetAsMarkdown,
  formatSheetDataAsMarkdown,
} from "../src/taskpane/pages/chat/chat-window/llm/sheet-markdown";
import { createExcelTestWorkbook } from "./excel-test-double";
import {
  createChatWindowForTest,
  getChatStateForTest,
  submitChatMessageForTest,
} from "./chat-window-test-helpers";

const openrouterKeyStore = new OpenrouterKeyStore();

const chatInputModelSelection: Pick<ChatSessionSnapshot, "modelOptions" | "selectedModelId"> = {
  modelOptions: [{ label: "GPT-6.1 Sol", modelId: "openai/gpt-6.1-sol:exacto" }],
  selectedModelId: "openai/gpt-6.1-sol:exacto",
};

const sheetFormulas = [
  ["PRODUCT", "UNITS"],
  ["Aldoxin", 1200],
];

const sheetValues = [
  ["PRODUCT", "UNITS"],
  ["Aldoxin", 1200],
];

function openProviderPicker(mount: HTMLElement): void {
  mount.querySelector<HTMLButtonElement>("#get-started")!.click();
}

test("Account Menu Closes Help Locally And Delegates Sign Out", () => {
  const mount = document.createElement("div");
  let signOutCalls = 0;
  new AccountMenu(mount, () => signOutCalls++, { provider: "openrouter", keySuffix: "test" });
  const menu = mount.querySelector<HTMLElement>("[popover]")!;
  let closeCalls = 0;
  menu.hidePopover = () => closeCalls++;
  const helpLink = mount.querySelector<HTMLAnchorElement>("#open-workbook-help")!;
  const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });

  helpLink.querySelector("svg")!.dispatchEvent(click);

  assert.equal(closeCalls, 1);
  assert.equal(click.defaultPrevented, false);
  assert.equal(helpLink.href, "https://www.openworkbookai.org/");
  assert.equal(helpLink.target, "_blank");
  assert.equal(helpLink.rel, "noopener");
  assert.equal(signOutCalls, 0);

  mount.querySelector<HTMLButtonElement>("#account-sign-out")!.click();
  assert.equal(signOutCalls, 1);
});

test("Menu Sign Out Closes Popover Before Clearing Keys And Retains Chat On Sign In", async (context) => {
  const { taskpane, mount, trigger, menu, signOut } = createTaskpaneMenuForTest(context);
  const effects: string[] = [];
  menu.hidePopover = () => effects.push("hide popover");
  const chat = mount.querySelector("#chat-page")!;
  const input = mount.querySelector<HTMLTextAreaElement>("#chat-input")!;
  const select = mount.querySelector<HTMLSelectElement>("#chat-model")!;
  input.value = "Retained draft";
  select.value = "openai/gpt-6.1-sol:exacto";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.localStorage.setItem("open-workbook-ai-openrouter-api-key", "legacy-key");
  const clear = OpenrouterKeyStore.prototype.clear;
  context.mock.method(OpenrouterKeyStore.prototype, "clear", function (this: OpenrouterKeyStore) {
    assert.equal(effects.at(-1), "hide popover");
    effects.push("clear key");
    assert.equal(mount.querySelector("#chat-page"), chat);
    clear.call(this);
    assert.equal(this.hasKey(), false);
  });
  const updateAuth = OpenRouterAuthPage.prototype.updateState;
  context.mock.method(OpenRouterAuthPage.prototype, "updateState", function (event) {
    if (event.type === "reset" && new OpenrouterKeyStore().hasKey() === false) {
      effects.push("reset auth");
      assert.equal(window.localStorage.getItem("open-workbook-ai-openrouter-oauth-key"), null);
      assert.equal(window.localStorage.getItem("open-workbook-ai-openrouter-api-key"), null);
      assert.equal(chat.querySelector("#chat-input"), input);
    }
    updateAuth.call(this, event);
  });
  mockOpenRouterSignInForTest(context, "new-key");

  signOut.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await Promise.resolve();
  assert.equal(mount.querySelector("#chat-page"), null);
  assert.equal(mount.querySelector('[aria-label="Menu"]'), null);
  assert.notEqual(mount.querySelector("#auth-pages-mount"), null);
  assert.notEqual(mount.querySelector("#welcome-page"), null);
  assert.equal(mount.querySelector("#openrouter-sign-in"), null);
  assert.deepEqual(effects, ["hide popover", "clear key"]);

  openProviderPicker(mount);
  mount.querySelector<HTMLButtonElement>("#choose-openrouter")!.click();
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-sign-in")!.disabled, false);
  await taskpane.updateState({ type: "sign_in_3p_auth" });
  assert.equal(mount.querySelector("#chat-page"), chat);
  assert.equal(mount.querySelector('[aria-label="Menu"]'), trigger);
  assert.equal(menu.getAttribute("popover"), "auto");
  assert.equal(input.value, "Retained draft");
  assert.equal(select.value, "openai/gpt-6.1-sol:exacto");
  assert.notEqual(mount.querySelector(".signed-in-view"), null);
  assert.equal(mount.querySelector("#auth-pages-mount"), null);
  assert.equal(
    mount.querySelector(".account-menu-caption")!.textContent,
    "Signed in to OpenRouter · key …-key"
  );
  assert.equal(window.localStorage.getItem("open-workbook-ai-openrouter-oauth-key"), "new-key");
});

test("Welcome Opens A Two-Provider Picker And Reset Returns To Welcome", () => {
  const mount = document.createElement("div");
  const authPages = new AuthPagesComponent(mount, () => {}, async () => {}, () => {});
  const welcome = mount.querySelector("#welcome-page")!;
  assert.match(welcome.textContent!, /Your AI assistant for Excel/);
  assert.equal(mount.querySelector("#choose-provider-page"), null);

  openProviderPicker(mount);
  assert.equal(mount.querySelector("#welcome-page"), null);
  assert.equal(mount.querySelector("#choose-provider-mount")!.parentElement, mount);
  assert.match(mount.querySelector("#choose-provider-page")!.textContent!, /Choose an AI provider/);
  assert.equal(mount.querySelectorAll("#choose-provider-page .provider-card").length, 2);
  assert.notEqual(mount.querySelector("#choose-openrouter"), null);
  assert.notEqual(mount.querySelector("#choose-openai"), null);
  assert.equal(mount.textContent!.includes("Anthropic"), false);
  assert.match(mount.querySelector("#choose-provider-page .auth-details")!.textContent!, /active worksheet’s used range/);
  assert.equal(mount.textContent!.includes("Prerelease"), false);

  authPages.updateState({ type: "reset" });
  assert.equal(mount.querySelector("#welcome-page"), welcome);
  assert.equal(mount.querySelector("#choose-provider-page"), null);
});

test("Provider Choice Shows OpenRouter Auth Before Sign In Shows Account Options", async (context) => {
  new OpenrouterKeyStore().clear();
  const mount = document.createElement("main");
  document.body.appendChild(mount);
  const taskpane = new TaskpaneComponent(mount);
  context.after(() => {
    mount.remove();
    window.localStorage.removeItem("open-workbook-ai-openrouter-oauth-key");
  });
  const fetchMock = mockOpenRouterSignInForTest(context, "signed-in-key");
  assert.equal(mount.querySelector(".signed-in-view"), null);
  assert.notEqual(mount.querySelector("#welcome-page"), null);
  assert.equal(mount.querySelector("#openrouter-auth-mount"), null);
  assert.equal(mount.querySelector("#openrouter-auth-page"), null);
  openProviderPicker(mount);
  assert.notEqual(mount.querySelector("#choose-provider-mount"), null);
  mount.querySelector<HTMLButtonElement>("#choose-openrouter")!.click();
  assert.equal(mount.querySelector("#choose-provider-mount"), null);
  assert.notEqual(mount.querySelector("#openrouter-auth-mount"), null);
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-sign-in")!.disabled, false);
  assert.equal(fetchMock.mock.callCount(), 0);
  const updateState = context.mock.method(taskpane, "updateState");
  mount.querySelector<HTMLButtonElement>("#openrouter-sign-in")!.click();
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-sign-in")!.disabled, true);
  await updateState.mock.calls[0].result;
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.notEqual(mount.querySelector(".signed-in-view"), null);
  assert.notEqual(mount.querySelector("#chat-page"), null);
  assert.equal(mount.querySelector<HTMLElement>("[popover]")!.getAttribute("popover"), "auto");
});

test("OpenRouter Back Returns To The Same Picker And Resets Auth Presentation", () => {
  const mount = document.createElement("div");
  let signInCalls = 0;
  const authPages = new AuthPagesComponent(
    mount,
    () => {},
    async () => {
      signInCalls++;
    },
    () => {}
  );
  openProviderPicker(mount);
  const picker = mount.querySelector("#choose-provider-mount")!;
  mount.querySelector<HTMLButtonElement>("#choose-openrouter")!.click();
  const authMount = mount.querySelector("#openrouter-auth-mount")!;
  authPages.updateState({ type: "openrouter_status", event: { type: "sign_in_3p_auth" } });
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-all-providers")!.disabled, true);
  mount.querySelector<HTMLButtonElement>("#openrouter-all-providers")!.click();
  assert.equal(mount.contains(authMount), true);

  authPages.updateState({
    type: "openrouter_status",
    event: { type: "sign_in_failed", message: "Authorization failed." },
  });
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-all-providers")!.disabled, false);
  mount.querySelector<HTMLButtonElement>("#openrouter-all-providers")!.click();
  assert.equal(mount.querySelector("#choose-provider-mount"), picker);
  assert.equal(mount.contains(authMount), false);
  assert.equal(signInCalls, 0);

  mount.querySelector<HTMLButtonElement>("#choose-openrouter")!.click();
  assert.equal(mount.querySelector("#openrouter-auth-mount"), authMount);
  assert.equal(mount.querySelector<HTMLElement>("#openrouter-auth-error")!.hidden, true);
  assert.equal(mount.querySelector<HTMLElement>("#openrouter-auth-status")!.hidden, true);
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-sign-in")!.disabled, false);
  assert.equal(mount.querySelector<HTMLButtonElement>("#openrouter-all-providers")!.disabled, false);
});

test("OpenRouter Key Entry Stays Within Its Provider Page And Back Clears The Draft", () => {
  const mount = document.createElement("div");
  const authPages = new AuthPagesComponent(
    mount,
    () => {},
    async () => {},
    () => {}
  );
  openProviderPicker(mount);
  mount.querySelector<HTMLButtonElement>("#choose-openrouter")!.click();
  const routerMount = mount.querySelector("#openrouter-auth-mount")!;
  mount.querySelector<HTMLButtonElement>("#openrouter-use-key")!.click();
  const input = mount.querySelector<HTMLInputElement>("#openrouter-api-key")!;
  assert.equal(mount.querySelector("#openrouter-auth-mount"), routerMount);
  assert.equal(mount.querySelector("#openrouter-sign-in"), null);
  assert.equal(
    mount.querySelector<HTMLButtonElement>("#openrouter-key-form button[type=submit]")!.disabled,
    false
  );
  assert.equal(input.checkValidity(), false);
  input.value = "   ";
  assert.equal(input.checkValidity(), false);
  input.value = "unsaved-key";
  assert.equal(input.checkValidity(), true);
  mount.querySelector<HTMLButtonElement>("#openrouter-all-providers")!.click();
  assert.equal(mount.querySelector("#openrouter-auth-mount"), routerMount);
  assert.notEqual(mount.querySelector("#openrouter-sign-in"), null);
  assert.equal(input.value, "");
  authPages.updateState({ type: "reset" });
  assert.notEqual(mount.querySelector("#welcome-page"), null);
});

test("Saving An OpenRouter Key Uses The Existing Store Without Verification", (context) => {
  new OpenrouterKeyStore().clear();
  new OpenAIKeyStore().clear();
  const mount = document.createElement("main");
  document.body.appendChild(mount);
  new TaskpaneComponent(mount);
  context.after(() => {
    new OpenrouterKeyStore().clear();
    mount.remove();
  });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("Saving a key must not call OpenRouter.");
  });
  openProviderPicker(mount);
  mount.querySelector<HTMLButtonElement>("#choose-openrouter")!.click();
  mount.querySelector<HTMLButtonElement>("#openrouter-use-key")!.click();
  const input = mount.querySelector<HTMLInputElement>("#openrouter-api-key")!;
  input.value = "  pasted-key-4321  ";
  mount.querySelector<HTMLFormElement>("#openrouter-key-form")!.requestSubmit();
  assert.equal(
    window.localStorage.getItem("open-workbook-ai-openrouter-oauth-key"),
    "pasted-key-4321"
  );
  assert.equal(
    mount.querySelector(".account-menu-caption")!.textContent,
    "Signed in to OpenRouter · key …4321"
  );
  assert.notEqual(mount.querySelector("#chat-page"), null);
  assert.equal(input.value, "");
  assert.equal(fetchMock.mock.callCount(), 0);
  mount.querySelector<HTMLElement>("[popover]")!.hidePopover = () => {};
  mount.querySelector<HTMLButtonElement>("#account-sign-out")!.click();
  assert.equal(window.localStorage.getItem("open-workbook-ai-openrouter-oauth-key"), null);
  assert.notEqual(mount.querySelector("#welcome-page"), null);
});

test("Taskpane Rejects Startup When Both Provider Keys Exist", (context) => {
  const openAiStore = new OpenAIKeyStore();
  const openRouterStore = new OpenrouterKeyStore();
  openAiStore.set("openai-key");
  openRouterStore.set("openrouter-key");
  context.after(() => {
    openAiStore.clear();
    openRouterStore.clear();
  });

  assert.throws(
    () => new TaskpaneComponent(document.createElement("main")),
    /Both OpenAI and OpenRouter API keys are configured/
  );
  assert.equal(new OpenAIKeyStore().get(), "openai-key");
  assert.equal(new OpenrouterKeyStore().get(), "openrouter-key");
});

test("OpenAI Entry Toggles Visibility And Back Discards The Unsaved Key", (context) => {
  new OpenrouterKeyStore().clear();
  new OpenAIKeyStore().clear();
  const mount = document.createElement("main");
  new TaskpaneComponent(mount);
  context.after(() => mount.remove());
  openProviderPicker(mount);
  const pickerMount = mount.querySelector<HTMLElement>("#choose-provider-mount")!;
  assert.equal(mount.querySelector("#add-openai-key-mount"), null);
  mount.querySelector<HTMLButtonElement>("#choose-openai")!.click();
  const input = mount.querySelector<HTMLInputElement>("#openai-api-key")!;
  const toggle = mount.querySelector<HTMLButtonElement>("#openai-key-visibility")!;
  const entryMount = mount.querySelector<HTMLElement>("#add-openai-key-mount")!;
  assert.equal(mount.contains(entryMount), true);
  assert.equal(mount.contains(pickerMount), false);
  assert.equal(mount.querySelector("#openrouter-auth-mount"), null);
  assert.equal(input.type, "password");
  input.value = "unsaved-key";
  toggle.click();
  assert.equal(input.type, "text");
  assert.equal(input.value, "unsaved-key");
  assert.equal(toggle.textContent, "Hide");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  toggle.click();
  assert.equal(input.type, "password");
  assert.equal(input.value, "unsaved-key");
  toggle.click();
  mount.querySelector<HTMLButtonElement>("#openai-all-providers")!.click();

  assert.equal(mount.querySelector("#choose-provider-mount"), pickerMount);
  assert.equal(mount.contains(entryMount), false);
  assert.equal(input.value, "");
  assert.equal(input.type, "password");
  assert.equal(toggle.textContent, "Show");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(new OpenAIKeyStore().hasKey(), false);
  mount.querySelector<HTMLButtonElement>("#choose-openai")!.click();
  assert.equal(mount.querySelector("#openai-api-key"), input);
  assert.equal(mount.querySelector("#add-openai-key-mount"), entryMount);
  assert.equal(input.value, "");
});

test("OpenAI Save Requires A Nonempty Trimmed Key Without Calling A Provider", (context) => {
  new OpenrouterKeyStore().clear();
  new OpenAIKeyStore().clear();
  const mount = document.createElement("main");
  new TaskpaneComponent(mount);
  context.after(() => {
    new OpenAIKeyStore().clear();
    mount.remove();
  });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => {
    throw new Error("Saving an OpenAI key must not make a request.");
  });
  const authMount = mount.querySelector<HTMLElement>("#auth-pages-mount")!;
  openProviderPicker(mount);
  mount.querySelector<HTMLButtonElement>("#choose-openai")!.click();
  const form = mount.querySelector<HTMLFormElement>("#openai-key-form")!;
  const input = mount.querySelector<HTMLInputElement>("#openai-api-key")!;
  const toggle = mount.querySelector<HTMLButtonElement>("#openai-key-visibility")!;

  for (const emptyKey of ["", "   "]) {
    input.value = emptyKey;
    assert.equal(input.checkValidity(), false);
    form.requestSubmit();
    assert.equal(new OpenAIKeyStore().hasKey(), false);
    assert.equal(mount.contains(authMount), true);
  }

  input.value = "  arbitrary-key-7f3a  ";
  toggle.click();
  form.requestSubmit();
  assert.equal(
    window.localStorage.getItem("open-workbook-ai-openai-api-key"),
    "arbitrary-key-7f3a"
  );
  assert.equal(window.localStorage.getItem("open-workbook-ai-openrouter-oauth-key"), null);
  assert.equal(mount.contains(authMount), false);
  assert.notEqual(mount.querySelector(".signed-in-view"), null);
  assert.equal(input.value, "");
  assert.equal(input.type, "password");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(
    mount.querySelector(".account-menu-caption")!.textContent,
    "Signed in to OpenAI · key …7f3a"
  );
  assert.equal(mount.innerHTML.includes("arbitrary-key-7f3a"), false);
  assert.equal(mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled, false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("OpenAI Reload Restores Masked Identity And Sign Out Clears Memory And Storage", (context) => {
  new OpenrouterKeyStore().clear();
  new OpenAIKeyStore().set("saved-openai-key-1234");
  const mount = document.createElement("main");
  document.body.appendChild(mount);
  new TaskpaneComponent(mount);
  context.after(() => {
    window.localStorage.removeItem("open-workbook-ai-openai-api-key");
    window.localStorage.removeItem("open-workbook-ai-openrouter-api-key");
    mount.remove();
  });
  const signedIn = mount.querySelector<HTMLElement>(".signed-in-view")!;
  assert.equal(mount.querySelector("#auth-pages-mount"), null);
  assert.notEqual(signedIn, null);
  assert.equal(
    mount.querySelector(".account-menu-caption")!.textContent,
    "Signed in to OpenAI · key …1234"
  );
  assert.equal(mount.querySelector("#openai-api-key"), null);
  assert.equal(mount.innerHTML.includes("saved-openai-key-1234"), false);
  window.localStorage.setItem("open-workbook-ai-openrouter-api-key", "unrelated-legacy-record");
  const effects: string[] = [];
  mount.querySelector<HTMLElement>("[popover]")!.hidePopover = () => effects.push("close menu");
  const clear = OpenAIKeyStore.prototype.clear;
  context.mock.method(OpenAIKeyStore.prototype, "clear", function (this: OpenAIKeyStore) {
    assert.deepEqual(effects, ["close menu"]);
    clear.call(this);
    assert.equal(this.hasKey(), false);
    effects.push("clear key");
  });

  mount.querySelector<HTMLButtonElement>("#account-sign-out")!.click();
  assert.deepEqual(effects, ["close menu", "clear key"]);
  assert.equal(window.localStorage.getItem("open-workbook-ai-openai-api-key"), null);
  assert.equal(
    window.localStorage.getItem("open-workbook-ai-openrouter-api-key"),
    "unrelated-legacy-record"
  );
  assert.equal(mount.contains(signedIn), false);
  assert.notEqual(mount.querySelector("#auth-pages-mount"), null);
  assert.notEqual(mount.querySelector("#welcome-page"), null);
  assert.equal(signedIn.querySelector(".account-menu-caption")!.textContent, "");
});

test("OpenAI Key Store Restores And Clears Its Own Key Independently Of OpenRouter", (context) => {
  const openAiStore = new OpenAIKeyStore();
  const openRouterStore = new OpenrouterKeyStore();
  context.after(() => {
    openAiStore.clear();
    openRouterStore.clear();
  });
  openRouterStore.set("openrouter-key");
  openAiStore.set("openai-key");
  assert.equal(new OpenAIKeyStore().get(), "openai-key");
  assert.equal(openRouterStore.get(), "openrouter-key");
  openAiStore.clear();
  assert.equal(openAiStore.hasKey(), false);
  assert.equal(new OpenAIKeyStore().hasKey(), false);
  assert.throws(() => openAiStore.get());
  assert.equal(new OpenrouterKeyStore().get(), "openrouter-key");
});

test("Provider Sign-In Switches The Retained Model Selector And Preserves Matching Choices", async (context) => {
  const openrouterStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  openrouterStore.clear();
  openAiStore.set("openai-key");
  const mount = document.createElement("main");
  document.body.appendChild(mount);
  context.after(() => {
    openrouterStore.clear();
    openAiStore.clear();
    mount.remove();
  });
  const taskpane = new TaskpaneComponent(mount);
  mount.querySelector<HTMLElement>("[popover]")!.hidePopover = () => {};
  const chat = mount.querySelector("#chat-page")!;
  const select = mount.querySelector<HTMLSelectElement>("#chat-model")!;
  assert.deepEqual(Array.from(select.options, (option) => option.value), [
    "gpt-6.1-sol",
    "gpt-6-sol",
    "gpt-5.6-sol",
  ]);

  select.value = "gpt-6-sol";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  await taskpane.updateState({ type: "sign_out" });
  await taskpane.updateState({ type: "save_openrouter_key", apiKey: "openrouter-key" });
  assert.equal(mount.querySelector("#chat-page"), chat);
  assert.equal(mount.querySelector("#chat-model"), select);
  assert.equal(select.value, "openai/gpt-6-sol:exacto");
  assert.equal(select.options.length, 5);

  select.value = "anthropic/claude-opus-4.8:nitro";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  await taskpane.updateState({ type: "sign_out" });
  await taskpane.updateState({ type: "sign_in_openai", apiKey: "new-openai-key" });
  assert.equal(mount.querySelector("#chat-page"), chat);
  assert.equal(select.value, "gpt-6.1-sol");
  assert.equal(select.options.length, 3);
});

test("Chat Input Submits Multiline Text Through Send And Plain Enter", (context) => {
  const messages: string[] = [];
  const chatInput = new ChatInput(
    document.createElement("div"),
    chatInputModelSelection,
    (message) => messages.push(message),
    () => {}
  );
  document.body.appendChild(chatInput.getMount());
  context.after(() => chatInput.getMount().remove());
  const input = chatInput.getMount().querySelector<HTMLTextAreaElement>("textarea")!;
  const send = chatInput.getMount().querySelector<HTMLButtonElement>("#chat-send")!;
  input.value = "First line\nSecond line";

  send.click();
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
  assert.deepEqual(messages, [input.value, input.value]);

  for (const modifiers of [
    { shiftKey: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { isComposing: true },
  ]) {
    const event = new window.KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
      ...modifiers,
    });
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(messages.length, 2);
  assert.equal(input.value, "First line\nSecond line");
});

test("Chat Input Disabling Preserves The Draft And Clearing Reuses The Form", (context) => {
  const messages: string[] = [];
  const chatInput = new ChatInput(
    document.createElement("div"),
    chatInputModelSelection,
    (message) => messages.push(message),
    () => {}
  );
  document.body.appendChild(chatInput.getMount());
  context.after(() => chatInput.getMount().remove());
  const form = chatInput.getMount().querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const send = form.querySelector<HTMLButtonElement>("#chat-send")!;
  input.value = "Keep this\ndraft";

  chatInput.updateState({ type: "set_disabled", disabled: true });
  assert.equal(input.disabled, true);
  assert.equal(send.disabled, true);
  send.click();
  form.requestSubmit();
  assert.deepEqual(messages, []);
  assert.equal(input.value, "Keep this\ndraft");

  chatInput.updateState({ type: "set_disabled", disabled: false });
  assert.equal(input.disabled, false);
  assert.equal(send.disabled, false);
  send.click();
  assert.deepEqual(messages, ["Keep this\ndraft"]);

  chatInput.updateState({ type: "clear" });
  assert.equal(input.value, "");
  assert.equal(chatInput.getMount().querySelector("form"), form);
});

test("ChatSession Streams Detached Snapshots Without A DOM", async (context) => {
  const originalDocument = globalThis.document;
  globalThis.document = undefined;
  context.after(() => {
    globalThis.document = originalDocument;
    openrouterKeyStore.clear();
  });
  const workbook = createWorkbook();
  const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
  providerManager.signIn("openrouter", "unit-test-key");
  const session = new ChatSession(providerManager, workbook.excelApi);
  context.mock.method(
    LLMManager.prototype,
    "runMainQueryPrompt",
    async function* (): AsyncGenerator<SpreadsheetPromptEvent> {
      yield { type: "partial_response", text: "First part" };
      yield { type: "partial_response", text: "Complete answer" };
      yield {
        type: "complete",
        reply: {
          message: "Complete answer",
          shouldEditSheet: false,
          createNewSheet: false,
          cellEdits: [],
          comparisonRanges: [],
        },
        updatedLlmConversationMessages: [],
      };
    }
  );
  const initial = session.getSessionSnapshot();
  const updates = await collectSessionUpdates(session.submitMessage("Analyze this sheet."));
  const partial = updates.find((snapshot) =>
    snapshot.transcript.some((entry) => entry.kind === "message" && entry.text === "First part")
  )!;
  assert.ok(partial);
  assert.equal(partial.actionRunning, true);
  assert.equal(partial.canSubmit, false);
  assert.equal(partial.canRestore, false);
  assert.equal(initial.transcript.length, 1);
  assert.equal(updates.at(-1)!.actionRunning, false);
  assert.equal(updates.at(-1)!.canSubmit, true);
  assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
  const savedPartial = structuredClone(partial);
  session.resetChat();
  assert.deepEqual(partial, savedPartial);
  assert.equal(session.getSessionSnapshot().transcript.length, 1);
  // Mutating a consumer's copy cannot change session-owned state.
  const consumerCopy = session.getSessionSnapshot();
  (consumerCopy.transcript as ChatTranscriptEntry[]).length = 0;
  assert.equal(session.getSessionSnapshot().transcript.length, 1);
});

test("ChatSession Review And Restore Snapshots Follow Workbook Decisions", async () => {
  for (const decision of ["accept", "reject"] as const) {
    const workbook = createWorkbook();
    const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
    providerManager.signIn("openrouter", "unit-test-key");
    const session = new ChatSession(providerManager, workbook.excelApi);
    const mocks = installMocks((request) => {
      if ((request.text as { format: { type: string } }).format.type === "text") {
        return createOutputTextResponse("Updated analysis.");
      } else {
        return getOpenRouterResponseBody(request);
      }
    });
    try {
      await collectSessionUpdates(session.submitMessage("Lowercase the headers."));
      const pending = session.getSessionSnapshot();
      assert.equal(pending.canReview, true);
      assert.equal(pending.reviewSheetName, pending.pendingEdit!.diffSheetName);
      assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
      const updates = await collectSessionUpdates(
        decision === "accept" ? session.acceptPendingDiff() : session.rejectPendingDiff()
      );
      assert.equal(updates[0].canReview, false);
      assert.equal(updates[0].reviewSheetName, pending.reviewSheetName);
      assert.equal(workbook.hasSheet(pending.pendingEdit!.diffSheetName), false);
      assert.equal(session.getSessionSnapshot().reviewSheetName, undefined);
      if (decision === "accept") {
        const analyzing = updates.find((snapshot) =>
          snapshot.transcript.some(
            (entry) => entry.kind === "working" && entry.text === "Analyzing accepted changes..."
          )
        )!;
        assert.ok(analyzing);
        assert.equal(analyzing.canRestore, false);
        assert.equal(analyzing.reviewSheetName, undefined);
        assert.equal(analyzing.restorePoints.length, 1);
        assert.deepEqual(workbook.getSheet("Sheet1").formulas[0], ["product", "units"]);
        const point = session.getSessionSnapshot().restorePoints[0];
        assert.equal(point.sheetName, "Sheet1");
        await collectSessionUpdates(session.submitMessage("Another edit."));
        const laterDiff = session.getSessionSnapshot().pendingEdit!.diffSheetName;
        await collectSessionUpdates(session.restoreToPoint(point.id));
        assert.equal(workbook.hasSheet(laterDiff), false);
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(session.getSessionSnapshot().restorePoints.length, 0);
        assert.equal(session.getSessionSnapshot().transcript.length, 1);
      } else if (decision === "reject") {
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(session.getSessionSnapshot().restorePoints.length, 0);
      }
    } finally {
      mocks.restore();
    }
  }
});

test("ChatSession Continues Clarifications And Creates Scenarios", async (context) => {
  context.after(() => openrouterKeyStore.clear());
  const workbook = createWorkbook();
  const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
  providerManager.signIn("openrouter", "unit-test-key");
  const session = new ChatSession(providerManager, workbook.excelApi);
  context.mock.method(
    LLMManager.prototype,
    "runMainQueryPrompt",
    async function* (_message, workflowId): AsyncGenerator<SpreadsheetPromptEvent> {
      yield {
        type: "clarification_requested",
        question: "Which units?",
        updatedLlmConversationMessages: [
          { role: "user", text: "Create a scenario.", workflowId },
          {
            type: "function_call",
            id: "question",
            callId: "question-call",
            name: "ask_clarifying_question",
            arguments: JSON.stringify({ question: "Which units?" }),
            workflowId,
          },
        ],
      };
    }
  );
  context.mock.method(
    LLMManager.prototype,
    "runClarificationResponsePrompt",
    async function* (answer): AsyncGenerator<SpreadsheetPromptEvent> {
      assert.equal(answer, "Double the units.");
      yield { type: "creating_scenario_sheet" };
      yield {
        type: "complete",
        reply: {
          message: "Created a doubled-units scenario.",
          shouldEditSheet: true,
          createNewSheet: true,
          cellEdits: [{ address: "B2", newFormula: 2400 }],
          comparisonRanges: [],
        },
        updatedLlmConversationMessages: [],
      };
    }
  );
  context.mock.method(LLMManager.prototype, "runScenarioComparisonPrompt", async () => ({
    cellEdits: [{ address: "A4", newFormula: "Comparison" }],
    analysis: "Units doubled.",
  }));
  await collectSessionUpdates(session.submitMessage("Create a scenario."));
  assert.equal(session.getSessionSnapshot().workflowState, "awaiting_clarification");
  assert.equal(session.getSessionSnapshot().canSubmit, true);
  const updates = await collectSessionUpdates(session.submitMessage("Double the units."));
  assert.ok(
    updates.some((snapshot) =>
      snapshot.transcript.some(
        (entry) => entry.kind === "working" && entry.text.includes("Creating comparison")
      )
    )
  );
  const final = session.getSessionSnapshot();
  assert.equal(final.workflowState, "answered");
  assert.equal(final.pendingEdit, undefined);
  assert.equal(final.restorePoints.length, 0);
  assert.ok(
    final.transcript.some((entry) => entry.kind === "message" && entry.text === "Units doubled.")
  );
  assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
  const scenario = workbook.getSheet(workbook.getActiveSheetName());
  assert.equal(scenario.formulas[1][1], 2400);
  assert.equal(scenario.formulas[3][0], "Comparison");
});

test("ProviderManager Owns Sign-In, Model Selection, And Provider Request Settings", (context) => {
  const routerStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  routerStore.clear();
  openAiStore.clear();
  const manager = new ProviderManager(routerStore, openAiStore);
  context.after(() => {
    routerStore.clear();
    openAiStore.clear();
  });

  assert.equal(manager.getProvider(), undefined);
  assert.deepEqual(manager.getModelOptions(), []);
  assert.throws(() => manager.getModel(), /Sign in before selecting a model/);

  manager.signIn("openrouter", "router-key");
  assert.equal(manager.getProvider()?.keyStore, routerStore);
  assert.equal(manager.getProvider()?.endpoint, "https://openrouter.ai/api/v1/responses");
  assert.equal(manager.getModelOptions().length, 5);
  assert.equal(manager.getModel().config.model, "openai/gpt-6.1-sol:exacto");
  manager.setModel("openai/gpt-6-sol:exacto");

  manager.signIn("openai", "openai-key");
  assert.equal(routerStore.hasKey(), false);
  assert.equal(manager.getProvider()?.keyStore, openAiStore);
  assert.equal(manager.getProvider()?.endpoint, "https://api.openai.com/v1/responses");
  assert.equal(manager.getModelOptions().length, 3);
  assert.equal(manager.getModel().config.model, "gpt-6-sol");
  assert.equal(manager.getPreprocessModelConfigs().detection.model, "gpt-5.6-sol");

  manager.signOut();
  assert.equal(openAiStore.hasKey(), false);
  assert.equal(manager.getProvider(), undefined);
  assert.deepEqual(manager.getModelOptions(), []);
});

test("ChatSession Returns Recoverable Error State And Keeps Credentials Out Of Snapshots", async (context) => {
  const routerStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  const providerManager = new ProviderManager(routerStore, openAiStore);
  const session = new ChatSession(providerManager, createWorkbook().excelApi);
  context.after(() => {
    routerStore.clear();
    openAiStore.clear();
  });
  assert.equal(session.getProviderStatus(), undefined);
  session.signIn("openrouter", "session-router-secret");
  session.setModel("openai/gpt-6-sol:exacto");
  assert.equal(routerStore.get(), "session-router-secret");
  assert.deepEqual(session.getProviderStatus(), { provider: "openrouter", keySuffix: "cret" });
  context.mock.method(
    LLMManager.prototype,
    "runMainQueryPrompt",
    async function* (): AsyncGenerator<SpreadsheetPromptEvent> {
      yield { type: "partial_response", text: "Started answering" };
      throw new Error("Model unavailable");
    }
  );
  context.mock.method(console, "debug", () => {});
  const updates = await collectSessionUpdates(session.submitMessage("Analyze."));
  const failed = updates.at(-1)!;
  assert.equal(failed.workflowState, "errored");
  assert.equal(failed.actionRunning, false);
  assert.equal(failed.canSubmit, true);
  assert.equal(
    failed.transcript.some((entry) => entry.kind === "working"),
    false
  );
  assert.ok(
    failed.transcript.some(
      (entry) =>
        entry.kind === "message" && entry.text.includes("could not get an assistant response")
    )
  );
  session.signOut();
  assert.equal(session.getSessionSnapshot().provider, undefined);
  assert.equal(session.getProviderStatus(), undefined);
  assert.equal(routerStore.hasKey(), false);
  assert.deepEqual(session.getSessionSnapshot().transcript, failed.transcript);
  session.signIn("openai", "session-openai-secret");
  const signedIn = session.getSessionSnapshot();
  assert.equal(signedIn.provider, "openai");
  assert.equal(signedIn.selectedModelId, "gpt-6-sol");
  assert.equal(openAiStore.get(), "session-openai-secret");
  assert.deepEqual(session.getProviderStatus(), { provider: "openai", keySuffix: "cret" });
  assert.equal(JSON.stringify(signedIn).includes("session-openai-secret"), false);
  assert.equal(JSON.stringify(updates).includes("session-router-secret"), false);
  session.resetChat();
  assert.equal(session.getSessionSnapshot().selectedModelId, "gpt-6-sol");
  session.signOut();
  assert.equal(openAiStore.hasKey(), false);
});

async function collectSessionUpdates(
  updates: AsyncIterable<ChatSessionSnapshot>
): Promise<ChatSessionSnapshot[]> {
  const snapshots: ChatSessionSnapshot[] = [];
  for await (const snapshot of updates) {
    snapshots.push(snapshot);
  }
  return snapshots;
}

test("Native Model Select Retains Selection Through Review And Clear", async (context) => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const mount = chatWindow.getMount();
  document.body.appendChild(mount);
  context.after(() => mount.remove());
  const select = mount.querySelector<HTMLSelectElement>("#chat-model")!;

  assert.equal(select.value, "openai/gpt-6.1-sol:exacto");
  assert.equal(select.parentElement!.previousElementSibling!.id, "chat-input");
  assert.deepEqual(
    Array.from(select.options, (option) => option.value),
    [
      "openai/gpt-6.1-sol:exacto",
      "openai/gpt-6-sol:exacto",
      "openai/gpt-5.6-sol:exacto",
      "anthropic/claude-sonnet-5.5:nitro",
      "anthropic/claude-opus-4.8:nitro",
    ]
  );
  select.value = "anthropic/claude-opus-4.8:nitro";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(select.value, "anthropic/claude-opus-4.8:nitro");

  configChatControls(mount, { canSubmit: false, canReview: true }, chatWindow["chatInput"]);
  assert.equal(chatWindow["chatInput"].getMount().hidden, true);
  assert.equal(mount.querySelector<HTMLElement>(".chat-review-footer")!.hidden, false);
  assert.equal(select.value, "anthropic/claude-opus-4.8:nitro");
  await chatWindow.updateState({ type: "clear" });
  assert.equal(select.value, "anthropic/claude-opus-4.8:nitro");
  assert.equal(chatWindow["chatInput"].getMount().hidden, false);

  const newChatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  assert.equal(
    newChatWindow.getMount().querySelector<HTMLSelectElement>("#chat-model")!.value,
    "openai/gpt-6.1-sol:exacto"
  );
});

test("Selecting A Model In Chat Sends It With The Next Main Request", async () => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const mocks = installMocks((requestBody) => {
    const format = requestBody.text as { format: { name?: string } };
    if (format.format.name === "formula_inference_plan") {
      return createNoEditResponse();
    } else {
      return createOutputTextResponse({
        shouldEditSheet: false,
        createNewSheet: false,
        answer: "Answered.",
        editExplanation: null,
        cellEdits: [],
        comparisonRanges: [],
      });
    }
  });

  try {
    const mount = chatWindow.getMount();
    const select = mount.querySelector<HTMLSelectElement>("#chat-model")!;
    select.value = "openai/gpt-6-sol:exacto";
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
    await submitChatMessageForTest(chatWindow, "Summarize the sheet.");
    assert.deepEqual(
      mocks.requests.map(({ model }) => model),
      ["openai/gpt-6-sol:exacto"]
    );
  } finally {
    mocks.restore();
  }
});

test("Chat Input Caps And Shrinks Its Height Using Supplied Layout Measurements", () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const chatInput = new ChatInput(mount, chatInputModelSelection, () => {}, () => {});
  const input = mount.querySelector<HTMLTextAreaElement>("textarea")!;
  // jsdom supplies no layout; simulate measurements to check sizing decisions.
  input.style.setProperty("--chat-input-min-height", "34px");
  input.style.border = "1px solid black";
  input.value = "A multiline draft";
  let scrollHeight = 140;
  Object.defineProperty(input, "clientWidth", { value: 200 });
  Object.defineProperty(input, "scrollHeight", { get: () => scrollHeight });

  try {
    chatInput.updateState({ type: "panel_resized", maxHeight: 100 });
    assert.equal(input.style.height, "100px");
    assert.equal(input.style.overflowY, "auto");

    chatInput.updateState({ type: "panel_resized", maxHeight: 200 });
    assert.equal(input.style.height, "142px");
    assert.equal(input.style.overflowY, "hidden");

    scrollHeight = 50;
    input.dispatchEvent(new window.Event("input"));
    assert.equal(input.style.height, "52px");

    // Even when the placeholder wraps, an empty draft stays at one line.
    scrollHeight = 80;
    chatInput.updateState({ type: "clear" });
    assert.equal(input.style.height, "34px");

    chatInput.updateState({ type: "panel_resized", maxHeight: 20 });
    assert.equal(input.style.height, "20px");
    assert.equal(input.style.minHeight, "20px");
  } finally {
    mount.remove();
  }
});

test("Chat Window Retains Its Draft On Clear And Captures Multiline Submission Before Clearing", async () => {
  const workbook = createWorkbook();
  const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
  const form = chatWindow.getMount().querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
  const send = form.querySelector<HTMLButtonElement>("#chat-send")!;
  const clear = chatWindow.getMount().querySelector<HTMLButtonElement>("#chat-clear")!;
  const reviewButtons = Array.from(chatWindow.getMount().querySelectorAll(".chat-diff-action"));
  const draft = "Make all column headers lower case.\nKeep the remaining cells unchanged.";
  input.value = draft;
  clear.click();
  assert.equal(form.contains(clear), false);
  assert.equal(input.value, draft);
  assert.equal(chatWindow.getMount().querySelector("form"), form);

  const mocks = installMocks();
  try {
    const submission = submitChatMessageForTest(chatWindow, draft);
    assert.equal(input.value, "");
    assert.equal(input.disabled, true);
    assert.equal(send.disabled, true);
    await submission;
    assert.equal(input.disabled, true);
    assert.equal(send.disabled, true);
    assert.equal(clear.disabled, false);
    assert.ok(
      getChatStateForTest(chatWindow).transcript.some(
        (entry) => entry.kind === "message" && entry.source === "human" && entry.text === draft
      )
    );
    assert.ok(
      mocks.requests.some((request) =>
        request.input.some((item) =>
          JSON.stringify(item).includes("Keep the remaining cells unchanged.")
        )
      )
    );

    await chatWindow.updateState({ type: "clear" });
    reviewButtons.forEach((button, index) => {
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-diff-action")[index], button);
    });
    assert.equal(
      chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
      true
    );
    assert.equal(input.disabled, false);
    assert.equal(send.disabled, false);
    assert.equal(chatWindow.getMount().querySelector(".chat-scope")!.textContent, "Active worksheet");
    assert.equal(chatWindow.getMount().querySelector("form"), form);
  } finally {
    await waitForBackgroundWork();
    mocks.restore();
  }
});

test("Model Proposed Updates Are Reflected In The Generated Diff Sheet", async () => {
  const workbook = createWorkbook();
  const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
  const mocks = installMocks();

  try {
    const result = await submitChatMessageForTest(
      chatWindow,
      "Make all column headers lower case."
    );

    assert.equal(result.didCreateDiff, true);
    assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
    assert.deepEqual(workbook.getSheet("Diff 1").formulas, [
      ["product", "units"],
      ["Aldoxin", 1200],
    ]);
    assert.equal(workbook.getActiveSheetName(), "Diff 1");
    assert.equal(workbook.getCellFormat("Diff 1", "A1").fillColor, "#00B050");
    assert.equal(workbook.getCellFormat("Diff 1", "B1").fillColor, "#00B050");
  } finally {
    await waitForBackgroundWork();
    mocks.restore();
  }
});

test("Review Footer Replaces The Composer And Preserves Control Bindings And Drafts", (context) => {
  const mount = document.createElement("div");
  const actions: string[] = [];
  const handlers: ChatWindowDomHandlers = {
    onClear: () => actions.push("clear"),
    onSubmit: () => actions.push("submit"),
    onModelSelected: () => actions.push("model"),
    onAccept: () => actions.push("accept"),
    onReject: () => actions.push("reject"),
    onRestore: (id) => actions.push(`restore ${id}`),
  };
  const chatInput = new ChatInput(createInitialDom(mount, handlers).chatInputMount, chatInputModelSelection, handlers.onSubmit, handlers.onModelSelected);
  document.body.appendChild(mount);
  context.after(() => mount.remove());
  const form = mount.querySelector("form")!;
  const input = mount.querySelector("textarea")!;
  const chatInputMount = chatInput.getMount();
  const footer = mount.querySelector<HTMLElement>(".chat-review-footer")!;
  const buttons = Array.from(footer.querySelectorAll<HTMLButtonElement>("button"));
  assert.equal(footer.hidden, true);
  const entries: ChatTranscriptEntry[] = [
    { kind: "restore", restorePointId: 7, workflowId: 1 },
  ];
  input.value = "Keep this\nunsent draft";
  updateReviewWarning(mount, "Diff <2>");
  assert.equal(footer.hidden, true);
  configChatControls(mount, { canSubmit: false, canReview: true }, chatInput);
  renderChatTranscript(mount, entries, handlers);

  assert.equal(chatInputMount.hidden, true);
  assert.equal(footer.hidden, false);
  assert.equal(input.disabled, true);
  assert.equal(mount.querySelectorAll(".chat-diff-action").length, 2);
  assert.equal(mount.querySelector("#chat-messages .chat-diff-action"), null);
  assert.equal(form.contains(footer), false);
  assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, "Diff <2>");
  buttons[0].focus();
  renderChatTranscript(mount, [], handlers);
  assert.equal(document.activeElement, buttons[0]);
  assert.equal(footer.hidden, false);
  assert.equal(input.disabled, true);
  assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, "Diff <2>");
  renderChatTranscript(mount, entries, handlers);
  footer.querySelector<HTMLButtonElement>("button")!.click();
  footer.querySelectorAll<HTMLButtonElement>("button")[1].click();
  mount.querySelector<HTMLButtonElement>(".chat-message-restore")!.click();
  assert.deepEqual(actions, ["accept", "reject", "restore 7"]);

  configChatControls(mount, { canSubmit: false, canReview: false }, chatInput);
  entries.push({ kind: "working", source: "system", text: "Processing...", workflowId: 2 });
  renderChatTranscript(mount, entries, handlers, false);
  assert.equal(footer.hidden, true);
  assert.equal(chatInputMount.hidden, false);
  assert.equal(input.disabled, true);
  assert.equal(mount.querySelector<HTMLSelectElement>("#chat-model")!.disabled, false);
  assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, "Diff <2>");
  mount
    .querySelectorAll<HTMLButtonElement>(".chat-message-restore")
    .forEach((button) => {
      assert.equal(button.disabled, true);
      button.click();
    });
  mount.querySelector<HTMLButtonElement>("#chat-clear")!.click();
  assert.deepEqual(actions, ["accept", "reject", "restore 7", "clear"]);

  updateReviewWarning(mount, "Diff <3>");
  for (const state of [
    "pending_edit_preprocessed",
    "pending_edit",
    "awaiting_clarification",
    "errored",
    "answered",
  ] as const) {
    const pending = state === "pending_edit" || state === "pending_edit_preprocessed";
    configChatControls(mount, { canSubmit: !pending, canReview: pending }, chatInput);
    renderChatTranscript(mount, [], handlers);
    assert.equal(footer.hidden, !pending);
    assert.equal(chatInputMount.hidden, pending);
    assert.equal(input.disabled, pending);
    assert.equal(mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled, pending);
    assert.equal(
      mount.querySelector(".provider-link-details")!.classList.contains("review-pending"),
      true
    );
    buttons.forEach((button, index) => {
      assert.equal(footer.querySelectorAll("button")[index], button);
    });
    if (pending) {
      mount.querySelector<HTMLButtonElement>("#chat-send")!.click();
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      form.requestSubmit();
      assert.deepEqual(actions, ["accept", "reject", "restore 7", "clear"]);
      assert.equal(mount.querySelector(".chat-sheet-name")!.textContent, "Diff <3>");
    }
  }
  assert.equal(footer.hidden, true);
  assert.equal(footer.querySelectorAll("button").length, 2);
  assert.equal(chatInputMount.hidden, false);
  assert.equal(input.disabled, false);
  assert.equal(input.value, "Keep this\nunsent draft");
  assert.equal(mount.querySelector("form"), form);
  updateReviewWarning(mount, undefined);
  assert.equal(mount.querySelector(".chat-scope")!.textContent, "Active worksheet");
});

test("Inference Cards Render Structured Fields And Confidence Without Interpreting HTML", () => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const handlers: ChatWindowDomHandlers = {
    onClear() {},
    onSubmit() {},
    onModelSelected() {},
    onAccept() {},
    onReject() {},
    onRestore() {},
  };
  const plan: FormulaInferencePlan = {
    shouldInferFormulas: true,
    confidence: "high",
    summary: "Repeated <img src=x onerror=alert(1)> calculations",
    regions: [
      {
        targetRange: "B2:B3",
        structure: "Monthly <b>outputs</b>",
        relationship: "Multiply inputs <script>alert(1)</script>",
        sourceRanges: ["A2:A3", "C2:C3"],
        evidenceCells: ["B2", "B3"],
      },
    ],
  };
  for (const confidence of ["low", "medium", "high"] as const) {
    renderChatTranscript(
      chatWindow.getMount(),
      [{ kind: "formula_inference", workflowId: 1, plan: { ...plan, confidence } }],
      handlers
    );
    const message = chatWindow.getMount().querySelector(".chat-formula-inference")!;
    assert.equal(
      message.querySelectorAll(".chat-confidence-bar.filled").length,
      { low: 1, medium: 2, high: 3 }[confidence]
    );
    assert.equal(message.querySelector(".chat-confidence-value")!.textContent, confidence);
    assert.ok(message.textContent.includes(plan.summary));
    const card = message.querySelector(".chat-inference-card")!;
    for (const text of [
      plan.regions[0].targetRange,
      plan.regions[0].structure,
      plan.regions[0].relationship,
      ...plan.regions[0].sourceRanges,
      ...plan.regions[0].evidenceCells,
    ]) {
      assert.ok(card.textContent.includes(text));
    }
    assert.equal(card.closest(".chat-message-text"), null);
    assert.equal(message.querySelector("img, script, b"), null);
  }
  renderChatTranscript(
    chatWindow.getMount(),
    [
      {
        kind: "formula_inference",
        workflowId: 1,
        plan: { ...plan, shouldInferFormulas: false, regions: [] },
      },
      {
        kind: "message",
        source: "system",
        workflowId: 1,
        text: "Accepted changes. **Confidence:** high\n\n<script>alert(1)</script>",
      },
      { kind: "message", source: "human", workflowId: 1, text: "<b>My draft</b>\nSecond line" },
    ],
    handlers
  );
  assert.equal(chatWindow.getMount().querySelectorAll(".chat-inference-card").length, 0);
  assert.ok(chatWindow.getMount().textContent.includes("Not required"));
  assert.equal(chatWindow.getMount().querySelector(".chat-edit-decision, script"), null);
  assert.equal(chatWindow.getMount().querySelector(".human .chat-message-source"), null);
  assert.equal(
    chatWindow.getMount().querySelector(".human .chat-message-text")!.textContent,
    "<b>My draft</b>\nSecond line"
  );
});

test("Review Decisions Keep Worksheet Effects And The Existing Restore Boundary", async () => {
  for (const decision of ["accept", "reject"] as const) {
    const workbook = createWorkbook();
    const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
    const mocks = installMocks((request) => {
      if ((request.text as { format: { type: string } }).format.type === "text") {
        return createOutputTextResponse("Updated analysis.");
      } else {
        return getOpenRouterResponseBody(request);
      }
    });
    try {
      await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
      const footer = chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!;
      const buttons = Array.from(footer.querySelectorAll("button"));
      footer.querySelectorAll<HTMLButtonElement>("button")[decision === "accept" ? 0 : 1].click();
      assert.equal(
        chatWindow.getMount().querySelector<HTMLTextAreaElement>("textarea")!.disabled,
        true
      );
      await waitForBackgroundWork();
      assert.equal(footer.hidden, true);
      assert.equal(workbook.getActiveSheetName(), "Sheet1");
      assert.throws(() => workbook.getSheet("Diff 1"));
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-edit-decision").length, 1);
      assert.equal(
        chatWindow.getMount().querySelector(".chat-edit-decision .chat-sheet-name")!.textContent,
        "Sheet1"
      );
      const chatState = getChatStateForTest(chatWindow);
      assert.ok(
        chatState.llmConversationMessages.some(
          (message) =>
            "text" in message &&
            message.text === (decision === "accept" ? "Accepted changes." : "Rejected changes.")
        )
      );
      assert.ok(chatState.llmConversationMessages.every((message) => !("presentation" in message)));
      if (decision === "accept") {
        assert.deepEqual(workbook.getSheet("Sheet1").formulas[0], ["product", "units"]);
        assert.equal(mocks.requests.length, 2);
        const restoreIndex = chatState.transcript.findIndex((entry) => entry.kind === "restore");
        assert.equal(restoreIndex, 1);
        assert.ok(
          chatWindow
            .getMount()
            .querySelector(".chat-restore-divider")!
            .nextElementSibling!.classList.contains("human")
        );
        await submitChatMessageForTest(chatWindow, "Another edit.");
        assert.equal(footer.hidden, false);
        chatWindow.getMount().querySelector<HTMLButtonElement>(".chat-message-restore")!.click();
        await waitForBackgroundWork();
        assert.equal(footer.hidden, true);
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(chatWindow.getMount().querySelector(".chat-edit-decision"), null);
        assert.equal(getChatStateForTest(chatWindow).transcript.length, 1);
        assert.equal(chatWindow.getMount().querySelector(".chat-scope")!.textContent, "Active worksheet");
        buttons.forEach((button, index) => {
          assert.equal(footer.querySelectorAll("button")[index], button);
        });
      } else if (decision === "reject") {
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(mocks.requests.length, 1);
        assert.equal(chatWindow.getMount().querySelector(".chat-message-restore"), null);
      }
    } finally {
      await waitForBackgroundWork();
      mocks.restore();
    }
  }
});

test("Preprocessing Keeps One Structured Plan Through Decisions And Later Restore", async (context) => {
  const plan: FormulaInferencePlan = {
    shouldInferFormulas: true,
    confidence: "medium",
    summary: "Infer the repeated total.",
    regions: [
      {
        targetRange: "B2",
        structure: "Total",
        relationship: "Double the input",
        sourceRanges: ["B1"],
        evidenceCells: ["B2"],
      },
    ],
  };
  context.mock.method(
    LLMManager.prototype,
    "runPreprocessPrompt",
    async function* (): AsyncGenerator<PreprocessPromptEvent> {
      yield { type: "detection_complete", plan };
      yield { type: "region_complete", region: plan.regions[0], cellEditCount: 1 };
      yield { type: "complete", cellEdits: [{ address: "B2", newFormula: "=600*2" }] };
    }
  );
  for (const decision of ["accept_pending_diff", "reject_pending_diff"] as const) {
    const workbook = createWorkbook();
    const chatWindow = createChatWindowForTest(workbook.excelApi, openrouterKeyStore);
    const mocks = installMocks((request) => {
      assert.equal(chatWindow.getMount().querySelector(".chat-scope")!.textContent, "Active worksheet");
      assert.equal(chatWindow.getMount().querySelector("textarea")!.disabled, true);
      assert.equal(
        chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
        true
      );
      return getOpenRouterResponseBody(request);
    });
    try {
      for await (const _update of runPreprocessWorkflow(chatWindow["session"]["state"], "Lowercase the headers.", 1)) {
        await chatWindow.updateState({ type: "provider_changed" });
      }
      assert.equal(getChatStateForTest(chatWindow).workflowState, "pending_edit_preprocessed");
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-formula-inference").length, 1);
      assert.equal(mocks.requests.length, 0);
      const buttons = Array.from(chatWindow.getMount().querySelectorAll(".chat-diff-action"));
      const firstDiffName = getChatStateForTest(chatWindow).pendingEdit!.diffSheetName;
      assert.equal(
        chatWindow.getMount().querySelector(".chat-scope .chat-sheet-name")!.textContent,
        firstDiffName
      );
      const review = chatWindow.updateState({ type: decision });
      assert.equal(
        chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
        true
      );
      await review;
      const chatState = getChatStateForTest(chatWindow);
      assert.equal(chatState.workflowState, "pending_edit");
      assert.equal(mocks.requests.length, 1);
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-diff-action").length, 2);
      buttons.forEach((button, index) => {
        assert.equal(chatWindow.getMount().querySelectorAll(".chat-diff-action")[index], button);
      });
      assert.notEqual(chatState.pendingEdit!.diffSheetName, firstDiffName);
      assert.equal(
        chatWindow.getMount().querySelector(".chat-scope .chat-sheet-name")!.textContent,
        chatState.pendingEdit!.diffSheetName
      );
      assert.ok(chatState.transcript.every((entry) => entry.kind !== ("diff_review" as string)));
      const inference = chatState.transcript.filter((entry) => entry.kind === "formula_inference");
      assert.equal(inference.length, 1);
      assert.deepEqual(inference[0].plan, plan);
      const pendingWorkflowId = chatState.pendingEdit!.workflowId;
      assert.equal(inference[0].workflowId, pendingWorkflowId);
      await chatWindow.updateState({ type: "reject_pending_diff" });
      assert.equal(chatWindow.getMount().querySelectorAll(".chat-edit-decision").length, 2);
      assert.equal(
        chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
        true
      );
      if (decision === "accept_pending_diff") {
        assert.ok(
          chatWindow
            .getMount()
            .querySelector(".chat-restore-divider")!
            .nextElementSibling!.classList.contains("human")
        );
        chatWindow.getMount().querySelector<HTMLButtonElement>(".chat-message-restore")!.click();
        await waitForBackgroundWork();
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
        assert.equal(chatWindow.getMount().querySelector(".chat-formula-inference"), null);
      } else if (decision === "reject_pending_diff") {
        assert.equal(chatWindow.getMount().querySelector(".chat-message-restore"), null);
        assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);
      }
    } finally {
      await waitForBackgroundWork();
      mocks.restore();
    }
  }
});

test(
  "Accepted Review Keeps Controls Disabled Until Analysis Completes",
  { timeout: 5000 },
  async (context) => {
    const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
    const mocks = installMocks();
    let finishAnalysis!: () => void;
    const analysis = new Promise<string>((resolve) => {
      finishAnalysis = () => resolve("Updated analysis.");
    });
    let signalAnalysisStarted!: () => void;
    const analysisStarted = new Promise<void>((resolve) => {
      signalAnalysisStarted = resolve;
    });
    context.mock.method(LLMManager.prototype, "runUpdateAnalysisPrompt", () => {
      signalAnalysisStarted();
      return analysis;
    });
    let acceptance: Promise<void> | undefined;
    try {
      await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
      const mount = chatWindow.getMount();
      const footer = mount.querySelector<HTMLElement>(".chat-review-footer")!;
      const buttons = Array.from(footer.querySelectorAll<HTMLButtonElement>("button"));
      acceptance = chatWindow.updateState({ type: "accept_pending_diff" });
      assert.equal(footer.hidden, true);
      await analysisStarted;

      // Acceptance has appended a confirmation, a Restore divider, and working text.
      // Although the workflow state is answered, analysis still owns the action.
      assert.equal(getChatStateForTest(chatWindow).workflowState, "answered");
      assert.ok(mount.querySelector(".chat-edit-decision.accepted"));
      assert.equal(mount.querySelector(".chat-scope")!.textContent, "Active worksheet");
      assert.ok(mount.querySelector(".chat-working"));
      assert.equal(footer.hidden, true);
      assert.equal(mount.querySelector<HTMLElement>(".chat-input-mount")!.hidden, false);
      const input = mount.querySelector("textarea")!;
      input.value = "Keep this draft";
      assert.equal(input.disabled, true);
      const requestCount = mocks.requests.length;
      const transcript = structuredClone(getChatStateForTest(chatWindow).transcript);
      mount
        .querySelectorAll<HTMLButtonElement>(".chat-message-restore, #chat-send")
        .forEach((button) => {
          assert.equal(button.disabled, true);
          button.click();
        });
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      mount.querySelector("form")!.requestSubmit();
      assert.equal(mocks.requests.length, requestCount);
      assert.deepEqual(getChatStateForTest(chatWindow).transcript, transcript);
      assert.equal(input.value, "Keep this draft");

      finishAnalysis();
      await acceptance;
      assert.equal(input.disabled, false);
      assert.equal(mount.querySelector<HTMLButtonElement>("#chat-send")!.disabled, false);
      assert.equal(mount.querySelector<HTMLButtonElement>(".chat-message-restore")!.disabled, false);
      buttons.forEach((button, index) => {
        assert.equal(footer.querySelectorAll("button")[index], button);
      });
      assert.equal(footer.hidden, true);
    } finally {
      finishAnalysis();
      await acceptance;
      mocks.restore();
    }
  }
);

test("Review Warning Remains Until Worksheet Rejection Completes", async (context) => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const mocks = installMocks();
  let finishDeletion!: () => void;
  const deletion = new Promise<void>((resolve) => {
    finishDeletion = resolve;
  });
  const deleteDiffSheet = ExcelManager.prototype.deleteDiffSheet;
  context.mock.method(ExcelManager.prototype, "deleteDiffSheet", async function (
    this: ExcelManager,
    sourceSheetName: string,
    diffSheetName: string
  ) {
    await deletion;
    await deleteDiffSheet.call(this, sourceSheetName, diffSheetName);
  });
  let rejection: Promise<void> | undefined;
  try {
    await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
    const mount = chatWindow.getMount();
    const diffName = getChatStateForTest(chatWindow).pendingEdit!.diffSheetName;
    rejection = chatWindow.updateState({ type: "reject_pending_diff" });
    await waitForBackgroundWork();
    assert.equal(getChatStateForTest(chatWindow).workflowState, "pending_edit");
    assert.equal(mount.querySelector<HTMLElement>(".chat-review-footer")!.hidden, true);
    assert.equal(mount.querySelector(".chat-scope .chat-sheet-name")!.textContent, diffName);
    assert.equal(mount.querySelector(".provider-link-details")!.classList.contains("review-pending"), true);
    finishDeletion();
    await rejection;
    assert.equal(getChatStateForTest(chatWindow).workflowState, "answered");
    assert.equal(mount.querySelector(".chat-scope")!.textContent, "Active worksheet");
    assert.equal(mount.querySelector(".provider-link-details")!.classList.contains("review-pending"), false);
  } finally {
    finishDeletion();
    await rejection;
    mocks.restore();
  }
});

test("Failed Review Removes Footer Even When Pending Edit Data Remains", async (context) => {
  const chatWindow = createChatWindowForTest(createWorkbook().excelApi, openrouterKeyStore);
  const mocks = installMocks();
  context.mock.method(ExcelManager.prototype, "deleteDiffSheet", async () => {
    throw new Error("Worksheet unavailable");
  });
  try {
    await submitChatMessageForTest(chatWindow, "Lowercase the headers.");
    await chatWindow.updateState({ type: "reject_pending_diff" });
    assert.equal(getChatStateForTest(chatWindow).workflowState, "errored");
    assert.ok(getChatStateForTest(chatWindow).pendingEdit);
    assert.equal(
      chatWindow.getMount().querySelector<HTMLElement>(".chat-review-footer")!.hidden,
      true
    );
    assert.equal(chatWindow.getMount().querySelector<HTMLElement>(".chat-input-mount")!.hidden, false);
    assert.equal(
      chatWindow.getMount().querySelector(".chat-scope")!.textContent,
      "Active worksheet"
    );
    assert.equal(chatWindow.getMount().querySelector(".chat-edit-decision"), null);
    assert.equal(chatWindow.getMount().querySelector("textarea")!.disabled, false);
  } finally {
    await waitForBackgroundWork();
    mocks.restore();
  }
});

test("Restore Manager Copies Inputs When Creating Restore Point Snapshots", () => {
  const restoreManager = new RestoreManager();
  const chatState = createRestoreManagerChatState();
  const sheet = createRestoreManagerSheet("Sheet1");

  restoreManager.createPotentialRestorePoint(1, chatState, sheet);
  chatState.transcript.push({
    kind: "message",
    source: "system",
    text: "Later message",
    workflowId: 1,
  });
  chatState.llmConversationMessages = [
    ...chatState.llmConversationMessages,
    { role: "assistant", text: "Later response", workflowId: 1 },
  ];
  chatState.nextWorkflowId++;
  sheet.formulas[0][0] = "Changed";

  const promotedRestorePoint = restoreManager.promotePotentialRestorePoint(1);
  assert.equal(promotedRestorePoint.chatState.transcript.length, 1);
  assert.deepEqual(promotedRestorePoint.chatState.llmConversationMessages, [
    { role: "user", text: "Initial request", workflowId: 1 },
  ]);
  assert.equal(promotedRestorePoint.chatState.nextWorkflowId, 1);
  assert.deepEqual(promotedRestorePoint.sheet.formulas, [["Original"]]);

  const storedRestorePoint = restoreManager.getRestorePoint(promotedRestorePoint.id);
  assert.strictEqual(storedRestorePoint, promotedRestorePoint);
});

test("Excel Manager Creates Numbered Sheets And Resets Their Counters", async () => {
  const workbook = createWorkbook();
  const controller = new ExcelManager(workbook.excelApi);
  const originalSheet = await controller.readActiveSheet();

  assert.deepEqual(await controller.readSheet("Sheet1"), originalSheet);

  const firstDiff = await controller.createNextDiffSheet(originalSheet, [
    { address: "C3", newFormula: "=1" },
  ]);
  const secondDiff = await controller.createNextDiffSheet(originalSheet, []);
  const firstScenario = await controller.createNextScenarioSheet(originalSheet, []);
  const secondScenario = await controller.createNextScenarioSheet(originalSheet, []);

  assert.equal(firstDiff.sheetName, "Diff 1");
  assert.equal(secondDiff.sheetName, "Diff 2");
  assert.equal(firstScenario, "Scenario 1");
  assert.equal(secondScenario, "Scenario 2");
  assert.deepEqual(firstDiff.updatedSheet.formulas, [
    ["PRODUCT", "UNITS", null],
    ["Aldoxin", 1200, null],
    [null, null, "=1"],
  ]);
  assert.deepEqual(firstDiff.updatedSheet.values, [
    ["PRODUCT", "UNITS", null],
    ["Aldoxin", 1200, null],
    [null, null, null],
  ]);

  await controller.deleteDiffSheet("Sheet1", "Diff 1");
  await controller.deleteDiffSheet("Sheet1", "Diff 2");
  await controller.deleteDiffSheet("Sheet1", "Scenario 1");
  await controller.deleteDiffSheet("Sheet1", "Scenario 2");
  controller.resetSheetNumbers();

  assert.equal((await controller.createNextDiffSheet(originalSheet, [])).sheetName, "Diff 1");
  assert.equal(await controller.createNextScenarioSheet(originalSheet, []), "Scenario 1");
});

test("Excel Manager Writes, Applies, And Deletes Sheet Changes", async () => {
  const workbook = createWorkbook();
  const controller = new ExcelManager(workbook.excelApi);
  const originalSheet = await controller.readActiveSheet();

  await controller.applyCellEditsToSheet(originalSheet, [
    { address: "B2", newFormula: 2400 },
  ]);
  assert.equal(workbook.getSheet("Sheet1").formulas[1][1], 2400);
  assert.equal(workbook.getCellFormat("Sheet1", "B2").fillColor, "#00B050");

  await controller.writeSheetFormulas(originalSheet);
  assert.deepEqual(workbook.getSheet("Sheet1").formulas, sheetFormulas);

  const diff = await controller.createNextDiffSheet(originalSheet, []);
  await controller.deleteDiffSheet("Sheet1", diff.sheetName);
  assert.equal(workbook.hasSheet(diff.sheetName), false);
  assert.equal(workbook.getActiveSheetName(), "Sheet1");
});

test("Excel Manager Retargets Escaped Sheet References", () => {
  const controller = new ExcelManager();
  const retargetedSheet = controller.retargetFormulaSheetReferences(
    {
      ...createRestoreManagerSheet("O'Brien"),
      formulas: [["='O''Brien'!A1", "Label"]],
      values: [[1, "Label"]],
      columnCount: 2,
    },
    "D'Angelo"
  );

  assert.equal(retargetedSheet.name, "D'Angelo");
  assert.deepEqual(retargetedSheet.formulas, [["='D''Angelo'!A1", "Label"]]);
});

test("Restore Manager Finalizes And Clears Restore History Without Resetting IDs", () => {
  const restoreManager = new RestoreManager();
  const chatState = createRestoreManagerChatState();

  restoreManager.createPotentialRestorePoint(1, chatState, createRestoreManagerSheet("Sheet1"));
  const firstRestorePoint = restoreManager.promotePotentialRestorePoint(1);
  restoreManager.createPotentialRestorePoint(2, chatState, createRestoreManagerSheet("Sheet2"));
  const secondRestorePoint = restoreManager.promotePotentialRestorePoint(2);

  restoreManager.finalizeRestore(firstRestorePoint.id);
  assert.equal(restoreManager.getRestorePoint(firstRestorePoint.id), undefined);
  assert.equal(restoreManager.getRestorePoint(secondRestorePoint.id), undefined);

  restoreManager.createPotentialRestorePoint(3, chatState, createRestoreManagerSheet("Sheet3"));
  const thirdRestorePoint = restoreManager.promotePotentialRestorePoint(3);
  restoreManager.clearAllRestorePoints();
  assert.equal(restoreManager.getRestorePoint(thirdRestorePoint.id), undefined);

  restoreManager.createPotentialRestorePoint(4, chatState, createRestoreManagerSheet("Sheet4"));
  const fourthRestorePoint = restoreManager.promotePotentialRestorePoint(4);
  assert.equal(fourthRestorePoint.id, thirdRestorePoint.id + 1);
});

test("Sheet Markdown Preserves Values Formulas And Escaping", () => {
  const sheet: SheetSnapshot = {
    name: "Sheet1",
    formulas: [["Label|Name", "=A2*2"], ["Line\nBreak", 2]],
    values: [["Label|Name", 4], ["{Value}", 2]],
    rowIndex: 2,
    columnIndex: 1,
    rowCount: 2,
    columnCount: 2,
  };

  assert.equal(
    formatSheetDataAsMarkdown(sheet, sheet.values),
    [
      "| | B | C |",
      "| --- | --- | --- |",
      "| **3** | Label\\|Name | 4 |",
      "| **4** | \\u007BValue\\u007D | 2 |",
    ].join("\n")
  );
  assert.equal(
    formatSheetAsMarkdown(sheet),
    [
      "| | B | C |",
      "| --- | --- | --- |",
      "| **3** | Label\\|Name | =A2*2 [value: 4] |",
      "| **4** | \\u007BValue\\u007D | 2 |",
    ].join("\n")
  );
});

test("LLM Manager Preserves Main Query Streaming And Replacement History", async () => {
  const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
  providerManager.signIn("openrouter", "unit-test-key");
  const manager = new LLMManager(providerManager);
  const mocks = installMocks(() =>
    createOutputTextResponse({
      shouldEditSheet: true,
      createNewSheet: false,
      answer: null,
      editExplanation: "Updated the requested cells.",
      cellEdits: [{ address: "B2", newFormula: 2400 }],
      comparisonRanges: [],
    })
  );
  const history: LlmConversationHistory = [
    {
      role: "user",
      text: "Earlier request",
      workflowId: 1,
      sheetContext: {
        range: { rowIndex: 0, columnIndex: 0, rowCount: 1, columnCount: 1 },
        sheetMarkdown: "Earlier context",
      },
    },
  ];

  try {
    const events = [];
    for await (const event of manager.runMainQueryPrompt(
      "Update the units.",
      2,
      createRestoreManagerSheet("Sheet1"),
      history
    )) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      ["partial_response", "creating_proposed_change", "complete"]
    );
    const completion = events.at(-1)!;
    assert.equal(completion.type, "complete");
    if (completion.type === "complete") {
      assert.deepEqual(completion.updatedLlmConversationMessages[0], {
        role: "user",
        text: "Earlier request",
        workflowId: 1,
      });
      assert.equal(completion.updatedLlmConversationMessages.length, 3);
      assert.deepEqual(completion.updatedLlmConversationMessages.at(-1), {
        role: "assistant",
        text: "Updated the requested cells.",
        workflowId: 2,
      });
    }
  } finally {
    mocks.restore();
  }
});

test("LLM Manager Continues A Pending Clarification", async () => {
  const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
  providerManager.signIn("openrouter", "unit-test-key");
  const manager = new LLMManager(providerManager);
  const history: LlmConversationHistory = [
    { role: "user", text: "Update the forecast.", workflowId: 3 },
    {
      type: "function_call",
      id: "tool-1",
      callId: "call-1",
      name: "ask_clarifying_question",
      arguments: JSON.stringify({ question: "Which period?" }),
      workflowId: 3,
    },
  ];
  const mocks = installMocks(() =>
    createOutputTextResponse({
      shouldEditSheet: false,
      createNewSheet: false,
      answer: "The clarification was applied.",
      editExplanation: null,
      cellEdits: [],
      comparisonRanges: [],
    })
  );

  try {
    assert.strictEqual(manager.getPendingClarificationToolCall(history), history[1]);
    const events = [];
    for await (const event of manager.runClarificationResponsePrompt("FY2028", 3, history)) {
      events.push(event);
    }

    const functionCallOutput = mocks.requests[0].input.find(
      (item) => "type" in item && item.type === "function_call_output"
    );
    assert.deepEqual(functionCallOutput, {
      type: "function_call_output",
      call_id: "call-1",
      output: "FY2028",
    });
    const completion = events.at(-1)!;
    assert.equal(completion.type, "complete");
    if (completion.type === "complete") {
      assert.deepEqual(completion.updatedLlmConversationMessages.at(-2), {
        type: "function_call_output",
        callId: "call-1",
        output: "FY2028",
        workflowId: 3,
      });
      assert.deepEqual(completion.updatedLlmConversationMessages.at(-1), {
        role: "assistant",
        text: "The clarification was applied.",
        workflowId: 3,
      });
    }
  } finally {
    mocks.restore();
  }
});

test("LLM Manager Preserves Preprocess Scenario And Update Analysis Operations", async () => {
  const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
  providerManager.signIn("openrouter", "unit-test-key");
  const manager = new LLMManager(providerManager);
  const mocks = installMocks((requestBody) => {
    const format = requestBody.text as { format: { type: string; name?: string } };
    if (format.format.name === "formula_inference_plan") {
      return createNoEditResponse();
    } else if (format.format.name === "scenario_comparison_response") {
      return createOutputTextResponse({
        cellEdits: [{ address: "A4", newFormula: "Comparison" }],
        analysis: "Scenario analysis.",
      });
    } else {
      return createOutputTextResponse("Accepted update analysis.");
    }
  });
  const originalSheet = createRestoreManagerSheet("Baseline");
  const scenarioSheet = createRestoreManagerSheet("Scenario 1");

  try {
    const preprocessEvents = [];
    for await (const event of manager.runPreprocessPrompt(originalSheet)) {
      preprocessEvents.push(event);
    }
    assert.deepEqual(preprocessEvents, [{ type: "complete", cellEdits: [] }]);

    const comparison = await manager.runScenarioComparisonPrompt(
      "Compare the scenario.",
      originalSheet,
      scenarioSheet,
      [{ purpose: "Compare outputs", address: "A1:A1" }],
      []
    );
    assert.deepEqual(comparison, {
      cellEdits: [{ address: "A4", newFormula: "Comparison" }],
      analysis: "Scenario analysis.",
    });
    await assert.rejects(
      manager.runScenarioComparisonPrompt(
        "Compare the scenario.",
        originalSheet,
        scenarioSheet,
        [],
        []
      ),
      /at least one comparison range/
    );

    assert.equal(
      await manager.runUpdateAnalysisPrompt(
        "Update the forecast.",
        originalSheet,
        scenarioSheet,
        []
      ),
      "Accepted update analysis."
    );
  } finally {
    mocks.restore();
  }
});

test("Selected Model Configures Each Main Request Without Changing Preprocessing", async () => {
  const providerManager = new ProviderManager(openrouterKeyStore, new OpenAIKeyStore());
  providerManager.signIn("openrouter", "unit-test-key");
  const manager = new LLMManager(providerManager);
  const sheet = createRestoreManagerSheet("Sheet1");
  const mocks = installMocks((requestBody) => {
    const format = requestBody.text as { format: { name?: string } };
    if (format.format.name === "formula_inference_plan") {
      return createNoEditResponse();
    } else if (format.format.name === "scenario_comparison_response") {
      return createOutputTextResponse({ cellEdits: [], analysis: "Compared." });
    } else if (format.format.name === "spreadsheet_response") {
      return createOutputTextResponse({
        shouldEditSheet: false,
        createNewSheet: false,
        answer: "Answered.",
        editExplanation: null,
        cellEdits: [],
        comparisonRanges: [],
      });
    } else {
      return createOutputTextResponse("Analyzed.");
    }
  });

  try {
    providerManager.setModel("anthropic/claude-opus-4.8:nitro");
    for await (const _event of manager.runMainQueryPrompt("Explain.", 1, sheet, [])) {
      // Consume the streamed completion.
    }
    providerManager.setModel("anthropic/claude-sonnet-5.5:nitro");
    for await (const _event of manager.runClarificationResponsePrompt("FY2028", 1, [
      {
        type: "function_call",
        id: "tool-1",
        callId: "call-1",
        name: "ask_clarifying_question",
        arguments: JSON.stringify({ question: "Which period?" }),
        workflowId: 1,
      },
    ])) {
      // Consume the streamed completion.
    }
    providerManager.setModel("openai/gpt-6-sol:exacto");
    await manager.runScenarioComparisonPrompt(
      "Compare.",
      sheet,
      createRestoreManagerSheet("Scenario 1"),
      [{ purpose: "Output", address: "A1:A1" }],
      []
    );
    for await (const _event of manager.runPreprocessPrompt(sheet)) {
      // Consume preprocessing without a proposed edit.
    }
    providerManager.setModel("openai/gpt-6.1-sol:exacto");
    await manager.runUpdateAnalysisPrompt("Analyze.", sheet, sheet, []);

    assert.deepEqual(
      mocks.requests.map(({ model, provider, reasoning }) => ({ model, provider, reasoning })),
      [
        {
          model: "anthropic/claude-opus-4.8:nitro",
          provider: undefined,
          reasoning: { effort: "medium" },
        },
        {
          model: "anthropic/claude-sonnet-5.5:nitro",
          provider: undefined,
          reasoning: { effort: "medium" },
        },
        {
          model: "openai/gpt-6-sol:exacto",
          provider: { order: ["openai"], allow_fallbacks: false },
          reasoning: { effort: "medium" },
        },
        {
          model: "openai/gpt-5.6-sol:exacto",
          provider: { order: ["openai"], allow_fallbacks: false },
          reasoning: { effort: "medium" },
        },
        {
          model: "openai/gpt-6.1-sol:exacto",
          provider: { order: ["openai"], allow_fallbacks: false },
          reasoning: { effort: "medium" },
        },
      ]
    );
  } finally {
    mocks.restore();
  }
});

test("OpenRouter Clients Share Key Changes Only Through Their Supplied Stores", async (t) => {
  const firstStore = new OpenrouterKeyStore();
  const secondStore = new OpenrouterKeyStore();
  firstStore.set("first-key");
  secondStore.set("second-key");
  const firstClient = new InferenceClient(new ProviderManager(firstStore, new OpenAIKeyStore()));
  const sharedClient = new InferenceClient(new ProviderManager(firstStore, new OpenAIKeyStore()));
  const secondClient = new InferenceClient(new ProviderManager(secondStore, new OpenAIKeyStore()));
  const authorizations: string[] = [];
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    authorizations.push(new Headers(init.headers).get("Authorization")!);
    return createOpenRouterResponse(
      createOutputTextResponse("Response"),
      JSON.parse(init.body).stream === true
    );
  });
  const request = createClientRequest();

  await firstClient.request(request);
  await secondClient.request(request);
  firstStore.set("replacement-key");
  await sharedClient.request(request);
  await collectEvents(firstClient.requestStreamEvents(request));
  await secondClient.request(request);
  assert.deepEqual(authorizations, [
    "Bearer first-key",
    "Bearer second-key",
    "Bearer replacement-key",
    "Bearer replacement-key",
    "Bearer second-key",
  ]);

  firstStore.clear();
  await assert.rejects(firstClient.request(request), /Sign in before sending a request/);
  await assert.rejects(
    collectEvents(sharedClient.requestStreamEvents(request)),
    /Sign in before sending a request/
  );
  assert.equal(authorizations.length, 5);
  assert.equal(secondStore.get(), "second-key");
});

test("OpenRouter Request Errors Preserve Key Invalidation Behavior", async (t) => {
  const affectedStore = new OpenrouterKeyStore();
  const otherStore = new OpenrouterKeyStore();
  otherStore.set("other-key");
  const client = new InferenceClient(new ProviderManager(affectedStore, new OpenAIKeyStore()));
  let status = 401;
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ error: { message: "Provider error." } }), { status })
  );

  for (const streaming of [false, true]) {
    for (status of [401, 500]) {
      affectedStore.set("affected-key");
      await assert.rejects(
        streaming
          ? collectEvents(client.requestStreamEvents(createClientRequest()))
          : client.request(createClientRequest()),
        { message: status === 401 ? "OpenRouter rejected the API key." : "Provider error." }
      );
      assert.equal(affectedStore.hasKey(), status !== 401);
      assert.equal(otherStore.get(), "other-key");
    }
  }
});

test("OpenRouter Streaming Assembles Text And Clarification Across Chunks", async (t) => {
  const keyStore = new OpenrouterKeyStore();
  keyStore.set("stream-key");
  const client = new InferenceClient(new ProviderManager(keyStore, new OpenAIKeyStore()));
  const toolCall = {
    type: "function_call",
    id: "question-item",
    call_id: "question-call",
    name: "ask_clarifying_question",
    arguments: "",
  };
  const argumentsText = JSON.stringify({ question: "Which period?" });
  const streamEvents = [
    { type: "response.output_item.added", item: toolCall },
    { type: "response.function_call_arguments.done", arguments: argumentsText },
    { type: "response.output_text.delta", delta: "Hello " },
    { type: "response.output_text.delta", delta: "world" },
    { type: "response.completed" },
  ];
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    assert.equal(JSON.parse(init.body).stream, true);
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer stream-key");
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const event of streamEvents) {
            const bytes = new TextEncoder().encode("data: " + JSON.stringify(event) + "\n\n");
            controller.enqueue(bytes.slice(0, 9));
            controller.enqueue(bytes.slice(9));
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  });

  assert.deepEqual(await collectEvents(client.requestStreamEvents(createClientRequest())), [
    { type: "output_text", outputText: "Hello " },
    { type: "output_text", outputText: "Hello world" },
    {
      type: "complete",
      response: {
        output: [
          { content: [{ type: "output_text", text: "Hello world" }] },
          { ...toolCall, arguments: argumentsText },
        ],
      },
    },
  ]);
});

test("Inference Client Routes Each Request To The Authenticated Provider", async (context) => {
  const openrouterStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  openrouterStore.clear();
  openAiStore.set("openai-key");
  context.after(() => {
    openrouterStore.clear();
    openAiStore.clear();
  });
  const calls: Array<{ url: string; authorization: string; body: OpenRouterRequestBody }> = [];
  context.mock.method(globalThis, "fetch", async (input, init) => {
    const body = JSON.parse(init.body) as OpenRouterRequestBody;
    calls.push({
      url: String(input),
      authorization: new Headers(init.headers).get("Authorization")!,
      body,
    });
    return createOpenRouterResponse(createOutputTextResponse("Response"), body.stream === true);
  });
  const client = new InferenceClient(new ProviderManager(openrouterStore, openAiStore));

  await client.request({ ...createClientRequest(), model: "gpt-6-sol" });
  await collectEvents(client.requestStreamEvents({ ...createClientRequest(), model: "gpt-6-sol" }));
  openAiStore.clear();
  openrouterStore.set("openrouter-key");
  await client.request({
    ...createClientRequest(),
    model: "openai/gpt-6-sol:exacto",
    provider: { order: ["openai"], allow_fallbacks: false },
  });

  assert.deepEqual(
    calls.map(({ url, authorization, body }) => ({
      url,
      authorization,
      model: body.model,
      provider: body.provider,
      stream: body.stream,
    })),
    [
      {
        url: "https://api.openai.com/v1/responses",
        authorization: "Bearer openai-key",
        model: "gpt-6-sol",
        provider: undefined,
        stream: undefined,
      },
      {
        url: "https://api.openai.com/v1/responses",
        authorization: "Bearer openai-key",
        model: "gpt-6-sol",
        provider: undefined,
        stream: true,
      },
      {
        url: "https://openrouter.ai/api/v1/responses",
        authorization: "Bearer openrouter-key",
        model: "openai/gpt-6-sol:exacto",
        provider: { order: ["openai"], allow_fallbacks: false },
        stream: undefined,
      },
    ]
  );
});

test("OpenAI Rejection Clears Its Key And Incomplete Streams Do Not Complete", async (context) => {
  const openrouterStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  openrouterStore.clear();
  openAiStore.set("rejected-openai-key");
  context.after(() => openAiStore.clear());
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify({ error: { message: "Rejected." } }), { status: 401 })
  );
  const client = new InferenceClient(new ProviderManager(openrouterStore, openAiStore));
  for (const streaming of [false, true]) {
    openAiStore.set("rejected-openai-key");
    await assert.rejects(
      streaming
        ? collectEvents(client.requestStreamEvents(createClientRequest()))
        : client.request(createClientRequest()),
      /OpenAI rejected the API key/
    );
    assert.equal(openAiStore.hasKey(), false);
  }

  openAiStore.set("stream-key");
  fetchMock.mock.mockImplementation(async () =>
    new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n', {
      headers: { "Content-Type": "text/event-stream" },
    })
  );
  await assert.rejects(
    collectEvents(client.requestStreamEvents(createClientRequest())),
    /ended before completion/
  );
  fetchMock.mock.mockImplementation(async () =>
    new Response(
      JSON.stringify({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })
    )
  );
  await assert.rejects(client.request(createClientRequest()), /max_output_tokens/);
  fetchMock.mock.mockImplementation(async () =>
    new Response(
      'data: {"type":"response.failed","response":{"error":{"message":"Model failed."}}}\n\n',
      { headers: { "Content-Type": "text/event-stream" } }
    )
  );
  await assert.rejects(
    collectEvents(client.requestStreamEvents(createClientRequest())),
    /Model failed/
  );
});

test("OpenAI Preprocessing Uses Native Detection And Region Models On Retry", async (context) => {
  const openrouterStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  openrouterStore.clear();
  openAiStore.set("preprocess-key");
  context.after(() => openAiStore.clear());
  const requests: OpenRouterRequestBody[] = [];
  context.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer preprocess-key");
    const request = JSON.parse(init.body) as OpenRouterRequestBody;
    requests.push(request);
    const format = request.text as { format: { name: string } };
    if (format.format.name === "formula_inference_plan") {
      return new Response(
        JSON.stringify(
          createOutputTextResponse({
            shouldInferFormulas: true,
            confidence: "high",
            summary: "One region.",
            regions: [
              {
                targetRange: "A1",
                structure: "single cell",
                sourceRanges: [],
                relationship: "Test",
                evidenceCells: ["A1"],
              },
            ],
          })
        )
      );
    } else if (requests.length === 2) {
      return new Response(JSON.stringify({ error: { message: "Retry." } }), { status: 500 });
    } else {
      return new Response(
        JSON.stringify(
          createOutputTextResponse({ functionSource: "function generateFormulaEdits() { return []; }" })
        )
      );
    }
  });
  const providerManager = new ProviderManager(openrouterStore, openAiStore);
  const manager = new LLMManager(providerManager);
  const events = [];
  for await (const event of manager.runPreprocessPrompt(createRestoreManagerSheet("Sheet1"))) {
    events.push(event.type);
  }
  assert.deepEqual(events, ["detection_complete", "region_complete", "complete"]);
  assert.deepEqual(requests.map(({ model }) => model), [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-terra",
  ]);
  assert.equal(requests.every((request) => request.provider === undefined), true);
});

test("OpenAI Clarification Continues Without Replaying Reasoning Items", async (context) => {
  const openrouterStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  openrouterStore.clear();
  openAiStore.set("clarification-key");
  context.after(() => openAiStore.clear());
  const requests: OpenRouterRequestBody[] = [];
  const reasoningItem = { type: "reasoning", id: "reasoning-1", summary: [] };
  const functionCall = {
    type: "function_call",
    id: "question-1",
    call_id: "call-1",
    name: "ask_clarifying_question",
    arguments: JSON.stringify({ question: "Which period?" }),
  };
  context.mock.method(globalThis, "fetch", async (_input, init) => {
    requests.push(JSON.parse(init.body) as OpenRouterRequestBody);
    const output =
      requests.length === 1
        ? [reasoningItem, functionCall]
        : createOutputTextResponse({
            shouldEditSheet: false,
            createNewSheet: false,
            answer: "The clarification was applied.",
            editExplanation: null,
            cellEdits: [],
            comparisonRanges: [],
          }).output;
    return new Response(
      `data: ${JSON.stringify({ type: "response.completed", response: { output } })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  });
  const providerManager = new ProviderManager(openrouterStore, openAiStore);
  const manager = new LLMManager(providerManager);
  const mainEvents = [];
  for await (const event of manager.runMainQueryPrompt(
    "Update the forecast.",
    1,
    createRestoreManagerSheet("Sheet1"),
    []
  )) {
    mainEvents.push(event);
  }
  const clarification = mainEvents.at(-1)!;
  assert.equal(clarification.type, "clarification_requested");
  if (clarification.type === "clarification_requested") {
    for await (const _event of manager.runClarificationResponsePrompt(
      "FY2028",
      1,
      clarification.updatedLlmConversationMessages
    )) {
      // Consume the completed clarification.
    }
  }

  assert.deepEqual(requests[1].input.slice(-2), [
    functionCall,
    { type: "function_call_output", call_id: "call-1", output: "FY2028" },
  ]);
  assert.deepEqual(
    requests[1].input.map((item) => ("type" in item ? item.type : item.role)),
    ["user", "function_call", "function_call_output"]
  );
  assert.equal(requests.every((request) => request.model === "gpt-6.1-sol"), true);
});

test("OpenAI Comparison And Post-Edit Analysis Use The Selected Native Model", async (context) => {
  const openrouterStore = new OpenrouterKeyStore();
  const openAiStore = new OpenAIKeyStore();
  openrouterStore.clear();
  openAiStore.set("analysis-key");
  context.after(() => openAiStore.clear());
  const requests: OpenRouterRequestBody[] = [];
  context.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer analysis-key");
    const request = JSON.parse(init.body) as OpenRouterRequestBody;
    requests.push(request);
    const format = request.text as { format: { name?: string } };
    return new Response(
      JSON.stringify(
        createOutputTextResponse(
          format.format.name === "scenario_comparison_response"
            ? { cellEdits: [], analysis: "Compared." }
            : "Analyzed."
        )
      )
    );
  });
  const providerManager = new ProviderManager(openrouterStore, openAiStore);
  const manager = new LLMManager(providerManager);
  providerManager.setModel("gpt-6-sol");
  const sheet = createRestoreManagerSheet("Sheet1");

  await manager.runScenarioComparisonPrompt(
    "Compare.",
    sheet,
    sheet,
    [{ purpose: "Output", address: "A1:A1" }],
    []
  );
  await manager.runUpdateAnalysisPrompt("Analyze.", sheet, sheet, []);
  assert.deepEqual(requests.map(({ model, provider }) => ({ model, provider })), [
    { model: "gpt-6-sol", provider: undefined },
    { model: "gpt-6-sol", provider: undefined },
  ]);
});

function createClientRequest(): OpenRouterRequestBody {
  return {
    model: "test-model",
    instructions: "Test request",
    input: [{ role: "user", content: "Hello" }],
    max_output_tokens: 100,
  };
}

async function collectEvents<T>(events: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

function createRestoreManagerChatState(): ChatState {
  return {
    transcript: [
      {
        kind: "message",
        source: "system",
        text: "Initial message",
        workflowId: 0,
      },
    ],
    llmConversationMessages: [{ role: "user", text: "Initial request", workflowId: 1 }],
    workflowState: "answered",
    preprocessedSheetNames: [],
    nextWorkflowId: 1,
  };
}

function createRestoreManagerSheet(name: string): SheetSnapshot {
  return {
    name,
    values: [["Original"]],
    formulas: [["Original"]],
    rowIndex: 0,
    columnIndex: 0,
    rowCount: 1,
    columnCount: 1,
  };
}

function createWorkbook() {
  return createExcelTestWorkbook({
    activeSheetName: "Sheet1",
    sheets: {
      Sheet1: {
        formulas: sheetFormulas,
        values: sheetValues,
      },
    },
  });
}

function installMocks(
  getResponseBody: (requestBody: OpenRouterRequestBody) => object = getOpenRouterResponseBody
) {
  const previousFetch = globalThis.fetch;
  const previousLog = console.log;
  const previousDebug = console.debug;
  const requests: OpenRouterRequestBody[] = [];

  openrouterKeyStore.set("unit-test-key");
  globalThis.fetch = async (_input, init) => {
    let requestBody: OpenRouterRequestBody | undefined;
    if (init?.body && typeof init.body === "string") {
      requestBody = JSON.parse(init.body);
    }
    requests.push(requestBody!);
    return createOpenRouterResponse(
      getResponseBody(requestBody!),
      requestBody!.stream === true
    );
  };
  console.log = () => {};
  console.debug = () => {};

  return {
    requests,
    restore() {
      openrouterKeyStore.clear();
      globalThis.fetch = previousFetch;
      console.log = previousLog;
      console.debug = previousDebug;
    },
  };
}

function createOutputTextResponse(content: object | string) {
  return {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: typeof content === "string" ? content : JSON.stringify(content),
          },
        ],
      },
    ],
  };
}

function getOpenRouterResponseBody(requestBody: OpenRouterRequestBody) {
  if (isPreprocessRequest(requestBody)) {
    return createNoEditResponse();
  }

  return createSpreadsheetEditResponse();
}

function isPreprocessRequest(requestBody: OpenRouterRequestBody) {
  const input = JSON.parse(requestBody.input.at(-1)!.content);
  return input.userRequest === "Preprocess worksheet formulas.";
}

async function waitForBackgroundWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function mockOpenRouterSignInForTest(context: TestContext, key: string) {
  const originalOffice = globalThis.Office;
  globalThis.Office = {
    AsyncResultStatus: { Succeeded: "succeeded" },
    EventType: { DialogMessageReceived: "dialog-message", DialogEventReceived: "dialog-event" },
    context: {
      ui: {
        displayDialogAsync: (_url, _options, callback) => {
          callback({
            status: "succeeded",
            value: {
              addEventHandler: (eventType, handler) => {
                if (eventType === "dialog-message") {
                  handler({ message: JSON.stringify({ type: "authorization_code", code: "code" }) });
                }
              },
              close: () => {},
            },
          });
        },
      },
    },
  } as unknown as typeof Office;
  context.after(() => {
    globalThis.Office = originalOffice;
  });
  return context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ key })));
}

function createTaskpaneMenuForTest(context: TestContext) {
  new OpenrouterKeyStore().set("signed-in-key");
  const mount = document.createElement("main");
  document.body.appendChild(mount);
  const taskpane = new TaskpaneComponent(mount);
  context.after(async () => {
    await taskpane.updateState({ type: "sign_out" });
    mount.remove();
  });
  // jsdom does not implement native popover methods; only sign-out integration is mocked.
  mount.querySelector<HTMLElement>("[popover]")!.hidePopover = () => {};
  return {
    taskpane,
    mount,
    trigger: mount.querySelector<HTMLButtonElement>('[aria-label="Menu"]')!,
    menu: mount.querySelector<HTMLElement>("[popover]")!,
    signOut: mount.querySelector<HTMLButtonElement>("#account-sign-out")!,
  };
}

function createOpenRouterResponse(body: object, isStreaming: boolean) {
  let response: Response;
  if (isStreaming) {
    const outputText = (
      body as { output: Array<{ content: Array<{ type: string; text: string }> }> }
    ).output[0].content.find((content) => content.type === "output_text")!.text;
    const streamEvent = JSON.stringify({
      type: "response.output_text.delta",
      delta: outputText,
    });
    response = new Response(`data: ${streamEvent}\n\ndata: {"type":"response.completed"}\n\n`, {
      headers: { "Content-Type": "text/event-stream" },
    });
  } else {
    response = {
      ok: true,
      json: async () => body,
    } as Response;
  }

  return response;
}

function createNoEditResponse() {
  return {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              shouldInferFormulas: false,
              confidence: "high",
              summary: "No formula inference needed.",
              regions: [],
            }),
          },
        ],
      },
    ],
  };
}

function createSpreadsheetEditResponse() {
  return {
    output: [
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              answer: null,
              editExplanation: "Lowercased the column headers.",
              createNewSheet: false,
              comparisonRanges: [],
              shouldEditSheet: true,
              cellEdits: [
                { address: "A1", newFormula: "product" },
                { address: "B1", newFormula: "units" },
              ],
            }),
          },
        ],
      },
    ],
  };
}
