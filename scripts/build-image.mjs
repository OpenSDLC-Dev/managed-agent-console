import { spawnSync } from "node:child_process";
import { consoleBuildVersion } from "./build-version.mjs";

const stamp = consoleBuildVersion();
if (!stamp)
  throw new Error(
    "The image build needs a checkout with a stable release tag.",
  );
const result = spawnSync(
  "docker",
  [
    "build",
    "--build-arg",
    `CONSOLE_BUILD_VERSION=${stamp}`,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
