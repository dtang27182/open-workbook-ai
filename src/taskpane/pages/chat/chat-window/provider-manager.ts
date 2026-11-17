import { OpenrouterKeyStore } from "../../auth/openrouter-auth/openrouter-api-key";
import { OpenAIKeyStore } from "../../auth/add-openai-key/openai-key-store";
import {
  type MainModelId,
  type MainModelOption,
  type ModelProvider,
  openAiMainModelOptions,
  openRouterMainModelOptions,
} from "./llm/main-model-options";
import {
  openAiPreprocessModelConfigs,
  openRouterPreprocessModelConfigs,
} from "./llm/preprocess-formula-inference";

type SignedInProvider = {
  provider: ModelProvider;
  keyStore: OpenAIKeyStore | OpenrouterKeyStore;
  endpoint: string;
  displayName: string;
};

export class ProviderManager {
  private readonly openrouterKeyStore: OpenrouterKeyStore;
  private readonly openAiKeyStore: OpenAIKeyStore;
  private model: MainModelOption | undefined;

  constructor(
    openrouterKeyStore = new OpenrouterKeyStore(),
    openAiKeyStore = new OpenAIKeyStore()
  ) {
    this.openrouterKeyStore = openrouterKeyStore;
    this.openAiKeyStore = openAiKeyStore;
    if (openAiKeyStore.hasKey() && openrouterKeyStore.hasKey()) {
      throw new Error("Both OpenAI and OpenRouter API keys are configured.");
    } else if (openAiKeyStore.hasKey()) {
      this.selectModelForProvider("openai");
    } else if (openrouterKeyStore.hasKey()) {
      this.selectModelForProvider("openrouter");
    }
  }

  signIn(provider: ModelProvider, apiKey: string): void {
    if (provider === "openai") {
      this.openAiKeyStore.set(apiKey);
      this.openrouterKeyStore.clear();
    } else if (provider === "openrouter") {
      this.openrouterKeyStore.set(apiKey);
      this.openAiKeyStore.clear();
    }
    this.selectModelForProvider(provider);
  }

  signOut(): void {
    const active = this.getProvider();
    if (active !== undefined) {
      active.keyStore.clear();
    }
  }

  getProvider(): SignedInProvider | undefined {
    if (this.openAiKeyStore.hasKey() && this.openrouterKeyStore.hasKey()) {
      throw new Error("Both OpenAI and OpenRouter API keys are configured.");
    } else if (this.openAiKeyStore.hasKey()) {
      return {
        provider: "openai",
        keyStore: this.openAiKeyStore,
        endpoint: "https://api.openai.com/v1/responses",
        displayName: "OpenAI",
      };
    } else if (this.openrouterKeyStore.hasKey()) {
      return {
        provider: "openrouter",
        keyStore: this.openrouterKeyStore,
        endpoint: "https://openrouter.ai/api/v1/responses",
        displayName: "OpenRouter",
      };
    }
  }

  setModel(modelId: MainModelId): void {
    this.model = this.getModelOptions().find((option) => option.config.model === modelId)!;
  }

  getModel(): MainModelOption {
    if (this.model === undefined) {
      throw new Error("Sign in before selecting a model.");
    } else {
      return this.model;
    }
  }

  getModelOptions(): readonly MainModelOption[] {
    const provider = this.getProvider()?.provider;
    if (provider === "openai") {
      return openAiMainModelOptions;
    } else if (provider === "openrouter") {
      return openRouterMainModelOptions;
    }
    return [];
  }

  getPreprocessModelConfigs() {
    const provider = this.getProvider()?.provider;
    if (provider === "openai") {
      return openAiPreprocessModelConfigs;
    } else if (provider === "openrouter") {
      return openRouterPreprocessModelConfigs;
    }
    throw new Error("Sign in before sending a request.");
  }

  private selectModelForProvider(provider: ModelProvider): void {
    const currentSelectionKey = this.model?.selectionKey;
    if (provider === "openai") {
      this.model =
        openAiMainModelOptions.find((option) => option.selectionKey === currentSelectionKey) ||
        openAiMainModelOptions[0];
    } else if (provider === "openrouter") {
      this.model =
        openRouterMainModelOptions.find((option) => option.selectionKey === currentSelectionKey) ||
        openRouterMainModelOptions[0];
    }
  }
}
