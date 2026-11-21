import { Bot, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// These starters send ordinary Messages text and work with any chat alias.
const templates = [
  [
    "Extract structured data",
    "Turn a short note into a JSON object.",
    "Extract the name, city and occupation as JSON from this note: Sam is a teacher in Lisbon.",
  ],
  [
    "Summarize text",
    "Condense a passage into its main points.",
    "Summarize in one sentence: The library will extend its opening hours on weekdays and start a Saturday reading club next month.",
  ],
  [
    "Classify text",
    "Assign a category to a short message.",
    "Classify this message as a question, suggestion or bug report: Could we add a dark theme?",
  ],
  [
    "Translate text",
    "Translate a passage into another language.",
    "Translate into French: The next train leaves at noon.",
  ],
  [
    "Rewrite a message",
    "Adjust the tone while preserving the facts.",
    "Rewrite this message in a friendly tone: Your reservation expires tomorrow. Please confirm by 5 pm.",
  ],
  [
    "Compare options",
    "Compare two approaches and their tradeoffs.",
    "Compare walking and cycling for a two-kilometre commute. Give one advantage of each.",
  ],
  [
    "Explain code",
    "Explain what a short piece of code does.",
    "Explain this Python expression in one sentence: sorted(set(['pear', 'apple', 'pear']))",
  ],
  [
    "Brainstorm ideas",
    "Generate ideas within a constraint.",
    "Suggest three names for a neighborhood book exchange. Keep each name under four words.",
  ],
] as const;

export function PlaygroundTemplates({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  const [more, setMore] = useState(false);
  return (
    <div className="mx-auto my-auto w-full max-w-[calc(42rem+2.5rem)] px-5 py-8">
      <div className="mb-8 text-center">
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
      <div className="grid grid-cols-1 gap-4 @min-[28rem]:grid-cols-2">
        {templates
          .slice(more ? 6 : 0, more ? templates.length : 6)
          .map(([title, description, prompt]) => (
            <button
              key={title}
              type="button"
              onClick={() => onSelect(prompt)}
              className="flex min-h-[124px] flex-col items-start gap-2 rounded-xl bg-muted/50 p-3.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="font-medium">{title}</span>
              <span className="grow text-[13px] leading-5 text-muted-foreground">
                {description}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                <MessageSquareText className="size-3" aria-hidden />
                Text
              </span>
            </button>
          ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setMore(!more)}
        >
          {more ? "Previous" : "More"}
        </Button>
      </div>
    </div>
  );
}
