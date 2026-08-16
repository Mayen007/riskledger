import { getRateLimitDetails, isRateLimitError } from "../src/shared/rateLimit";

describe("rateLimit helper", () => {
  it("detects primary rate limit by status 403 and message", () => {
    const error = {
      status: 403,
      message: "API rate limit exceeded for installation ID 12345",
      response: {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1700000000",
        },
      },
    };

    expect(isRateLimitError(error)).toBe(true);
    const details = getRateLimitDetails(error);
    expect(details.isRateLimit).toBe(true);
    expect(details.isSecondary).toBe(false);
    expect(details.resetEpochSeconds).toBe(1700000000);
  });

  it("detects secondary rate limit by message keywords", () => {
    const error = {
      status: 403,
      message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
      response: {
        headers: {
          "retry-after": "60",
        },
      },
    };

    expect(isRateLimitError(error)).toBe(true);
    const details = getRateLimitDetails(error);
    expect(details.isRateLimit).toBe(true);
    expect(details.isSecondary).toBe(true);
    expect(details.retryAfterSeconds).toBe(60);
  });

  it("detects status 429 as rate limit error", () => {
    const error = {
      status: 429,
      message: "Too Many Requests",
      response: {
        headers: {
          "retry-after": "120",
        },
      },
    };

    expect(isRateLimitError(error)).toBe(true);
    const details = getRateLimitDetails(error);
    expect(details.isRateLimit).toBe(true);
    expect(details.retryAfterSeconds).toBe(120);
  });

  it("returns isRateLimit=false for normal 404 or 500 errors", () => {
    const notFoundError = {
      status: 404,
      message: "Not Found",
    };

    expect(isRateLimitError(notFoundError)).toBe(false);
    const details = getRateLimitDetails(notFoundError);
    expect(details.isRateLimit).toBe(false);
    expect(details.isSecondary).toBe(false);
  });

  it("handles non-object errors safely", () => {
    expect(isRateLimitError("some raw string error")).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});
