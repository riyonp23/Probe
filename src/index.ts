#!/usr/bin/env node
// probe — CLI entry point, Commander.js setup

import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { IndexOptions, runIndexCommand } from "./commands/index-cmd";
import { AskOptions, runAskCommand } from "./commands/ask-cmd";
import { runStatusCommand } from "./commands/status-cmd";
import { runSetupCommand, SetupOptions } from "./commands/setup-cmd";
import { runSpecsCommand } from "./commands/specs-cmd";
import { handleFatalError } from "./utils/formatter";
import { BOLD, BRAND_COLOR, applyThemedHelp, printQuickstart, printSetupNudge, setupNudgeText } from "./utils/theme";
import { TOP_K } from "./utils/types";
import { loadCredentials } from "./utils/security";

const PROGRAM_DESCRIPTION =
  "Probe lets you index any codebase and ask questions about it in plain English. It breaks code into smart chunks that respect function and class boundaries, runs embeddings locally (no API needed for that part), and pipes the relevant code to an AI that answers with exact file and line references.";

function readPackageVersion(): string {
  // package.json sits one level above dist/ or src/ — __dirname + ".."
  const raw = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

function parseCsv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

const program = new Command();
const versionString = `${BRAND_COLOR("Probe")} ${BOLD("v" + readPackageVersion())}`;

program
  .name("probe")
  .version(versionString, "-V, --version", "Print the probe version")
  .description(PROGRAM_DESCRIPTION);

program
  .command("index")
  .description("Index a local folder or GitHub repo")
  .argument("<path>", "Local path or GitHub URL (e.g. expressjs/express)")
  .option("-f, --force", "Rebuild without the confirmation prompt", false)
  .option("--exclude <patterns>", "Extra glob patterns to skip", parseCsv)
  .option("--languages <extensions>", "Only these extensions (e.g. .py,.ts)", parseCsv)
  .action(
    async (repoPath: string, opts: { force: boolean; exclude?: string[]; languages?: string[] }) => {
      try {
        const options: IndexOptions = {
          force: opts.force,
          exclude: opts.exclude,
          languages: opts.languages,
        };
        await runIndexCommand(repoPath, options);
      } catch (err) {
        handleFatalError(err);
      }
    }
  );

program
  .command("ask")
  .description("Ask a question about an indexed codebase")
  .argument("<question>", "What you want to know about the code")
  .option("-r, --repo <path>", "Which repo to query (defaults to the last one you indexed)")
  .option("-k, --top-k <n>", "How many chunks to pull", (v) => parseInt(v, 10), TOP_K)
  .option("--max-tokens <n>", "Max tokens in the response", (v) => parseInt(v, 10), 4096)
  .option("-v, --verbose", "Show the chunks that got pulled", false)
  .action(
    async (
      question: string,
      opts: { repo?: string; topK: number; verbose: boolean; maxTokens: number }
    ) => {
      try {
        const options: AskOptions = {
          repo: opts.repo,
          topK: opts.topK,
          verbose: opts.verbose,
          maxTokens: opts.maxTokens,
        };
        await runAskCommand(question, options);
      } catch (err) {
        handleFatalError(err);
      }
    }
  );

program
  .command("setup")
  .description("Set up your AI provider and API key")
  .option("--delete", "Remove stored credentials", false)
  .option("--status", "See what's currently configured", false)
  .action(async (opts: { delete: boolean; status: boolean }) => {
    try {
      const options: SetupOptions = { delete: opts.delete, status: opts.status };
      await runSetupCommand(options);
    } catch (err) {
      handleFatalError(err);
    }
  });

program
  .command("status")
  .description("Check what's been indexed in a repo")
  .argument("[path]", "Repo path or GitHub shorthand", process.cwd())
  .action(async (repoPath: string) => {
    try {
      await runStatusCommand({ path: repoPath });
    } catch (err) {
      handleFatalError(err);
    }
  });

program
  .command("specs")
  .description("Show what Probe is built with")
  .action(async () => {
    try {
      await runSpecsCommand();
    } catch (err) {
      handleFatalError(err);
    }
  });

applyThemedHelp(program);
program.commands.forEach(applyThemedHelp);

// bare `probe` gets a friendly quickstart; otherwise commander handles everything as normal
const cliArgs = process.argv.slice(2);
const credsPresent = ((): boolean => {
  try { return loadCredentials() !== null; } catch { return false; }
})();

if (cliArgs.length === 0) {
  printQuickstart(PROGRAM_DESCRIPTION, credsPresent);
  process.exit(0);
}

const askingForHelp = cliArgs.includes("--help") || cliArgs.includes("-h");
const askingForVersion = cliArgs.includes("--version") || cliArgs.includes("-V");
if (!credsPresent && askingForHelp) {
  program.addHelpText("after", `\n${setupNudgeText()}\n`);
}
if (!credsPresent && !askingForHelp && !askingForVersion && cliArgs[0] !== "setup") {
  printSetupNudge();
}

program.parseAsync(process.argv).catch(handleFatalError);
