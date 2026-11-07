export function buildSessionRedirect(path: string, userEmail = "") {
  const sessionId =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const sessionPayload = `${sessionId}:${userEmail.toLowerCase()}:${Date.now()}`;
  const sessionToken =
    typeof window !== "undefined" && typeof window.btoa === "function"
      ? window.btoa(sessionPayload)
      : sessionPayload;

  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}session_id=${encodeURIComponent(
    sessionId,
  )}&session_token=${encodeURIComponent(sessionToken)}`;
}
