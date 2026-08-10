import { runCli } from "./cli";

void runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
