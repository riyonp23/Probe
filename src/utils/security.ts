// probe — AES-256-GCM encryption for API key storage at rest

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
// legacy fallback — only used when decrypting credentials stored before we
// switched to per-install random salts. Never used for new writes.
const LEGACY_SCRYPT_SALT = "probe-v1-credential-salt";

export interface EncryptedBlob {
  iv: string;
  authTag: string;
  encrypted: string;
  salt: string;
}

export interface StoredCredentials {
  providerId: string;
  iv: string;
  authTag: string;
  encrypted: string;
  salt?: string;
}

export interface LoadedCredentials {
  providerId: string;
  apiKey: string;
}

function deriveKey(salt: Buffer | string): Buffer {
  // machine-bound password — encrypted file only decrypts on same host/user
  const password = `${os.hostname()}::${os.userInfo().username}::${os.homedir()}`;
  return crypto.scryptSync(password, salt, KEY_LENGTH);
}

export function encryptKey(plaintext: string): EncryptedBlob {
  // per-install random salt — stored alongside ciphertext; means the derived
  // key is unique per install even if two machines share the same fingerprint
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    encrypted: encrypted.toString("hex"),
    salt: salt.toString("hex"),
  };
}

export function decryptKey(blob: EncryptedBlob): string {
  // new blobs carry a random salt; legacy blobs fall back to the fixed salt
  const saltBuf = blob.salt
    ? Buffer.from(blob.salt, "hex")
    : Buffer.from(LEGACY_SCRYPT_SALT, "utf8");
  const key = deriveKey(saltBuf);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(blob.iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(blob.authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.encrypted, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function credentialsDir(): string {
  return path.join(os.homedir(), ".probe");
}

export function credentialsPath(): string {
  return path.join(credentialsDir(), "credentials.json");
}

export function storeCredentials(providerId: string, key: string): void {
  const dir = credentialsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const blob = encryptKey(key);
  const payload: StoredCredentials = { providerId, ...blob };
  const file = credentialsPath();
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod may silently no-op on Windows — that's acceptable
  }
}

export function loadCredentials(): LoadedCredentials | null {
  const file = credentialsPath();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (!parsed.providerId || !parsed.iv || !parsed.authTag || !parsed.encrypted) {
      return null;
    }
    const apiKey = decryptKey({
      iv: parsed.iv,
      authTag: parsed.authTag,
      encrypted: parsed.encrypted,
      salt: parsed.salt ?? "",
    });
    return { providerId: parsed.providerId, apiKey };
  } catch {
    return null;
  }
}

export function deleteCredentials(): boolean {
  const file = credentialsPath();
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function hasStoredCredentials(): boolean {
  return fs.existsSync(credentialsPath());
}

export function maskKey(key: string): string {
  if (!key || key.length <= 11) return "***";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

export function redactKey(msg: string, key: string): string {
  // strip the raw key from any string (e.g., an error payload) before display
  if (!msg || !key) return msg;
  return msg.split(key).join(maskKey(key));
}
