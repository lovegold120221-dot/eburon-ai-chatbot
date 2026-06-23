import { createOpenAI, customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

// Ollama middleware provider (OpenAI-compatible)
const ollamaMiddlewareUrl =
  process.env.OLLAMA_MIDDLEWARE_URL ?? "http://localhost:11434";
const ollamaMiddlewareKey =
  process.env.OLLAMA_MIDDLEWARE_API_KEY ?? "eburon-local";

const ollamaProvider = createOpenAI({
  baseURL: `${ollamaMiddlewareUrl}/v1`,
  apiKey: ollamaMiddlewareKey,
  name: "eburon-ollama",
});

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Route ollama/ models through the local middleware
  if (modelId.startsWith("ollama/")) {
    const ollamaModel = modelId.replace(/^ollama\//, "");
    return ollamaProvider(ollamaModel);
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return gateway.languageModel(titleModel.id);
}
