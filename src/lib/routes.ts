/**
 * Where the console lands.
 *
 * Three places need this and they straddle the server/client boundary, which is
 * why it is its own module rather than a constant in one of them: `/` redirects
 * here, a sign-in returns here, and the nav's first row points here.
 * `lib/identity/rp.ts` is `server-only`, so the login form cannot import the
 * constant from there and used to carry its own copy of the string — which is
 * exactly how making the Dashboard the landing page missed the login path on
 * the first pass.
 */
export const LANDING_ROUTE = "/dashboard";
