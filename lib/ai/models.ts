export const DEFAULT_CHAT_MODEL = "moonshotai/kimi-k2.5";

export const titleModel = {
  id: "moonshotai/kimi-k2.5",
  name: "Kimi K2.5",
  provider: "moonshotai",
  description: "Fast model for title generation",
  gatewayOrder: ["fireworks", "bedrock"],
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  vision?: boolean;
};

export const chatModels: ChatModel[] = [
  {
    id: "deepseek/deepseek-v3.2",
    name: "Eburon Coder",
    provider: "deepseek",
    description: "Optimized for coding tasks",
    gatewayOrder: ["bedrock", "deepinfra"],
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Eburon Pro",
    provider: "moonshotai",
    description: "Flagship general-purpose model",
    gatewayOrder: ["fireworks", "bedrock"],
  },
  {
    id: "openai/gpt-oss-20b",
    name: "Eburon Beta",
    provider: "openai",
    description: "Compact experimental model",
    gatewayOrder: ["groq", "bedrock"],
    reasoningEffort: "low",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "Eburon Thinking",
    provider: "openai",
    description: "Advanced reasoning model",
    gatewayOrder: ["fireworks", "bedrock"],
    reasoningEffort: "low",
  },
  {
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Eburon Flash",
    provider: "xai",
    description: "Fast non-reasoning model with tool use",
    gatewayOrder: ["xai"],
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Eburon Lite",
    provider: "google",
    description: "Ultra-fast, cost-efficient model with 1M context",
    gatewayOrder: ["vertex"],
    vision: true,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Eburon Flash Pro",
    provider: "google",
    description: "High-performance model with 1M context",
    gatewayOrder: ["vertex"],
    vision: true,
  },
  {
    id: "google/gemini-2.5-flash-preview-12-2025",
    name: "Eburon Flash Preview",
    provider: "google",
    description: "Preview of next-gen Flash model with 1M context",
    gatewayOrder: ["vertex"],
    vision: true,
  },
  {
    id: "ollama/llama3.2",
    name: "Eburon Local",
    provider: "ollama",
    description: "Self-hosted via Ollama middleware",
  },
  {
    id: "ollama/qwen2.5",
    name: "Eburon Local Pro",
    provider: "ollama",
    description: "Self-hosted via Ollama middleware",
  },
  {
    id: "ollama/deepseek-r1",
    name: "Eburon Local Thinking",
    provider: "ollama",
    description: "Self-hosted reasoning model via Ollama middleware",
  },
];

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  const results = await Promise.all(
    chatModels.map(async (model) => {
      // Ollama models: use static capabilities (no gateway endpoint to query)
      if (model.provider === "ollama") {
        return [
          model.id,
          {
            tools: model.id.includes("qwen") || model.id.includes("llama"),
            vision: false,
            reasoning: model.id.includes("r1") || model.id.includes("reasoning"),
          },
        ];
      }

      try {
        const res = await fetch(
          `https://ai-gateway.vercel.sh/v1/models/${model.id}/endpoints`,
          { next: { revalidate: 86_400 } }
        );
        if (!res.ok) {
          return [model.id, { tools: false, vision: false, reasoning: false }];
        }

        const json = await res.json();
        const endpoints = json.data?.endpoints ?? [];
        const params = new Set(
          endpoints.flatMap(
            (e: { supported_parameters?: string[] }) =>
              e.supported_parameters ?? []
          )
        );
        const inputModalities = new Set(
          json.data?.architecture?.input_modalities ?? []
        );

        return [
          model.id,
          {
            tools: params.has("tools"),
            vision: inputModalities.has("image"),
            reasoning: params.has("reasoning"),
          },
        ];
      } catch {
        return [model.id, { tools: false, vision: false, reasoning: false }];
      }
    })
  );

  return Object.fromEntries(results);
}

export const isDemo = process.env.IS_DEMO === "1";

type GatewayModel = {
  id: string;
  name: string;
  type?: string;
  tags?: string[];
};

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    return (json.data ?? [])
      .filter((m: GatewayModel) => m.type === "language")
      .map((m: GatewayModel) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        description: "",
        capabilities: {
          tools: m.tags?.includes("tool-use") ?? false,
          vision: m.tags?.includes("vision") ?? false,
          reasoning: m.tags?.includes("reasoning") ?? false,
        },
      }));
  } catch {
    return [];
  }
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
