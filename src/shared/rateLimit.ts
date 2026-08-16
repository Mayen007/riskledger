export interface RateLimitDetails {
  isRateLimit: boolean;
  isSecondary: boolean;
  retryAfterSeconds?: number;
  resetEpochSeconds?: number;
  message: string;
}

interface HttpErrorLike {
  status?: number;
  message?: string;
  response?: {
    status?: number;
    headers?: Record<string, string | number | undefined>;
    data?: {
      message?: string;
      documentation_url?: string;
    };
  };
}

/**
 * Checks if an error represents a primary or secondary GitHub API rate limit.
 */
export function isRateLimitError(error: unknown): boolean {
  return getRateLimitDetails(error).isRateLimit;
}

/**
 * Extracts structured rate limit details and retry suggestions from an error.
 */
export function getRateLimitDetails(error: unknown): RateLimitDetails {
  if (error == null || typeof error !== "object") {
    return {
      isRateLimit: false,
      isSecondary: false,
      message: String(error),
    };
  }

  const err = error as HttpErrorLike;
  const status = err.status ?? err.response?.status;
  const message = err.message ?? err.response?.data?.message ?? "";
  const headers = err.response?.headers ?? {};

  const is403Or429 = status === 403 || status === 429;
  const lowerMessage = message.toLowerCase();

  const isPrimary =
    (is403Or429 && lowerMessage.includes("rate limit")) ||
    headers["x-ratelimit-remaining"] === "0" ||
    headers["x-ratelimit-remaining"] === 0;

  const isSecondary =
    is403Or429 &&
    (lowerMessage.includes("secondary rate limit") ||
      lowerMessage.includes("abuse") ||
      lowerMessage.includes("please wait a few minutes"));

  const isRateLimit = isPrimary || isSecondary || status === 429;

  let retryAfterSeconds: number | undefined;
  const retryHeader = headers["retry-after"];
  if (typeof retryHeader === "number") {
    retryAfterSeconds = retryHeader;
  } else if (typeof retryHeader === "string") {
    const parsed = parseInt(retryHeader, 10);
    if (!Number.isNaN(parsed)) {
      retryAfterSeconds = parsed;
    }
  }

  let resetEpochSeconds: number | undefined;
  const resetHeader = headers["x-ratelimit-reset"];
  if (typeof resetHeader === "number") {
    resetEpochSeconds = resetHeader;
  } else if (typeof resetHeader === "string") {
    const parsed = parseInt(resetHeader, 10);
    if (!Number.isNaN(parsed)) {
      resetEpochSeconds = parsed;
    }
  }

  if (retryAfterSeconds === undefined && resetEpochSeconds !== undefined) {
    const nowEpoch = Math.floor(Date.now() / 1000);
    retryAfterSeconds = Math.max(0, resetEpochSeconds - nowEpoch);
  }

  return {
    isRateLimit,
    isSecondary,
    retryAfterSeconds,
    resetEpochSeconds,
    message,
  };
}
