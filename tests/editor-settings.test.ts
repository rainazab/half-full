import assert from "node:assert/strict";
import test from "node:test";
import { getEditorSettings } from "../lib/editor-settings";
import { editorialResponseSchema } from "../lib/validation";
import { zodTextFormat } from "openai/helpers/zod";

test("defaults to Anthropic even when only an OpenAI key is present", () => {
  const settings = getEditorSettings({ OPENAI_API_KEY: "test-key", ANTHROPIC_API_KEY: "  ", ANTHROPIC_MODEL: "  " });
  assert.equal(settings.provider, "anthropic");
  assert.equal(settings.keyEnv, "ANTHROPIC_API_KEY");
  assert.equal(settings.model, "claude-sonnet-5-5");
  assert.equal(settings.modelUsesDefault, true);
  assert.ok(!JSON.stringify(settings).includes("test-key"));
});

test("uses Anthropic by default with both keys or no keys", () => {
  assert.equal(getEditorSettings({ ANTHROPIC_API_KEY: "test-key", OPENAI_API_KEY: "another-test-key" }).provider, "anthropic");
  assert.equal(getEditorSettings({ ANTHROPIC_API_KEY: "test-key" }).provider, "anthropic");
  assert.equal(getEditorSettings({}).provider, "anthropic");
});

test("explicit provider and its model override win, even without that provider's key", () => {
  const settings = getEditorSettings({ LLM_PROVIDER: "openai", OPENAI_MODEL: " custom-model ", ANTHROPIC_API_KEY: "test-key" });
  assert.equal(settings.provider, "openai");
  assert.equal(settings.model, "custom-model");
  assert.equal(settings.modelUsesDefault, false);
  assert.equal(settings.keyEnv, "OPENAI_API_KEY");
  assert.equal(getEditorSettings({ LLM_PROVIDER: "anthropic", OPENAI_API_KEY: "test-key" }).provider, "anthropic");
});

test("invalid providers fail without echoing environment values", () => {
  assert.throws(() => getEditorSettings({ LLM_PROVIDER: "invalid-test-value" }), /LLM_PROVIDER must be/);
});

test("OpenAI receives the shared strict editorial JSON schema", () => {
  const format = zodTextFormat(editorialResponseSchema, "news_editorial_review");
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  assert.equal(format.schema.additionalProperties, false);
  assert.deepEqual(format.schema.required, ["decisions"]);
});
