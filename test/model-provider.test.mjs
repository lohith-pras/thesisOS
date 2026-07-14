import test from "node:test";
import assert from "node:assert/strict";
import { generateStructuredJson } from "../src/core/model-provider.mjs";

const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };
const messages = [{ role: "system", content: "Return JSON." }, { role: "user", content: "Test" }];

test("uses OpenRouter's chat-completions contract for structured JSON", async () => {
  let request;
  const result = await generateStructuredJson({ provider: "openrouter", model: "openai/gpt-5.6", messages, schema }, {
    apiKey: "router-key", fetchImpl: async (url, init) => {
      request = { url, headers: init.headers, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"answer":"ok"}' } }] }) };
    }
  });
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer router-key");
  assert.equal(request.body.response_format.type, "json_schema");
  assert.deepEqual(result.value, { answer: "ok" });
});

test("uses Ollama's local chat contract without an API key", async () => {
  let request;
  const result = await generateStructuredJson({ provider: "ollama", model: "qwen3", messages, schema }, {
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ message: { content: '{"answer":"local"}' } }) };
    }
  });
  assert.equal(request.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(request.body.stream, false);
  assert.deepEqual(request.body.format, schema);
  assert.deepEqual(result.value, { answer: "local" });
});

test("rejects unconfigured providers and malformed JSON", async () => {
  await assert.rejects(() => generateStructuredJson({ provider: "unknown", model: "x", messages, schema }), /Unsupported model provider/);
  await assert.rejects(() => generateStructuredJson({ provider: "ollama", model: "x", messages, schema }, { fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: "not json" } }) }) }), /invalid JSON/);
});
