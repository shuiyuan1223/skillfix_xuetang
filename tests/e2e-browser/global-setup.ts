/**
 * Playwright global setup — spawns a Bun subprocess to start PHA Gateway + Mock LLM.
 *
 * Playwright runs in Node.js, so we can't use Bun.serve() directly.
 * Instead, we spawn `bun run start-server.ts` and wait for it to print
 * the ready signal with the port number.
 */

import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INFO_FILE = "/tmp/pha-e2e-browser-info.json";
let serverProcess: ChildProcess | null = null;

export default async function globalSetup() {
  const serverScript = path.resolve(__dirname, "start-server.ts");

  return new Promise<void>((resolve, reject) => {
    const proc = spawn("bun", ["run", serverScript], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    serverProcess = proc;

    let output = "";
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Server startup timed out. Output: ${output}`));
    }, 30000);

    proc.stdout!.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      // Look for ready signal
      const match = text.match(/PHA_TEST_READY:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        const port = match[1];
        process.env.PHA_TEST_PORT = port;
        // Write PID for teardown
        fs.writeFileSync("/tmp/pha-e2e-browser-pid.txt", String(proc.pid));
        console.log(`[e2e-browser] PHA Gateway at http://localhost:${port} (pid: ${proc.pid})`);
        resolve();
      }
    });

    proc.stderr!.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start server: ${err.message}`));
    });

    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Server process exited with code ${code}. Output: ${output}`));
      }
    });
  });
}

export { serverProcess };
