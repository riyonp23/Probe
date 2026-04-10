// probe — "probe setup" interactive provider + API key configuration

import { credentialsPath, deleteCredentials, hasStoredCredentials, loadCredentials, maskKey, storeCredentials } from "../utils/security";
import { dimMessage, errorMessage, infoMessage, successMessage, warnMessage } from "../utils/formatter";
import { readLine, readLineHidden } from "../utils/prompts";
import { PROVIDERS, ProviderInfo, getProviderInfo } from "../pipeline/providers/types";
import { BOLD, BRAND_COLOR, DIM, SUCCESS, printDivider, printHeader, printLogo } from "../utils/theme";

export interface SetupOptions {
  delete?: boolean;
  status?: boolean;
}

function printStatus(): void {
  printHeader("Setup");
  const stored = loadCredentials();
  if (stored) {
    const info = getProviderInfo(stored.providerId);
    const name = info ? info.name : stored.providerId;
    successMessage(`${name} — key ${maskKey(stored.apiKey)}`);
    dimMessage(`Stored at ${credentialsPath()}`);
  } else if (hasStoredCredentials()) {
    warnMessage("Found a credentials file but can't decrypt it on this machine.");
    dimMessage(`Location: ${credentialsPath()}`);
  } else {
    warnMessage("You haven't set up a provider yet.");
    dimMessage(`Expected at ${credentialsPath()}`);
    dimMessage("Run `probe setup` — Gemini is free and takes 30 seconds.");
  }
}

async function runDelete(): Promise<void> {
  printHeader("Setup");
  const stored = loadCredentials();
  if (!stored && !hasStoredCredentials()) {
    infoMessage("Nothing to delete — no credentials are stored.");
    return;
  }
  const name = stored ? getProviderInfo(stored.providerId)?.name ?? stored.providerId : "unknown";
  const answer = await readLine(`Delete the stored ${name} credentials? (y/N): `);
  if (answer.toLowerCase() !== "y") {
    infoMessage("Cancelled — credentials left alone.");
    return;
  }
  if (deleteCredentials()) successMessage(`${name} credentials deleted.`);
  else warnMessage("No credentials file to delete.");
}

const PROVIDER_LABELS = [
  "FREE — no credit card needed",
  "Paid",
  "Paid",
  "Free tier",
  "Paid",
];
const PROVIDER_VENDORS = ["Google", "Anthropic", "OpenAI", "Groq", "Mistral AI"];

function printProviderMenu(): void {
  console.log(BOLD("Pick an AI provider:"));
  PROVIDERS.forEach((p, i) => {
    const num = BRAND_COLOR(`${i + 1}.`);
    const name = BOLD(p.name.padEnd(9));
    const vendor = DIM(`(${PROVIDER_VENDORS[i].padEnd(12)})`);
    const label = p.free ? SUCCESS(PROVIDER_LABELS[i]) : DIM(PROVIDER_LABELS[i]);
    console.log(` ${num} ${name} ${vendor} ${label}`);
  });
  console.log("");
}

async function promptForProvider(): Promise<ProviderInfo> {
  printProviderMenu();
  const answer = await readLine("Your pick (1-5) [default: 1]: ");
  const choice = answer === "" ? 1 : parseInt(answer, 10);
  if (!Number.isFinite(choice) || choice < 1 || choice > PROVIDERS.length) {
    throw new Error(`"${answer}" isn't 1-5 — run \`probe setup\` again and try once more.`);
  }
  return PROVIDERS[choice - 1];
}

async function promptForKey(info: ProviderInfo): Promise<string> {
  console.log("");
  console.log(`Grab a key here: ${BRAND_COLOR.underline(info.keyHelpUrl)}`);
  if (info.id === "gemini") {
    dimMessage("Sign in with Google — no credit card, no forms, just a key.");
  } else if (info.id === "groq") {
    dimMessage("Groq has a free tier that's plenty for trying things out.");
  }
  console.log("");
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = await readLineHidden("Paste your API key: ");
    if (info.validateKeyFormat(key)) return key;
    const hint = info.keyPrefix ? ` Should start with '${info.keyPrefix}'.` : "";
    errorMessage(`That doesn't look like a valid ${info.name} key — needs at least 20 chars.${hint}`);
  }
  throw new Error("Three strikes — run `probe setup` again when you're ready.");
}

async function runInteractiveSetup(): Promise<void> {
  printLogo();
  printHeader("Setup");
  dimMessage("Let's get you set up.");
  console.log("");
  if (hasStoredCredentials()) {
    const existing = loadCredentials();
    if (existing) {
      const name = getProviderInfo(existing.providerId)?.name ?? existing.providerId;
      infoMessage(`Already set up: ${name} — key ${maskKey(existing.apiKey)}`);
    } else {
      warnMessage("Found a credentials file but can't decrypt it here.");
    }
    const answer = await readLine("Replace it? (y/N): ");
    if (answer.toLowerCase() !== "y") {
      infoMessage("Leaving the existing setup in place.");
      return;
    }
  }
  const info = await promptForProvider();
  const key = await promptForKey(info);
  storeCredentials(info.id, key);
  console.log("");
  printDivider();
  successMessage(`${info.name} key saved (encrypted)`);
  dimMessage(`  ${credentialsPath()}`);
  const perms =
    process.platform === "win32"
      ? "  On Windows, per-user home ACLs protect this file (no POSIX bits)."
      : "  Locked down to owner-only (600)";
  dimMessage(perms);
  printDivider();
  infoMessage("Done. Try: probe index ./your-repo");
}

export async function runSetupCommand(options: SetupOptions = {}): Promise<void> {
  if (options.status) return printStatus();
  if (options.delete) return runDelete();
  await runInteractiveSetup();
}
