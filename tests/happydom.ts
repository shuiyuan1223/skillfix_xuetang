import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Save Bun's native implementations before happy-dom overwrites them
const saved = {
  fetch: globalThis.fetch,
  Response: globalThis.Response,
  Request: globalThis.Request,
  Headers: globalThis.Headers,
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
};

GlobalRegistrator.register();

// Restore Bun's native implementations — happy-dom's replacements break real HTTP/streams
Object.assign(globalThis, saved);
