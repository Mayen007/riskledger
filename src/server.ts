// Load .env in development. In production (Render / other PaaS) env vars are
// pre-injected by the host; dotenv.config() is a safe no-op if the vars are
// already set — it never overwrites existing environment variables.
import { config as loadEnv } from "dotenv";
loadEnv();

import { run } from "probot";

import registerApp from "./app";

// smee-client's EventSource connection can emit ErrorEvent objects when the
// SSE stream drops or reconnects. On Node 24 these surface as unhandled promise
// rejections and crash the process. We catch them here, log a warning, and let
// smee's built-in reconnect logic handle recovery — only re-throwing errors
// that are genuine application failures.
process.on("unhandledRejection", (reason) => {
  if (
    reason != null &&
    typeof reason === "object" &&
    reason.constructor.name === "ErrorEvent"
  ) {
    // Transient SSE connection drop from smee — not fatal, smee will reconnect.
    console.warn("[smee] SSE connection error (will reconnect):", String(reason));
    return;
  }
  // Anything else is a real bug — re-throw so Node still crashes loudly.
  throw reason;
});

run(registerApp);