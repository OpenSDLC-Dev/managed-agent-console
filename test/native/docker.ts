import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// SQL arrangement is limited to the original native container receipt. Never
// use this to issue acceptance keys: those must come from the browser form.
export function nativeDocker(args: string[]) {
  const receipt = JSON.parse(
    readFileSync(
      join(process.env.NATIVE_EVIDENCE_DIR!, "task6-native-receipt.json"),
      "utf8",
    ),
  );
  if (
    args[0] !== "exec" ||
    args[1] !== receipt.container ||
    !/^[a-f0-9]{64}$/.test(receipt.container)
  )
    throw new Error("Native SQL requires the original owned container ID");
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    SystemRoot: process.env.SystemRoot,
    NEXT_TELEMETRY_DISABLED: "1",
    TMPDIR: process.env.TMPDIR,
    ...Object.fromEntries(
      ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"]
        .filter((k) => process.env[k] !== undefined)
        .map((k) => [k, process.env[k]]),
    ),
  };
  if (env.DOCKER_CONFIG && !isAbsolute(env.DOCKER_CONFIG))
    throw new Error("Docker configuration must be absolute");
  const run = (argv: string[]) =>
    spawnSync("docker", argv, { env, encoding: "utf8", timeout: 30_000 });
  const metadata = (argv: string[]) => {
    const result = run(argv);
    if (result.status !== 0)
      throw new Error("Native Docker metadata preflight failed");
    return result.stdout.trim();
  };
  const endpoint =
    env.DOCKER_HOST && !env.DOCKER_CONTEXT
      ? env.DOCKER_HOST
      : metadata([
          "context",
          "inspect",
          metadata(["context", "show"]),
          "--format",
          "{{.Endpoints.docker.Host}}",
        ]);
  if (
    !endpoint.startsWith("unix://") ||
    endpoint !== receipt.dockerTarget.endpoint ||
    metadata([
      "ps",
      "--all",
      "--filter",
      "label=dev.opensdlc.managed-agent-platform.test-fixture",
      "--format",
      "{{.ID}}",
    ])
  )
    throw new Error("Native Docker fixture preflight refused");
  return run(args);
}
