/** Keep the wire event name intact while distinguishing its source in the inspector. */
export function EventTypeName({ type }: { type: string }) {
  const dot = type.indexOf(".");
  if (dot < 0) return type;
  const domain = type.slice(0, dot);
  return (
    <>
      <span
        data-event-domain={domain}
        className="data-[event-domain=agent]:text-link data-[event-domain=user]:text-event-user data-[event-domain=span]:text-event-span"
      >
        {domain}
      </span>
      {type.slice(dot)}
    </>
  );
}
