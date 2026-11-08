import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_ALGORITHM = "aes-256-gcm";
const STATE_COOKIE = "kiln_slack_oauth_state";

export type SlackOAuthPurpose = "install" | "link";

type SlackOAuthState = {
  purpose: SlackOAuthPurpose;
  userId: string;
  expiresAt: number;
  nonce: string;
};

function getStateSecret(): string {
  const secret = process.env.SLACK_OAUTH_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SLACK_OAUTH_STATE_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function getTokenEncryptionKey(): Buffer {
  const encoded = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("SLACK_TOKEN_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("SLACK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function signState(state: string): string {
  return createHmac("sha256", getStateSecret()).update(state).digest("base64url");
}

export function createSlackOAuthState(purpose: SlackOAuthPurpose, userId: string): string {
  const payload: SlackOAuthState = {
    purpose,
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(24).toString("base64url"),
  };
  const state = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${state}.${signState(state)}`;
}

export function verifySlackOAuthState(
  state: string,
  cookieState: string | undefined,
): SlackOAuthState | null {
  if (!cookieState || !safeEqual(state, cookieState)) return null;
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, signState(payload))) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("purpose" in parsed) ||
      (parsed.purpose !== "install" && parsed.purpose !== "link") ||
      !("userId" in parsed) ||
      typeof parsed.userId !== "string" ||
      !("expiresAt" in parsed) ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Date.now() ||
      !("nonce" in parsed) ||
      typeof parsed.nonce !== "string"
    ) {
      return null;
    }
    return parsed as SlackOAuthState;
  } catch {
    return null;
  }
}

export function encryptSlackToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(TOKEN_ALGORITHM, getTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSlackToken(encrypted: string): string {
  const [ivValue, tagValue, ciphertextValue, extra] = encrypted.split(".");
  if (!ivValue || !tagValue || !ciphertextValue || extra) {
    throw new Error("Encrypted Slack token has an invalid format.");
  }
  const decipher = createDecipheriv(
    TOKEN_ALGORITHM,
    getTokenEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getSlackOAuthStateCookieName(): string {
  return STATE_COOKIE;
}

export function verifySlackRequestSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (Math.abs(nowSeconds - timestampSeconds) > 60 * 5) return false;

  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  return safeEqual(signature, expected);
}
