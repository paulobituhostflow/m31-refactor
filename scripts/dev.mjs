import { spawn } from "node:child_process";
const children = [
  spawn("npm", ["run", "dev:api"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev"], { stdio: "inherit" }),
];
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
for (const child of children)
  child.on("exit", (code) => {
    if (code) {
      for (const other of children) if (other !== child) other.kill();
      process.exitCode = code;
    }
  });
