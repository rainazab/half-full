/**
 * User-facing narrator choices. Voice IDs were verified against the Cartesia
 * public voice library (GET /voices) on October 24, 2026. They are public
 * library voices, not clones; no impersonation of a real person is implied.
 */
export const NARRATORS = [
  {
    id: "skylar",
    name: "Skylar",
    voiceId: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
    libraryName: "Skylar - Friendly Guide",
    description: "Warm and approachable. The original half full voice.",
  },
  {
    id: "daniel",
    name: "Daniel",
    voiceId: "47c38ca4-5f35-497b-b1a3-415245fb35e1",
    libraryName: "Daniel - Modern Assistant",
    description: "Clear and crisp, with an even pace.",
  },
  {
    id: "rowan",
    name: "Rowan",
    voiceId: "8c254787-4eb4-4577-bd3d-fb3c273baea2",
    libraryName: "Rowan - Steady Guide",
    description: "Steady and reassuring, good for longer listens.",
  },
] as const;
export type NarratorId = (typeof NARRATORS)[number]["id"];
export type Narrator = (typeof NARRATORS)[number];
export const DEFAULT_NARRATOR: NarratorId = "skylar";
export function isNarratorId(value: unknown): value is NarratorId {
  return (
    typeof value === "string" && NARRATORS.some((voice) => voice.id === value)
  );
}
export function narratorById(value: unknown): Narrator {
  return (
    NARRATORS.find((voice) => voice.id === value) ??
    NARRATORS.find((voice) => voice.id === DEFAULT_NARRATOR)!
  );
}
