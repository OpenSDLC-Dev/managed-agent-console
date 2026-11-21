import { spawnSync } from "node:child_process";
import { consoleBuildVersion } from "./build-version.mjs";

const stamp = consoleBuildVersion();
const result = spawnSync(
  "docker",
  [
    "build",
    ...process.argv.slice(2),
    ...(stamp ? ["--build-arg", `CONSOLE_BUILD_VERSION=${stamp}`] : []),
    ".",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
