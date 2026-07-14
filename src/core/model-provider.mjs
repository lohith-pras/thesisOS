const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function json(text, provider) {
  try { return JSON.parse(requireText(text, `${provider} response text`)); }
  catch (error) { throw new Error(`${provider} returned invalid JSON: ${error.message}`); }
}

function responseText(body) {
  return body.output_text ?? body.output?.flatMap((item) => item.content ?? []).find((item) => typeof item.text === "string")?.text;
}

function chatText(body) {
  return body.choices?.[0]?.message?.content;
}

async function request(fetchImpl, url, headers, body, provider) {
  const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`${provider} request failed: ${payload.error?.message ?? `HTTP ${response.status}`}`);
  return payload;
}

export async function generateStructuredJson(input, options = {}) {
  const provider = requireText(input.provider, "Model provider").toLowerCase();
  const model = requireText(input.model, "Model");
  if (!Array.isArray(input.messages) || !input.messages.length) throw new Error("At least one model message is required.");
  if (!input.schema || typeof input.schema !== "object") throw new Error("A JSON schema is required.");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (provider === "openai") {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const body = await request(fetchImpl, options.apiUrl ?? OPENAI_URL, { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, {
      model, store: false, input: input.messages,
      text: { format: { type: "json_schema", name: input.schemaName ?? "structured_output", strict: true, schema: input.schema } }
    }, "OpenAI");
    return { provider, model, value: json(responseText(body), "OpenAI") };
  }

  if (provider === "openrouter") {
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
    const body = await request(fetchImpl, options.apiUrl ?? OPENROUTER_URL, { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, {
      model, messages: input.messages, stream: false,
      response_format: { type: "json_schema", json_schema: { name: input.schemaName ?? "structured_output", strict: true, schema: input.schema } }
    }, "OpenRouter");
    return { provider, model, value: json(chatText(body), "OpenRouter") };
  }

  if (provider === "ollama") {
    const body = await request(fetchImpl, options.apiUrl ?? process.env.OLLAMA_API_URL ?? OLLAMA_URL, { "Content-Type": "application/json" }, {
      model, messages: input.messages, format: input.schema, stream: false
    }, "Ollama");
    return { provider, model, value: json(body.message?.content, "Ollama") };
  }

  throw new Error(`Unsupported model provider '${provider}'. Use openai, openrouter, or ollama.`);
}

export const MODEL_PROVIDERS = ["openai", "openrouter", "ollama"];
