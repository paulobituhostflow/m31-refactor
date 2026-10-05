import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? discover(join(dir, e.name))
      : /\.test\.(mjs|cjs|js)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}
const files = [...discover("tests"), ...discover("src")];
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
