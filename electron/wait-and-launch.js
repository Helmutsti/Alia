import { spawn } from "node:child_process";

const DEV_SERVER_URL = "http://localhost:5173";
const POLL_INTERVAL_MS = 250;
const TIMEOUT_MS = 30_000;

async function waitForDevServer() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(DEV_SERVER_URL);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Vite dev server did not start within ${TIMEOUT_MS}ms`);
}

await waitForDevServer();

const electronBinary = (await import("electron")).default;

const child = spawn(electronBinary, ["."], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RENDERER_URL: DEV_SERVER_URL },
});

child.on("exit", (code) => process.exit(code ?? 0));
