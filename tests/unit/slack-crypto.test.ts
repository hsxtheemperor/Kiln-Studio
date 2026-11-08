// @vitest-environment node

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSlackOAuthState,
  decryptSlackToken,
  encryptSlackToken,
  verifySlackOAuthState,
  verifySlackRequestSignature,
} from "../../lib/slack/crypto";

describe("Slack cryptographic helpers", () => {
  beforeEach(() => {
    process.env.SLACK_OAUTH_STATE_SECRET = "test-state-secret-with-at-least-32-characters";
    process.env.SLACK_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("encrypts tokens and rejects tampering", () => {
    const encrypted = encryptSlackToken("xoxb-test-token");
    expect(encrypted).not.toContain("xoxb-test-token");
    expect(decryptSlackToken(encrypted)).toBe("xoxb-test-token");

    const [iv, tag, ciphertext] = encrypted.split(".");
    expect(() => decryptSlackToken(`${iv}.${tag}.${ciphertext.slice(0, -2)}AA`)).toThrow();
  });

  it("binds OAuth state to its cookie, purpose, and authenticated user", () => {
    const state = createSlackOAuthState("link", "user-1");
    expect(verifySlackOAuthState(state, state)).toMatchObject({
      purpose: "link",
      userId: "user-1",
    });
    expect(verifySlackOAuthState(state, "different-state")).toBeNull();
    expect(verifySlackOAuthState(`${state}x`, state)).toBeNull();
  });

  it("rejects expired OAuth state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T10:00:00.000Z"));
    const state = createSlackOAuthState("install", "admin-1");
    vi.setSystemTime(new Date("2026-11-08T10:11:00.000Z"));
    expect(verifySlackOAuthState(state, state)).toBeNull();
    vi.useRealTimers();
  });

  it("verifies signed Slack requests and rejects stale or modified payloads", () => {
    const timestamp = "1794146400";
    const body = '{"type":"event_callback"}';
    const signature = `v0=${createHmac("sha256", "signing-secret")
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`;

    expect(
      verifySlackRequestSignature("signing-secret", timestamp, signature, body, 1794146400),
    ).toBe(true);
    expect(
      verifySlackRequestSignature("signing-secret", timestamp, signature, `${body} `, 1794146400),
    ).toBe(false);
    expect(
      verifySlackRequestSignature("signing-secret", timestamp, signature, body, 1794147000),
    ).toBe(false);
  });
});
