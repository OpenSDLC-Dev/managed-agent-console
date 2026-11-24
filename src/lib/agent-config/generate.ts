import { runPlayground, type PlaygroundModel } from "@/lib/platform/playground";
import type { AgentWriteBody } from "@/lib/platform/queries";

const generatorInstructions =
  "You help a user draft a Managed Agents configuration. Return only a JSON object with three strings: name, description, system. Keep the configuration faithful to the request. Preserve existing instructions when refining unless the user asks to change them. Do not run tools or create resources.";
export async function generateAgentDraft(
  prompt: string,
  base: AgentWriteBody,
  model: PlaygroundModel,
  identity: string,
  signal: AbortSignal,
): Promise<{ name: string; description: string; system: string }> {
  const text: string[] = [];
  await runPlayground(
    {
      model: model.id,
      max_tokens:
        model.max_tokens && model.max_tokens > 0
          ? Math.min(1500, model.max_tokens)
          : 1500,
      stream: false,
      system: generatorInstructions,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            request: prompt,
            current: {
              name: base.name,
              description: base.description,
              system: base.system,
            },
          }),
        },
      ],
    },
    identity,
    signal,
    (t) => text.push(t),
  );
  const obj = JSON.parse(
    text
      .join("")
      .trim()
      .replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, ""),
  );
  if (
    !obj ||
    ["name", "description", "system"].some((k) => typeof obj[k] !== "string")
  )
    throw Error("The model did not return a usable agent configuration.");
  return { name: obj.name, description: obj.description, system: obj.system };
}
