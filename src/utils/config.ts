// probe — .env loading, credentials resolution, defaults

import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { DEFAULT_EXCLUSIONS, SUPPORTED_EXTENSIONS, ProbeConfig } from "./types";
import { loadCredentials } from "./security";
import { detectProvider } from "../pipeline/provider";
import { getProviderInfo } from "../pipeline/providers/types";

const loadedEnvPaths = new Set<string>();

function loadEnvFromPath(envPath: string): void {
  if (loadedEnvPaths.has(envPath)) return;
  loadedEnvPaths.add(envPath);
  if (!fs.existsSync(envPath)) return;
  // dotenv default is override: false, so existing env vars win
  dotenv.config({ path: envPath });
}

function loadEnvChain(repoPath: string): void {
  // precedence: process.env (already set) > repo .env > probe project .env
  loadEnvFromPath(path.join(repoPath, ".env"));
  loadEnvFromPath(path.join(process.cwd(), ".env"));
}

interface LoadConfigOptions {
  requireKeys?: boolean;
}

interface Resolved {
  providerId: string;
  apiKey: string;
}

function resolveFromEnv(): Resolved | null {
  // 1. PROBE_PROVIDER + PROBE_API_KEY — explicit modern env
  const probeProvider = process.env.PROBE_PROVIDER?.trim();
  const probeKey = process.env.PROBE_API_KEY?.trim();
  if (probeKey && probeProvider) {
    return { providerId: probeProvider, apiKey: probeKey };
  }
  if (probeKey) {
    const detected = detectProvider(probeKey);
    if (detected) return { providerId: detected, apiKey: probeKey };
  }
  // 2. legacy ANTHROPIC_API_KEY — backward compat, auto-selects anthropic
  const legacy = process.env.ANTHROPIC_API_KEY?.trim();
  if (legacy) return { providerId: "anthropic", apiKey: legacy };
  return null;
}

export function loadConfig(
  repoPath: string,
  options: LoadConfigOptions = {}
): ProbeConfig {
  const { requireKeys = true } = options;
  const absoluteRepoPath = path.resolve(repoPath);

  if (!fs.existsSync(absoluteRepoPath)) {
    throw new Error(`Repo path does not exist: ${absoluteRepoPath}`);
  }
  if (!fs.statSync(absoluteRepoPath).isDirectory()) {
    throw new Error(`Repo path is not a directory: ${absoluteRepoPath}`);
  }

  // merge .env files into process.env (non-overriding), then resolve
  loadEnvChain(absoluteRepoPath);

  let resolved = resolveFromEnv();
  if (!resolved) {
    const stored = loadCredentials();
    if (stored) resolved = { providerId: stored.providerId, apiKey: stored.apiKey };
  }

  if (requireKeys && !resolved) {
    throw new Error(
      "No API key found. Run `probe setup` to configure — Gemini is free, no credit card needed."
    );
  }

  // surface a clear error if a stored provider id is unrecognized
  if (resolved && !getProviderInfo(resolved.providerId)) {
    throw new Error(
      `Configured provider "${resolved.providerId}" is not recognized. ` +
        `Run \`probe setup\` to reconfigure.`
    );
  }

  return {
    repoPath: absoluteRepoPath,
    providerId: resolved?.providerId ?? "",
    apiKey: resolved?.apiKey ?? "",
    exclusions: [...DEFAULT_EXCLUSIONS],
    languages: [...SUPPORTED_EXTENSIONS],
  };
}

export function probeDir(repoPath: string): string {
  return path.join(repoPath, ".probe");
}

export function hashRepoPath(repoPath: string): string {
  // simple non-crypto hash to name collections deterministically per repo
  let hash = 0;
  const str = path.resolve(repoPath);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export function collectionName(repoPath: string): string {
  return `probe-${hashRepoPath(repoPath)}`;
}
