// probe — terminal brand theme (colors, logo, layout helpers)

import chalk from "chalk";
import { Command } from "commander";

// brand palette — cyan/teal is the Probe accent, plays nice on dark + light terms
export const BRAND_COLOR = chalk.cyan;
export const BRAND_DIM = chalk.dim.cyan;
export const SUCCESS = chalk.green;
export const ERROR = chalk.red;
export const WARNING = chalk.yellow;
export const DIM = chalk.dim;
export const BOLD = chalk.bold;
export const HIGHLIGHT = chalk.bold.cyan;

// ora accepts a narrow string union for `color` — lock this in as a literal
export const SPINNER_COLOR = "cyan" as const;

const LOGO_INNER = 35;

export function getLogo(): string {
  const bar = "═".repeat(LOGO_INNER);
  const top = BRAND_DIM(`╔${bar}╗`);
  const bottom = BRAND_DIM(`╚${bar}╝`);

  // plain-text length is what matters for alignment — both ◈ and — are 1 col
  const plain = "◈ PROBE — A Codebase Pilot";
  const total = LOGO_INNER - plain.length;
  const left = " ".repeat(Math.floor(total / 2));
  const right = " ".repeat(total - Math.floor(total / 2));

  const content =
    BRAND_COLOR("◈") + " " + HIGHLIGHT("PROBE") + DIM(" — A Codebase Pilot");
  const middle = BRAND_DIM("║") + left + content + right + BRAND_DIM("║");

  return `${top}\n${middle}\n${bottom}`;
}

export function printLogo(): void {
  console.log("");
  console.log(getLogo());
  console.log("");
}

export function printHeader(title: string): void {
  console.log("");
  console.log(`${BRAND_COLOR("◈")} ${BOLD(title)}`);
  console.log("");
}

export function printDivider(): void {
  const width = Math.min(process.stdout.columns || 60, 60);
  console.log(BRAND_DIM("─".repeat(width)));
}

export function printMetric(label: string, value: string | number): void {
  console.log(`  ${DIM(label + ":")} ${HIGHLIGHT(String(value))}`);
}

export function printTip(text: string): void {
  console.log(`${BRAND_COLOR("→")} ${DIM(text)}`);
}

export function printKeyValue(key: string, value: string): void {
  console.log(`  ${DIM(key + ":")} ${BRAND_COLOR(value)}`);
}

// brand every commander help screen with the logo and cyan command names
export function applyThemedHelp(cmd: Command): void {
  cmd.addHelpText("before", `\n${getLogo()}\n`);
  cmd.configureHelp({
    subcommandTerm: (c) => `${BRAND_COLOR(c.name())} ${c.usage()}`.trimEnd(),
    commandUsage: (c) => `${BRAND_COLOR(c.name())} ${c.usage()}`.trimEnd(),
  });
}

export function setupNudgeText(): string {
  const line1 = WARNING("⚠ You haven't set up a provider yet.");
  const line2 = `  Run ${BOLD(BRAND_COLOR("probe setup"))} — Gemini is free and takes 30 seconds.`;
  return `${line1}\n${line2}`;
}

export function printSetupNudge(): void {
  console.log("");
  console.log(setupNudgeText());
  console.log("");
}

function wrapText(text: string, width: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length + w.length + 1 > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

export function printQuickstart(description: string, hasCredentials: boolean): void {
  console.log("");
  console.log(getLogo());
  console.log("");
  console.log(wrapText(description, 76));
  console.log("");

  console.log(`${BRAND_COLOR("◈")} ${BOLD("Quick Start")}`);
  console.log("");
  console.log(`  ${BRAND_COLOR("1.")} ${BOLD("probe setup")}              ${DIM("Set up your AI provider (Gemini is free, takes 30 seconds)")}`);
  console.log(`  ${BRAND_COLOR("2.")} ${BOLD("probe index <path>")}       ${DIM("Point Probe at a repo — local path or GitHub link")}`);
  console.log(`  ${BRAND_COLOR("3.")} ${BOLD('probe ask "question"')}     ${DIM("Ask away")}`);
  console.log("");

  console.log(`${BRAND_COLOR("◈")} ${BOLD("Commands")}`);
  console.log("");
  console.log(`  ${BOLD("probe index <path>")}           ${DIM("Index a local folder or GitHub repo")}`);
  console.log(`    ${BRAND_COLOR("--force")}                    ${DIM("Rebuild without the confirmation prompt")}`);
  console.log(`    ${BRAND_COLOR("--exclude <patterns>")}       ${DIM("Extra glob patterns to skip")}`);
  console.log(`    ${BRAND_COLOR("--languages <exts>")}         ${DIM("Only these extensions")}`);
  console.log(`  ${BOLD("probe ask <question>")}         ${DIM("Ask something about the code")}`);
  console.log(`    ${BRAND_COLOR("--repo <path>")}              ${DIM("Which repo to query (defaults to last indexed)")}`);
  console.log(`    ${BRAND_COLOR("--top-k <n>")}                ${DIM("How many chunks to pull (default: 5)")}`);
  console.log(`    ${BRAND_COLOR("--verbose")}                  ${DIM("Show the chunks that got pulled")}`);
  console.log(`    ${BRAND_COLOR("--max-tokens <n>")}           ${DIM("Max response length (default: 4096)")}`);
  console.log(`  ${BOLD("probe setup")}                  ${DIM("Pick your AI provider and save your API key")}`);
  console.log(`    ${BRAND_COLOR("--status")}                   ${DIM("See what's currently configured")}`);
  console.log(`    ${BRAND_COLOR("--delete")}                   ${DIM("Remove stored credentials")}`);
  console.log(`  ${BOLD("probe status [path]")}          ${DIM("Check what's been indexed")}`);
  console.log(`  ${BOLD("probe specs")}                  ${DIM("View Probe's technical architecture")}`);
  console.log("");

  console.log(`${BRAND_COLOR("◈")} ${BOLD("Examples")}`);
  console.log("");
  console.log(`  ${DIM("probe index ./my-project")}`);
  console.log(`  ${DIM("probe index expressjs/express")}`);
  console.log(`  ${DIM('probe ask "how does auth work in this project?"')}`);
  console.log(`  ${DIM('probe ask "where are the API routes defined?" --verbose')}`);
  console.log(`  ${DIM('probe ask "walk me through the error handling"')}`);
  console.log("");

  if (!hasCredentials) printSetupNudge();
}
