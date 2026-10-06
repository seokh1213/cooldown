import { digest } from "./bank";
import { numericRequest, numericGold } from "./numeric";
import type { QualityStory } from "./types";

export interface GenerationTask { id: string; question: string; system: string; prompt: string; maxTokens: number }
export interface TaskPacket { schema: 1; taskHash: string; tasks: GenerationTask[] }
export interface GenerationArtifact {
  schema: 1; taskHash: string;
  model: { backend: string; name: string; revision: string; adapterHash?: string };
  rows: Array<{ id: string; text: string; seconds: number }>;
}
export function generationTasks(stories: QualityStory[]): TaskPacket {
  const tasks = stories.map(story => {
    const request = numericRequest(story.turns[0].q, numericGold(story).context);
    return { id: `${story.id}:0`, question: story.turns[0].q, system: request.system, prompt: request.prompt, maxTokens: request.maxTokens };
  });
  return { schema: 1, taskHash: digest(tasks), tasks };
}
export function validateArtifact(packet: TaskPacket, artifact: GenerationArtifact): void {
  if (artifact.schema !== 1 || artifact.taskHash !== packet.taskHash) throw new Error("Generation artifact uses different tasks");
  if (!artifact.model?.backend || !artifact.model.name || !artifact.model.revision) throw new Error("Model provenance is required");
  const expected = new Set(packet.tasks.map(task => task.id));
  if (artifact.rows.length !== expected.size || new Set(artifact.rows.map(row => row.id)).size !== expected.size
    || artifact.rows.some(row => !expected.has(row.id) || typeof row.text !== "string" || !Number.isFinite(row.seconds) || row.seconds < 0))
    throw new Error("Incomplete, duplicate, or invalid generation results");
}
