import Markdown from "react-markdown";

/** Agent-written Markdown must not initiate requests from the operator's network. */
export function MemoryMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-6 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_a]:underline">
      <Markdown
        components={{
          img: ({ src, alt }) =>
            typeof src === "string" && src ? (
              <a href={src} target="_blank" rel="noopener noreferrer">
                Open image: {alt || "image"}
              </a>
            ) : (
              <span>{alt || "Image"}</span>
            ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
