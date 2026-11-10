import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let limiter: Ratelimit | undefined;

function getLimiter() {
  if (limiter) {
    return limiter;
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Client chat rate limiting is not configured.");
  }

  limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(6, "1 m"),
    prefix: "kiln-studio:client-chat",
    analytics: false,
  });
  return limiter;
}

export async function checkClientChatRateLimit(identifier: string) {
  return getLimiter().limit(identifier);
}
