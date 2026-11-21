import { spawnSync } from "node:child_process";
import { developmentBuild } from "./build-version.mjs";

const build = developmentBuild();
const result = spawnSync(
  "docker",
  [
    "build",
    ...process.argv.slice(2),
    ...(build
      ? [
          "--build-arg",
          `CONSOLE_BUILD_VERSION=${build.version}`,
          "--build-arg",
          `VERSION=${build.version}`,
          "--build-arg",
          `REVISION=${build.revision}`,
        ]
      : []),
    ".",
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
