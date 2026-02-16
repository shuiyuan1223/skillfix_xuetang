/**
 * Playwright global teardown — kills the Bun server subprocess.
 */

import * as fs from "fs";

export default async function globalTeardown() {
  // Read PID from temp file
  try {
    const pid = parseInt(fs.readFileSync("/tmp/pha-e2e-browser-pid.txt", "utf-8").trim(), 10);
    if (pid) {
      process.kill(pid, "SIGTERM");
      console.log(`[e2e-browser] Stopped server process (pid: ${pid})`);
    }
  } catch {
    // Process may already be dead
  }

  // Clean up temp files
  try {
    fs.unlinkSync("/tmp/pha-e2e-browser-pid.txt");
  } catch {
    /* noop */
  }
  try {
    fs.unlinkSync("/tmp/pha-e2e-browser-info.json");
  } catch {
    /* noop */
  }
}
