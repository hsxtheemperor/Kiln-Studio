import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let limiter: Ratelimit | undefined;

function getLimiter(): Ratelimit {
  if (limiter) {
    return limiter;
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Inquiry rate limiting is not configured.");
  }

  limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "10 m"),
    prefix: "kiln-studio:public-inquiries",
    analytics: false,
  });

  return limiter;
}

export async function checkInquiryRateLimit(identifier: string) {
  return getLimiter().limit(identifier);
}
