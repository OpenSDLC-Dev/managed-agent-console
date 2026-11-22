import { Bot, Wrench } from "lucide-react";

export type PlaygroundTemplate = {
  title: string;
  description: string;
  system: string;
  prompt: string;
  stream?: true;
  tools: Record<string, unknown>[];
};

const templates: PlaygroundTemplate[] = [
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
];

export function PlaygroundTemplates({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect: (template: PlaygroundTemplate) => void;
}) {
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
      <ul className="grid grid-cols-1 gap-4 @min-[28rem]:grid-cols-2">
        {templates.map((template, index) => (
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
                <Wrench className="size-3" aria-hidden />
                Custom tools
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
