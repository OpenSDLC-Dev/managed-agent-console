import { Bot, Wrench, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlaygroundModel } from "@/lib/platform/playground";
import {
  availablePlaygroundTools,
  type PlaygroundToolPreset,
} from "./playground-tool-presets";

export type PlaygroundTemplate = {
  title: string;
  description: string;
  system: string;
  prompt: string;
  stream?: true;
  tools: Record<string, unknown>[];
};

type Recipe = Omit<PlaygroundTemplate, "tools"> &
  (
    | { preset: PlaygroundToolPreset["id"]; clientDescription?: string }
    | { tools: PlaygroundTemplate["tools"] }
  );

type TemplateCard = PlaygroundTemplate & { label: string; Icon: LucideIcon };

const recipes: Recipe[] = [
  {
    title: "Deep research",
    description:
      "Compare web search results returned by the provider in a short, cited brief.",
    clientDescription:
      "Ask your client to search for sources, then write a brief from the results it returns.",
    system:
      "Divide the question into two or three research questions. Use web search to find primary sources for each one. Compare the evidence in a short brief and link each claim to its source.",
    prompt:
      "When should a developer use the Messages API or Managed Agents sessions? Compare their capabilities and the infrastructure each needs for a long-running agent.",
    preset: "web_search",
  },
  {
    title: "Operate a computer",
    description:
      "Use the current screen to choose clicks and keystrokes for your client to execute.",
    system:
      "Ask the client for a screenshot or a description of the current screen before acting. Choose one computer action and wait for the updated screen or its description before continuing.",
    prompt:
      "My browser is on the English Wikipedia main page. Use the computer to open today's featured article and tell me its title.",
    preset: "computer",
  },
  {
    title: "Analyze a log with bash",
    description:
      "Request shell commands to inspect gateway log lines and interpret their output.",
    system:
      "Investigate the log lines in the request using Bash. Request one read-only command at a time and wait for the client to return its output. Explain the change in status counts and show the evidence.",
    prompt: [
      "Use Bash to compare the gateway's status codes and upstreams before and after 06:40. Use these log lines as the input.",
      "",
      "06:39:50 200 GET /orders upstream=api-1 34ms",
      "06:39:56 200 GET /orders upstream=api-2 38ms",
      "06:40:05 503 GET /orders upstream=api-2 3001ms",
      "06:40:18 200 GET /orders upstream=api-1 36ms",
      "06:40:33 503 GET /orders upstream=api-2 3004ms",
    ].join("\n"),
    preset: "bash",
  },
  {
    title: "Explain an article",
    description:
      "Explain a linked article using the page the provider reads for the model.",
    clientDescription:
      "Ask your client to fetch an article and explain the passages it returns.",
    system:
      "Fetch the article at the URL the user provided. Answer from its text, quote a short supporting passage and link to the source.",
    prompt:
      "Read https://www.anthropic.com/research/tracing-thoughts-language-model and explain what the authors mean by a circuit. Why do they map circuits?",
    preset: "web_fetch",
  },
  {
    title: "Stream tool arguments live",
    description:
      "See file arguments as your model streams them. Chunk sizes vary by provider.",
    system:
      "Prepare a single make_file call for the client. Put each line in the lines_of_text array and include the requested filename.",
    prompt:
      "Write a 24-line poem about debugging a distributed system at 3 a.m. Save it as poem.txt.",
    stream: true,
    tools: [
      {
        name: "make_file",
        description: "Write the supplied lines to a text file.",
        input_schema: {
          type: "object",
          properties: {
            filename: { type: "string", description: "Name of the text file." },
            lines_of_text: { type: "array", items: { type: "string" } },
          },
          required: ["filename", "lines_of_text"],
        },
      },
    ],
  },
  {
    title: "Call tools in parallel",
    description:
      "Request weather and local time from client tools in one turn.",
    system: [
      "Help plan a trip using live weather and local time.",
      "Request all independent lookups together in one turn.",
      "Wait for the client to return the tool results in a single message before answering.",
    ].join("\n\n"),
    prompt:
      "I'm planning a remote-work week in San Francisco, Tokyo, or Paris. What are the current weather and local time in each city?",
    tools: [
      {
        name: "get_weather",
        description: "Look up the current weather for a city.",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City to look up." },
          },
          required: ["location"],
        },
      },
      {
        name: "get_time",
        description: "Look up the current local time.",
        input_schema: {
          type: "object",
          properties: {
            timezone: {
              type: "string",
              description: "IANA time zone, such as Asia/Tokyo.",
            },
          },
          required: ["timezone"],
        },
      },
    ],
  },
  {
    title: "Navigate a website",
    description: "Ask your browser client to open a page and follow a link.",
    system:
      "Request one browser action at a time. Wait for the client to return the page after each action before choosing the next step.",
    prompt:
      "Open https://example.com in the browser. Follow the page's information link and tell me the heading you find there.",
    preset: "browser",
  },
];

export function PlaygroundTemplates({
  model,
  selected,
  onSelect,
}: {
  model?: PlaygroundModel;
  selected?: string;
  onSelect: (template: PlaygroundTemplate) => void;
}) {
  const available = availablePlaygroundTools(model);
  const templates = recipes.flatMap<TemplateCard>((recipe) => {
    if ("tools" in recipe)
      return [{ ...recipe, label: "Custom tools", Icon: Wrench }];
    const preset = available.find(({ id }) => id === recipe.preset);
    if (!preset) return [];
    const clientDescription =
      preset.definition.type == null || preset.definition.type === "custom"
        ? recipe.clientDescription
        : undefined;
    return [
      {
        ...recipe,
        description: clientDescription ?? recipe.description,
        system: clientDescription
          ? `${recipe.system}\n\nRequest the tool from the client and wait for its result before answering or citing a source.`
          : recipe.system,
        tools: [preset.definition],
        label: preset.label,
        Icon: preset.icon,
      },
    ];
  });
  const [more, setMore] = useState(false);
  const pageSize = 6;
  const hasMore = templates.length > pageSize;
  const start = hasMore && more ? pageSize : 0;
  return (
    <div className="mx-auto my-auto w-full max-w-[calc(42rem+2.5rem)] px-5 py-8">
      <div className="mb-10 text-center">
        <Bot
          aria-hidden
          className="mx-auto mb-3 size-12 text-[#b6765a]"
          strokeWidth={1.75}
        />
        <h3 className="text-sm font-semibold">Start with a template</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Build your request and press Run.
        </p>
      </div>
      <ul
        data-template-page={start === 0 ? 1 : 2}
        className="grid grid-cols-1 gap-4 @min-[28rem]:grid-cols-2"
      >
        {templates.slice(start, start + pageSize).map((template, index) => (
          <li key={template.title}>
            <button
              type="button"
              aria-label={template.title}
              aria-describedby={`playground-template-${index}-details`}
              aria-pressed={selected === template.title}
              onClick={() => onSelect(template)}
              className="flex h-full min-h-[124px] w-full flex-col items-start gap-2 rounded-xl border border-transparent bg-muted/60 p-3.5 text-left text-sm hover:bg-muted/85 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-foreground/25 aria-pressed:bg-muted"
            >
              <span className="font-medium">{template.title}</span>
              <span
                id={`playground-template-${index}-details`}
                className="grow text-[13px] leading-5 text-muted-foreground"
              >
                {template.description}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                <template.Icon className="size-3" aria-hidden />
                {template.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <nav aria-label="Template pages" className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMore(!more)}
          >
            {more ? "Previous" : "More"}
          </Button>
        </nav>
      )}
    </div>
  );
}
