import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import { AuthTypeBadge, CredentialAuthSummary } from "./credential-auth";
import type { CredentialAuth } from "@/lib/platform/types";

const oauthRefresh: CredentialAuth = {
  type: "mcp_oauth",
  mcp_server_url: "https://mcp.example.com/sse",
  expires_at: "2026-12-31T18:30:00Z",
  refresh: {
    client_id: "client_1",
    token_endpoint: "https://auth.example.com/token",
    token_endpoint_auth: { type: "none" },
    resource: null,
    scope: null,
  },
};

describe("CredentialAuthSummary", () => {
  it("renders mcp_oauth with auto-refresh and an expiry timestamp", () => {
    const { container } = render(<CredentialAuthSummary auth={oauthRefresh} />);
    expect(screen.getByText("https://mcp.example.com/sse")).toBeInTheDocument();
    expect(container.textContent).toContain(
      "auto-refresh · expires Dec 31, 2026, 18:30",
    );
  });

  it("renders mcp_oauth without refresh as never expiring", () => {
    const { container } = render(
      <CredentialAuthSummary
        auth={{
          type: "mcp_oauth",
          mcp_server_url: "https://mcp.example.com/sse",
          expires_at: null,
          refresh: null,
        }}
      />,
    );
    expect(container.textContent).toContain("no refresh · expires never");
  });

  it("renders static_bearer as just the server url", () => {
    const { container } = render(
      <CredentialAuthSummary
        auth={{
          type: "static_bearer",
          mcp_server_url: "https://mcp.bearer.example.com",
        }}
      />,
    );
    expect(
      screen.getByText("https://mcp.bearer.example.com"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("expires");
  });

  it("renders an unrestricted environment_variable credential", () => {
    const { container } = render(
      <CredentialAuthSummary
        auth={{
          type: "environment_variable",
          secret_name: "MY_API_KEY",
          networking: { type: "unrestricted" },
          injection_location: { header: true, body: false },
        }}
      />,
    );
    expect(screen.getByText("MY_API_KEY")).toBeInTheDocument();
    expect(container.textContent).toContain("any host · header");
    expect(container.textContent).not.toContain("body");
  });

  it("renders a host-limited environment_variable credential injected in header and body", () => {
    const { container } = render(
      <CredentialAuthSummary
        auth={{
          type: "environment_variable",
          secret_name: "TOKEN",
          networking: {
            type: "limited",
            allowed_hosts: ["a.example.com", "b.example.com"],
          },
          injection_location: { header: true, body: true },
        }}
      />,
    );
    expect(container.textContent).toContain(
      "a.example.com, b.example.com · header + body",
    );
  });

  it("renders a body-only injection location", () => {
    const { container } = render(
      <CredentialAuthSummary
        auth={{
          type: "environment_variable",
          secret_name: "TOKEN",
          networking: { type: "limited", allowed_hosts: ["c.example.com"] },
          injection_location: { header: false, body: true },
        }}
      />,
    );
    expect(container.textContent).toContain("c.example.com · body");
    expect(container.textContent).not.toContain("header");
  });
});

describe("AuthTypeBadge", () => {
  it.each(["mcp_oauth", "static_bearer", "environment_variable"] as const)(
    "labels the badge with the auth type %s",
    (type) => {
      const auth =
        type === "mcp_oauth"
          ? oauthRefresh
          : type === "static_bearer"
            ? ({
                type,
                mcp_server_url: "https://x.example.com",
              } satisfies CredentialAuth)
            : ({
                type,
                secret_name: "S",
                networking: { type: "unrestricted" },
                injection_location: { header: true, body: false },
              } satisfies CredentialAuth);
      render(<AuthTypeBadge auth={auth} />);
      expect(screen.getByText(type)).toBeInTheDocument();
    },
  );
});
