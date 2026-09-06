import { test as base } from "@playwright/test";

// Keep credentialed contract requests on the configured endpoint.
export const test = base.extend({
  request: async ({ playwright, baseURL, extraHTTPHeaders }, provide) => {
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders,
      maxRedirects: 0,
    });
    try {
      await provide(request);
    } finally {
      await request.dispose();
    }
  },
});
