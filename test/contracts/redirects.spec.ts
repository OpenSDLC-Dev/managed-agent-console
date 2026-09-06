import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect } from "@playwright/test";
import { test } from "./fixtures";

test.use({ extraHTTPHeaders: { "x-api-key": "redirect-test-sentinel" } });

test("credentialed requests do not follow redirects", async ({ request }) => {
  let destinationRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/destination" });
    } else {
      destinationRequests++;
      res.writeHead(200);
    }
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await request.get(`http://127.0.0.1:${port}/redirect`);
    expect(response.status()).toBe(302);
    expect(destinationRequests).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
