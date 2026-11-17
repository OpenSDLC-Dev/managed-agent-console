import { NextRequest } from "next/server";

// Readiness belongs to this process. The application edge tests platform admission.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const deep = request.nextUrl.searchParams.has("deep");
  return Response.json(
    {
      status: deep ? "degraded" : "ok",
      configured: true,
      login_gate: false,
      identity: { mode: "platform" },
      ...(deep ? { platform: { checked: false, reachable: false } } : {}),
    },
    { status: deep ? 503 : 200 },
  );
}
