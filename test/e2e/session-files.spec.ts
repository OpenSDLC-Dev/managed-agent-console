import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

// A session's own files (platform #578): the copy each file mount mints and
// the outputs harvested from its sandbox, listed only under its scope_id.
const RESEARCH = "sesn_research0000000000001";
const UPLOAD = "file_notes0000000000001";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("Resources lists the session's own files with the reference's request, offering download only for outputs", async ({
  page,
}) => {
  await signIn(page);
  const listed = page.waitForRequest((request) =>
    request.url().includes(`/api/platform/v1/files?scope_id=${RESEARCH}`),
  );
  await page.goto(`/sessions/${RESEARCH}?inspector=resources`);
  const request = await listed;
  // console-141 ui-network idx 243: the same query and beta header.
  expect(new URL(request.url()).searchParams.get("limit")).toBe("1000");
  expect(request.headers()["anthropic-beta"]).toBe("managed-agents-2026-04-01");

  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-files", "ready");
  await expect(panel).toHaveAttribute("data-session-file-count", "2");
  // The mount's row is its copy, sized from the list.
  await expect(
    panel.getByText(`/mnt/session/uploads/${UPLOAD}`, { exact: true }),
  ).toBeVisible();
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
  await expect(
    panel.locator('[data-session-file-id="file_researchcopy0000001"]'),
  ).toHaveCount(0);
  // The harvested output follows, and is the one download offered.
  const output = panel.locator(
    '[data-session-file-id="file_output000000000001"]',
  );
  await expect(output).toHaveAttribute("data-downloadable", "true");
  await expect(output).toContainText("summary.xlsx");
  await expect(output.locator('[data-size-bytes="120400"]')).toBeVisible();
  // Named with the id, since two outputs can share a filename.
  const download = output.getByRole("link", {
    name: "Download summary.xlsx (file_output000000000001)",
  });
  await expect(download).toHaveAttribute(
    "href",
    "/api/platform/v1/files/file_output000000000001/content",
  );
  await expect(download).toHaveAttribute("download", "summary.xlsx");
  await expect(panel.getByRole("link", { name: /^Download/ })).toHaveCount(1);
  // Followed, the link saves the output's bytes through the BFF.
  const saved = page.waitForEvent("download");
  await download.click();
  const file = await saved;
  expect(file.suggestedFilename()).toBe("summary.xlsx");
  expect(statSync(await file.path()).size).toBe(120400);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Session inspector"]')
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("a deployment fire mints its session's copy, shown in that session's Resources", async ({
  page,
}) => {
  await signIn(page);
  const run = (await (
    await page.request.post(
      "/api/platform/v1/deployments/depl_weekresearch00000001/run",
      { data: {} },
    )
  ).json()) as { session_id: string };
  await page.goto(`/sessions/${run.session_id}?inspector=resources`);
  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-file-count", "1");
  // The deployment names the upload; the fired session mounts its own copy
  // at the path that still names the upload.
  await expect(
    panel.getByText(`/mnt/session/uploads/${UPLOAD}`, { exact: true }),
  ).toBeVisible();
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
  await expect(panel.getByText(UPLOAD, { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: /^Download/ })).toHaveCount(0);
});

test("the rubric picker offers uploads and the session's own files, labelled apart", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/sessions/${RESEARCH}`);
  await page.getByTestId("outcome-evaluation").waitFor();
  await page.getByRole("button", { name: "Define outcome" }).click();
  const dialog = page.getByRole("dialog", { name: "Define outcome" });
  await dialog.getByLabel("Rubric type").click();
  await page.getByRole("option", { name: "File" }).click();
  await expect(
    dialog.locator('[data-file-options-state="ready"]'),
  ).toBeVisible();
  const option = (id: string) =>
    dialog.locator(`datalist#outcome-rubric-files option[value="${id}"]`);
  await expect(option(UPLOAD)).toHaveAttribute("data-file-origin", "upload");
  await expect(option("file_researchcopy0000001")).toHaveAttribute(
    "data-file-origin",
    "session file",
  );
  await expect(option("file_output000000000001")).toHaveAttribute(
    "data-file-origin",
    "session file",
  );

  // A rubric naming the session's copy is accepted, as on the platform.
  await dialog.getByLabel("Description").fill("Summarize the notes");
  await dialog.getByLabel("Rubric file ID").fill("file_researchcopy0000001");
  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/sessions/${RESEARCH}/events`),
  );
  await dialog.getByRole("button", { name: "Define outcome" }).click();
  expect((await posted).status()).toBe(200);
});

test("a copy's content is refused as not downloadable, as the platform refuses an upload's", async ({
  page,
}) => {
  await signIn(page);
  const copy = await page.request.get(
    "/api/platform/v1/files/file_researchcopy0000001/content",
  );
  expect(copy.status()).toBe(400);
  expect((await copy.json()).error).toEqual({
    type: "invalid_request_error",
    message:
      "File `file_researchcopy0000001` is not downloadable. Only files generated by a tool (for example, the code execution tool) can be downloaded.",
    details: { error_code: "file_not_downloadable" },
  });
  const missing = await page.request.get(
    "/api/platform/v1/files/file_absent000000000001/content",
  );
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.message).toBe(
    "file file_absent000000000001 not found",
  );
});

test("an output is deleted from its session's Resources after confirming", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/sessions/${RESEARCH}?inspector=resources`);
  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-file-count", "2");
  const output = panel.locator(
    '[data-session-file-id="file_output000000000001"]',
  );
  await output
    .getByRole("button", {
      name: "Delete summary.xlsx (file_output000000000001)",
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-delete-kind]")).toHaveAttribute(
    "data-delete-kind",
    "output",
  );
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === "DELETE" &&
      response.url().endsWith("/v1/files/file_output000000000001"),
  );
  await dialog
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  expect((await deleted).status()).toBe(200);
  await expect(panel).toHaveAttribute("data-session-file-count", "1");
  await expect(output).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  // The row took its Delete with it; no row follows, so focus goes to the
  // filter rather than the page.
  await expect(panel.getByLabel("Filter resources")).toBeFocused();
  // The mounted copy stays, its row the resource's.
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
});

test.describe("a mount whose source is gone is refused as the platform refuses it", () => {
  const mount = { type: "file", file_id: UPLOAD };
  const goneBy = {
    deleted: (page: Page) =>
      page.request.delete(`/api/platform/v1/files/${UPLOAD}`),
    expired: (page: Page) =>
      page.request.post(`http://127.0.0.1:18080/__expire-file?id=${UPLOAD}`),
  };
  for (const [how, gone] of Object.entries(goneBy)) {
    test(`session create, resources add and a deployment fire, the source ${how}`, async ({
      page,
    }) => {
      await signIn(page);
      expect((await gone(page)).ok()).toBe(true);
      const list = async (path: string) =>
        (
          (await (await page.request.get(`/api/platform/v1/${path}`)).json())
            .data as { id: string }[]
        ).map((row) => row.id);
      const gated = "sesn_gatedbash00000000001";
      const sessionsBefore = await list("sessions?limit=100");

      // sessions.go requestWording: the reference's sentence.
      const created = await page.request.post("/api/platform/v1/sessions", {
        data: {
          agent: "agent_researcher00000000001",
          environment_id: "env_egress000000000000001",
          resources: [mount],
        },
      });
      expect(created.status()).toBe(404);
      expect((await created.json()).error).toEqual({
        type: "not_found_error",
        message: `One or more files not found. Check that each \`file_id\` exists and is accessible: ${UPLOAD}`,
      });

      // sessionresources.go errFileGone, in the platform's own words.
      const added = await page.request.post(
        `/api/platform/v1/sessions/${gated}/resources`,
        { data: mount },
      );
      expect(added.status()).toBe(404);
      expect((await added.json()).error).toEqual({
        type: "not_found_error",
        message: `file ${UPLOAD} not found`,
      });

      // deploymentruns.go runDeployment: a failed run, not a session.
      const fired = await page.request.post(
        "/api/platform/v1/deployments/depl_weekresearch00000001/run",
        { data: {} },
      );
      expect(fired.status()).toBe(200);
      const run = await fired.json();
      expect(run.session_id).toBeNull();
      expect(run.error).toEqual({
        type: "file_not_found_error",
        message: `file ${UPLOAD} not found`,
      });
      const runs = (
        await (
          await page.request.get(
            "/api/platform/v1/deployment_runs?deployment_id=depl_weekresearch00000001",
          )
        ).json()
      ).data;
      expect(runs[0]).toEqual(run);

      // Nothing was made along the way: no session, and no copy.
      expect(await list("sessions?limit=100")).toEqual(sessionsBefore);
      expect(await list(`files?scope_id=${gated}`)).toEqual([]);
    });
  }
});

test("a deployment fire is refused by its first resource gone, in its order", async ({
  page,
}) => {
  await signIn(page);
  const store = "memstore_projectnotes000001";
  const memory = { type: "memory_store", memory_store_id: store };
  const deploy = async (name: string, resources: object[]) => {
    const created = await page.request.post("/api/platform/v1/deployments", {
      data: {
        name,
        agent: { type: "agent", id: "agent_taskrunner0000000001", version: 1 },
        environment_id: "env_egress000000000000001",
        initial_events: [{ type: "user.message", content: "Fixture only" }],
        resources,
      },
    });
    expect(created.ok()).toBe(true);
    return ((await created.json()) as { id: string }).id;
  };
  const fire = async (id: string) => {
    const fired = await page.request.post(
      `/api/platform/v1/deployments/${id}/run`,
      { data: {} },
    );
    expect(fired.status()).toBe(200);
    const run = await fired.json();
    expect(run.session_id).toBeNull();
    return run.error;
  };
  const storeFirst = await deploy("Store first", [
    memory,
    { type: "file", file_id: UPLOAD },
  ]);
  const fileFirst = await deploy("File first", [
    { type: "file", file_id: UPLOAD },
    memory,
  ]);

  // Both gone: each fire answers with the resource it reaches first
  // (materializeResourceInputs), the store in runWording's sentence.
  expect(
    (
      await page.request.post(`/api/platform/v1/memory_stores/${store}/archive`)
    ).ok(),
  ).toBe(true);
  expect(
    (await page.request.delete(`/api/platform/v1/files/${UPLOAD}`)).ok(),
  ).toBe(true);
  expect(await fire(storeFirst)).toEqual({
    type: "memory_store_archived_error",
    message:
      "session creation rejected: a referenced memory store is archived; check deployment resources",
  });
  expect(await fire(fileFirst)).toEqual({
    type: "file_not_found_error",
    message: `file ${UPLOAD} not found`,
  });
  // A store deleted outright is a resource not found.
  expect(
    (await page.request.delete(`/api/platform/v1/memory_stores/${store}`)).ok(),
  ).toBe(true);
  expect(await fire(storeFirst)).toEqual({
    type: "session_resource_not_found_error",
    message:
      "session creation rejected: a referenced resource was not found; check deployment configuration",
  });
});

test("resources add judges the file id, then the agent's read tool, before minting a copy", async ({
  page,
}) => {
  await signIn(page);
  const add = (session: string, data: object) =>
    page.request.post(`/api/platform/v1/sessions/${session}/resources`, {
      data,
    });
  const refusal = async (
    response: Awaited<ReturnType<typeof add>>,
  ): Promise<[number, string]> => [
    response.status(),
    (await response.json()).error.message,
  ];
  const gated = "sesn_gatedbash00000000001";

  // parseFileResource: the file id before any mount path is built.
  expect(await refusal(await add(gated, { type: "file" }))).toEqual([
    400,
    "file_id is required",
  ]);
  expect(
    await refusal(await add(gated, { type: "file", file_id: "notes.md" })),
  ).toEqual([400, "file_id must be a valid file id"]);
  expect(
    await refusal(
      await add(gated, { type: "file", file_id: UPLOAD, path: "/x" }),
    ),
  ).toEqual([400, 'Failed to parse request body: unknown field "path"']);

  // requireReadTool: an agent whose toolset leaves read off is refused in
  // the reference's words, and nothing is minted.
  const session = async (tools: object[]) => {
    const agent = await page.request.post("/api/platform/v1/agents", {
      data: { name: "Bash only", model: "claude-sonnet-4-8", tools },
    });
    const created = await page.request.post("/api/platform/v1/sessions", {
      data: {
        agent: ((await agent.json()) as { id: string }).id,
        environment_id: "env_egress000000000000001",
      },
    });
    return ((await created.json()) as { id: string }).id;
  };
  const bashOnly = await session([
    {
      type: "agent_toolset_20260401",
      default_config: { enabled: false },
      configs: [{ name: "bash", enabled: true }],
    },
  ]);
  expect(
    await refusal(await add(bashOnly, { type: "file", file_id: UPLOAD })),
  ).toEqual([
    400,
    "Missing required tool: file resources require the read tool to be usable (enabled and not always_deny) on the session's `agent_toolset`",
  ]);
  expect(
    (
      await (
        await page.request.get(`/api/platform/v1/files?scope_id=${bashOnly}`)
      ).json()
    ).data,
  ).toEqual([]);
  // Read enabled by its own config, the default off: the add goes through.
  const readOnly = await session([
    {
      type: "agent_toolset_20260401",
      default_config: { enabled: false },
      configs: [{ name: "read", enabled: true }],
    },
  ]);
  expect((await add(readOnly, { type: "file", file_id: UPLOAD })).ok()).toBe(
    true,
  );
});

test("a file's delete and a file rubric answer a missing or expired file in the platform's words", async ({
  page,
}) => {
  await signIn(page);
  // files.go deleteFile: checkFileID's words.
  const gone = await page.request.delete(
    "/api/platform/v1/files/file_absent000000000001",
  );
  expect(gone.status()).toBe(404);
  expect((await gone.json()).error).toEqual({
    type: "not_found_error",
    message: "file file_absent000000000001 not found",
  });

  // outcomes.go ValidateDefineOutcomes reads live rows only.
  expect(
    (
      await page.request.post(
        `http://127.0.0.1:18080/__expire-file?id=${UPLOAD}`,
      )
    ).ok(),
  ).toBe(true);
  const define = await page.request.post(
    `/api/platform/v1/sessions/sesn_gatedbash00000000001/events`,
    {
      data: {
        events: [
          {
            type: "user.define_outcome",
            description: "Summarize the notes",
            rubric: { type: "file", file_id: UPLOAD },
          },
        ],
      },
    },
  );
  expect(define.status()).toBe(400);
  expect((await define.json()).error.message).toBe(
    `rubric file ${UPLOAD} not found`,
  );
});
