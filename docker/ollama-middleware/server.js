import express from "express";
import cors from "cors";

const PORT = process.env.MIDDLEWARE_PORT || 11434;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
const API_KEY = process.env.MIDDLEWARE_API_KEY || "eburon-local";
const DEFAULT_CONTEXT_WINDOW = Number(process.env.DEFAULT_CONTEXT_WINDOW) || 32768;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// --- Auth middleware ---
function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const auth = req.headers.authorization;
  if (auth === `Bearer ${API_KEY}`) return next();
  return res.status(401).json({ error: { message: "Invalid API key", type: "auth_error" } });
}

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ollama: OLLAMA_BASE_URL });
});

// --- List models (OpenAI-compatible /v1/models) ---
app.get("/v1/models", authMiddleware, async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      return res.status(502).json({ error: { message: "Cannot reach Ollama", type: "proxy_error" } });
    }
    const data = await response.json();
    const models = (data.models || []).map((m) => ({
      id: `ollama/${m.name}`,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "eburon",
      context_window: m.details?.parameter_size ? DEFAULT_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW,
    }));
    res.json({ object: "list", data: models });
  } catch (err) {
    res.status(502).json({ error: { message: `Ollama unreachable: ${err.message}`, type: "proxy_error" } });
  }
});

// --- Chat completions (OpenAI-compatible /v1/chat/completions) ---
app.post("/v1/chat/completions", authMiddleware, async (req, res) => {
  try {
    const { model, messages, stream, temperature, max_tokens, tools, tool_choice } = req.body;

    // Strip the "ollama/" prefix if present
    const ollamaModel = model.replace(/^ollama\//, "");

    // Convert OpenAI messages to Ollama format
    const ollamaMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
    }));

    const ollamaPayload = {
      model: ollamaModel,
      messages: ollamaMessages,
      stream: stream ?? false,
      options: {
        ...(temperature !== undefined && { temperature }),
        ...(max_tokens !== undefined && { num_predict: max_tokens }),
      },
    };

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });

      if (!ollamaResponse.ok) {
        const errText = await ollamaResponse.text();
        res.write(`data: ${JSON.stringify({ error: { message: errText } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const reader = ollamaResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            const sseChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: `ollama/${ollamaModel}`,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: chunk.message?.content || "",
                  },
                  finish_reason: chunk.done ? "stop" : null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          } catch {
            // skip malformed lines
          }
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaPayload),
      });

      if (!ollamaResponse.ok) {
        const errText = await ollamaResponse.text();
        return res.status(502).json({ error: { message: `Ollama error: ${errText}`, type: "proxy_error" } });
      }

      const data = await ollamaResponse.json();
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: `ollama/${ollamaModel}`,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: data.message?.content || "",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
      res.json(openaiResponse);
    }
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: "internal_error" } });
  }
});

// --- Embeddings (OpenAI-compatible /v1/embeddings) ---
app.post("/v1/embeddings", authMiddleware, async (req, res) => {
  try {
    const { model, input } = req.body;
    const ollamaModel = model.replace(/^ollama\//, "");

    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, prompt: input }),
    });

    if (!ollamaResponse.ok) {
      return res.status(502).json({ error: { message: "Ollama embeddings error", type: "proxy_error" } });
    }

    const data = await ollamaResponse.json();
    res.json({
      object: "list",
      data: [{ object: "embedding", embedding: data.embedding, index: 0 }],
      model: `ollama/${ollamaModel}`,
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: "internal_error" } });
  }
});

app.listen(PORT, () => {
  console.log(`[Eburon Ollama Middleware] running on port ${PORT}`);
  console.log(`[Eburon Ollama Middleware] proxying to Ollama at ${OLLAMA_BASE_URL}`);
  console.log(`[Eburon Ollama Middleware] API key: ${API_KEY ? "enabled" : "disabled"}`);
});
