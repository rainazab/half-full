import assert from "node:assert/strict";
import test from "node:test";
import { NARRATORS, isNarratorId, narratorById } from "../lib/narrators";
import { cartesiaConfig } from "../lib/cartesia";
import { audioKey } from "../lib/audio-cache";
import {
  audioPath,
  cleanPreferences,
  defaultPreferences,
  readPreferences,
  writePreferences,
} from "../lib/preferences";

test("exactly three narrators map to distinct verified Cartesia voice IDs", () => {
  assert.deepEqual(
    NARRATORS.map((voice) => voice.name),
    ["Skylar", "Daniel", "Rowan"],
  );
  assert.equal(new Set(NARRATORS.map((voice) => voice.voiceId)).size, 3);
  for (const voice of NARRATORS) assert.match(voice.voiceId, /^[0-9a-f-]{36}$/);
  assert.ok(isNarratorId("daniel"));
  assert.ok(!isNarratorId("Daniel"));
  assert.ok(!isNarratorId("someone-else"));
  assert.equal(narratorById("unknown").id, "skylar");
});
test("a narrator selects its own voice; no narrator keeps the configured default", () => {
  const env = { CARTESIA_API_KEY: "synthetic-key" };
  assert.equal(
    cartesiaConfig(env, "daniel").voice,
    NARRATORS.find((voice) => voice.id === "daniel")!.voiceId,
  );
  assert.equal(
    cartesiaConfig({ ...env, CARTESIA_VOICE_ID: "custom-voice-1" }).voice,
    "custom-voice-1",
  );
  // A named narrator wins over the environment override, so the choice is honest.
  assert.equal(
    cartesiaConfig({ ...env, CARTESIA_VOICE_ID: "custom-voice-1" }, "rowan")
      .voice,
    NARRATORS.find((voice) => voice.id === "rowan")!.voiceId,
  );
});
test("narration cache keys separate voices, scripts and models", () => {
  const script = "The same reviewed story.";
  const keys = NARRATORS.map((voice) =>
    audioKey(script, voice.voiceId, "sonic-3.6"),
  );
  assert.equal(new Set(keys).size, 3);
  assert.notEqual(
    audioKey(script, NARRATORS[0].voiceId, "sonic-3.6"),
    audioKey(script, NARRATORS[0].voiceId, "sonic-4"),
  );
  assert.notEqual(
    audioKey("Another script.", NARRATORS[0].voiceId, "sonic-3.6"),
    keys[0],
  );
  assert.equal(
    audioPath("edition 1", "story/1", "rowan"),
    "/api/audio/edition%201/story%2F1?narrator=rowan",
  );
});
test("preferences clean malformed input and persist for guests", () => {
  assert.deepEqual(cleanPreferences(null), defaultPreferences());
  assert.deepEqual(
    cleanPreferences({ narrator: "rowan", speed: 1.25, autoplayNext: true }),
    { narrator: "rowan", speed: 1.25, autoplayNext: true, mode: "both" },
  );
  assert.deepEqual(
    cleanPreferences({ narrator: "nobody", speed: 9, autoplayNext: "yes" }),
    defaultPreferences(),
  );
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  assert.deepEqual(readPreferences(storage), defaultPreferences());
  writePreferences(storage, {
    narrator: "daniel",
    speed: 1.5,
    autoplayNext: false,
    mode: "read",
  });
  assert.equal(readPreferences(storage).narrator, "daniel");
  assert.equal(readPreferences(storage).speed, 1.5);
  store.set([...store.keys()][0], "{not json");
  assert.deepEqual(readPreferences(storage), defaultPreferences());
});
