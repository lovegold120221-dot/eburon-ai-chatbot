import {
  chatModels,
  getAllGatewayModels,
  getCapabilities,
  getOllamaModels,
  isDemo,
  type ModelCapabilities,
} from "@/lib/ai/models";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const curatedCapabilities = await getCapabilities();
  const ollamaModels = await getOllamaModels();

  // Build capabilities for Ollama models
  const ollamaCaps: Record<string, ModelCapabilities> = {};
  for (const m of ollamaModels) {
    ollamaCaps[m.id] = {
      tools: true,
      vision: m.vision ?? false,
      reasoning: false,
    };
  }

  const allCapabilities = { ...curatedCapabilities, ...ollamaCaps };

  if (isDemo) {
    const models = await getAllGatewayModels();
    const capabilities = Object.fromEntries(
      models.map((m) => [m.id, allCapabilities[m.id] ?? m.capabilities])
    );

    return Response.json({ capabilities, models }, { headers });
  }

  // Include Ollama models in the response so the frontend can display them
  if (ollamaModels.length > 0) {
    return Response.json(
      {
        ...allCapabilities,
        models: [...chatModels, ...ollamaModels],
      },
      { headers }
    );
  }

  return Response.json(allCapabilities, { headers });
}
