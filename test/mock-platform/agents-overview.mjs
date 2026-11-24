// Fixed report from the private Platform contract. Daily counts are deliberately
// sparse so the Chrome walker covers both a zero day and a stacked day.
export function overviewFixture(agents, query) {
  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 10, i + 1)).toISOString().slice(0, 10),
  );
  const all = agents
    .map((agent, i) => ({
      id: agent.id,
      name: agent.name,
      archived_at: agent.archived_at ?? null,
      sessions: i === 0 ? 4 : i === 1 ? 2 : 0,
      error_rate: i === 0 ? 25 : 0,
      median_seconds: i === 0 ? 12 : i === 1 ? 5 : null,
      last_active: i < 2 ? days[29 - i] + "T12:00:00Z" : null,
    }))
    .filter((a) => !query.get("agent_id") || a.id === query.get("agent_id"));
  const busy = all.filter((a) => a.sessions);
  const sort = query.get("sort") ?? "sessions",
    dir = query.get("direction") === "asc" ? 1 : -1;
  const ordered = [...all].sort((a, b) => {
    const x = sort === "error_rate" && !a.sessions ? null : a[sort],
      y = sort === "error_rate" && !b.sessions ? null : b[sort];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (
      dir *
        (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) ||
      a.name.localeCompare(b.name)
    );
  });
  const count = busy.reduce((s, a) => s + a.sessions, 0);
  return {
    summary: {
      sessions: count,
      error_rate: count
        ? (100 *
            busy.reduce((s, a) => s + (a.error_rate * a.sessions) / 100, 0)) /
          count
        : 0,
      agents: busy.length,
      session_change: count ? 50 : null,
      error_change: count ? -25 : null,
    },
    days,
    series: busy.map((a) => ({
      id: a.id,
      name: a.name,
      counts: days.map((_, i) =>
        i === 28 ? 1 : i === 29 ? a.sessions - 1 : 0,
      ),
    })),
    active_time: busy.slice(0, 8),
    agents: ordered.slice(0, 10),
    total: all.length,
  };
}
