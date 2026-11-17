/** Session metadata for resource-focused unit fixtures. Auth tests supply their own. */
export const TEST_SESSION = {
  signed_in: true,
  id: "user_test_admin",
  role: "admin",
  role_source: "manual",
  name: "Test administrator",
  email: "admin@example.test",
  csrf_token: "test-session-csrf",
  expires_at: "2099-01-01T00:00:00Z",
} as const;

export function withTestSession<A extends unknown[]>(
  resourceFetch: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return (...args) =>
    String(args[0]) === "/api/auth/session"
      ? Promise.resolve(Response.json(TEST_SESSION))
      : resourceFetch(...args);
}
