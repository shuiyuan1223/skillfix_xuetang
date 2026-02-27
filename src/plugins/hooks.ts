/**
 * Plugin Hook Runner
 *
 * Provides utilities for executing plugin lifecycle hooks with proper
 * error handling, priority ordering, and async support.
 *
 * Adapted from OpenClaw src/plugins/hooks.ts — import paths changed,
 * .toSorted() replaced with .slice().sort() for broader runtime compat.
 */

import type { PluginRegistry } from "./registry.js";
import type {
  PluginHookAfterCompactionEvent,
  PluginHookAfterToolCallEvent,
  PluginHookAgentContext,
  PluginHookAgentEndEvent,
  PluginHookBeforeAgentStartEvent,
  PluginHookBeforeAgentStartResult,
  PluginHookBeforeCompactionEvent,
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookGatewayContext,
  PluginHookGatewayStartEvent,
  PluginHookGatewayStopEvent,
  PluginHookMessageContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageSendingEvent,
  PluginHookMessageSendingResult,
  PluginHookMessageSentEvent,
  PluginHookName,
  PluginHookRegistration,
  PluginHookSessionContext,
  PluginHookSessionEndEvent,
  PluginHookSessionStartEvent,
  PluginHookToolContext,
  PluginHookToolResultPersistContext,
  PluginHookToolResultPersistEvent,
  PluginHookToolResultPersistResult,
} from "./types.js";

// Re-export types for consumers
export type {
  PluginHookAgentContext,
  PluginHookBeforeAgentStartEvent,
  PluginHookBeforeAgentStartResult,
  PluginHookAgentEndEvent,
  PluginHookBeforeCompactionEvent,
  PluginHookAfterCompactionEvent,
  PluginHookMessageContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageSendingEvent,
  PluginHookMessageSendingResult,
  PluginHookMessageSentEvent,
  PluginHookToolContext,
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookAfterToolCallEvent,
  PluginHookToolResultPersistContext,
  PluginHookToolResultPersistEvent,
  PluginHookToolResultPersistResult,
  PluginHookSessionContext,
  PluginHookSessionStartEvent,
  PluginHookSessionEndEvent,
  PluginHookGatewayContext,
  PluginHookGatewayStartEvent,
  PluginHookGatewayStopEvent,
};

export type HookRunnerLogger = {
  debug?: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type HookRunnerOptions = {
  logger?: HookRunnerLogger;
  /** If true, errors in hooks will be caught and logged instead of thrown */
  catchErrors?: boolean;
};

/**
 * Get hooks for a specific hook name, sorted by priority (higher first).
 */
function getHooksForName<K extends PluginHookName>(
  registry: PluginRegistry,
  hookName: K
): PluginHookRegistration<K>[] {
  return (registry.typedHooks as PluginHookRegistration<K>[])
    .filter((h) => h.hookName === hookName)
    .slice()
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Run a hook that doesn't return a value (fire-and-forget style).
 * All handlers are executed in parallel for performance.
 */
async function runVoidHook<K extends PluginHookName>(
  registry: PluginRegistry,
  hookName: K,
  event: Parameters<NonNullable<PluginHookRegistration<K>["handler"]>>[0],
  ctx: Parameters<NonNullable<PluginHookRegistration<K>["handler"]>>[1],
  logger?: HookRunnerLogger,
  catchErrors = true
): Promise<void> {
  const hooks = getHooksForName(registry, hookName);
  if (hooks.length === 0) return;

  logger?.debug?.(`[hooks] running ${hookName} (${hooks.length} handlers)`);

  const promises = hooks.map(async (hook) => {
    try {
      await (hook.handler as (event: unknown, ctx: unknown) => Promise<void>)(event, ctx);
    } catch (err) {
      const msg = `[hooks] ${hookName} handler from ${hook.pluginId} failed: ${String(err)}`;
      if (catchErrors) logger?.error(msg);
      else throw new Error(msg, { cause: err });
    }
  });

  await Promise.all(promises);
}

/**
 * Run a hook that can return a modifying result.
 * Handlers are executed sequentially in priority order, and results are merged.
 */
async function runModifyingHook<K extends PluginHookName, TResult>(
  registry: PluginRegistry,
  hookName: K,
  event: Parameters<NonNullable<PluginHookRegistration<K>["handler"]>>[0],
  ctx: Parameters<NonNullable<PluginHookRegistration<K>["handler"]>>[1],
  logger?: HookRunnerLogger,
  catchErrors = true,
  mergeResults?: (accumulated: TResult | undefined, next: TResult) => TResult
): Promise<TResult | undefined> {
  const hooks = getHooksForName(registry, hookName);
  if (hooks.length === 0) return undefined;

  logger?.debug?.(`[hooks] running ${hookName} (${hooks.length} handlers, sequential)`);

  let result: TResult | undefined;

  for (const hook of hooks) {
    try {
      const handlerResult = await (
        hook.handler as (event: unknown, ctx: unknown) => Promise<TResult>
      )(event, ctx);

      if (handlerResult !== undefined && handlerResult !== null) {
        if (mergeResults && result !== undefined) {
          result = mergeResults(result, handlerResult);
        } else {
          result = handlerResult;
        }
      }
    } catch (err) {
      const msg = `[hooks] ${hookName} handler from ${hook.pluginId} failed: ${String(err)}`;
      if (catchErrors) logger?.error(msg);
      else throw new Error(msg, { cause: err });
    }
  }

  return result;
}

/**
 * Run tool_result_persist hook (synchronous).
 */
function runToolResultPersistHook(
  registry: PluginRegistry,
  event: PluginHookToolResultPersistEvent,
  ctx: PluginHookToolResultPersistContext,
  logger?: HookRunnerLogger,
  catchErrors = true
): PluginHookToolResultPersistResult | undefined {
  const hooks = getHooksForName(registry, "tool_result_persist");
  if (hooks.length === 0) return undefined;

  let current = event.message;

  for (const hook of hooks) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = (hook.handler as any)({ ...event, message: current }, ctx) as
        | PluginHookToolResultPersistResult
        | void
        | Promise<unknown>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (out && typeof (out as any).then === "function") {
        const msg =
          `[hooks] tool_result_persist handler from ${hook.pluginId} returned a Promise; ` +
          `this hook is synchronous and the result was ignored.`;
        if (catchErrors) {
          logger?.warn?.(msg);
          continue;
        }
        throw new Error(msg);
      }

      const next = (out as PluginHookToolResultPersistResult | undefined)?.message;
      if (next) current = next;
    } catch (err) {
      const msg = `[hooks] tool_result_persist handler from ${hook.pluginId} failed: ${String(err)}`;
      if (catchErrors) logger?.error(msg);
      else throw new Error(msg, { cause: err });
    }
  }

  return { message: current };
}

/**
 * Build agent hook functions (before_agent_start, agent_end, compaction hooks).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildAgentHooks(registry: PluginRegistry, logger?: HookRunnerLogger, catchErrors = true) {
  return {
    runBeforeAgentStart: (event: PluginHookBeforeAgentStartEvent, ctx: PluginHookAgentContext) =>
      runModifyingHook<"before_agent_start", PluginHookBeforeAgentStartResult>(
        registry,
        "before_agent_start",
        event,
        ctx,
        logger,
        catchErrors,
        (acc, next) => ({
          systemPrompt: next.systemPrompt ?? acc?.systemPrompt,
          prependContext:
            acc?.prependContext && next.prependContext
              ? `${acc.prependContext}\n\n${next.prependContext}`
              : (next.prependContext ?? acc?.prependContext),
        })
      ),
    runAgentEnd: (event: PluginHookAgentEndEvent, ctx: PluginHookAgentContext) =>
      runVoidHook(registry, "agent_end", event, ctx, logger, catchErrors),
    runBeforeCompaction: (event: PluginHookBeforeCompactionEvent, ctx: PluginHookAgentContext) =>
      runVoidHook(registry, "before_compaction", event, ctx, logger, catchErrors),
    runAfterCompaction: (event: PluginHookAfterCompactionEvent, ctx: PluginHookAgentContext) =>
      runVoidHook(registry, "after_compaction", event, ctx, logger, catchErrors),
  };
}

/**
 * Build message hook functions.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildMessageHooks(
  registry: PluginRegistry,
  logger?: HookRunnerLogger,
  catchErrors = true
) {
  return {
    runMessageReceived: (event: PluginHookMessageReceivedEvent, ctx: PluginHookMessageContext) =>
      runVoidHook(registry, "message_received", event, ctx, logger, catchErrors),
    runMessageSending: (event: PluginHookMessageSendingEvent, ctx: PluginHookMessageContext) =>
      runModifyingHook<"message_sending", PluginHookMessageSendingResult>(
        registry,
        "message_sending",
        event,
        ctx,
        logger,
        catchErrors,
        (acc, next) => ({
          content: next.content ?? acc?.content,
          cancel: next.cancel ?? acc?.cancel,
        })
      ),
    runMessageSent: (event: PluginHookMessageSentEvent, ctx: PluginHookMessageContext) =>
      runVoidHook(registry, "message_sent", event, ctx, logger, catchErrors),
  };
}

/**
 * Build tool hook functions.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildToolHooks(registry: PluginRegistry, logger?: HookRunnerLogger, catchErrors = true) {
  return {
    runBeforeToolCall: (event: PluginHookBeforeToolCallEvent, ctx: PluginHookToolContext) =>
      runModifyingHook<"before_tool_call", PluginHookBeforeToolCallResult>(
        registry,
        "before_tool_call",
        event,
        ctx,
        logger,
        catchErrors,
        (acc, next) => ({
          params: next.params ?? acc?.params,
          block: next.block ?? acc?.block,
          blockReason: next.blockReason ?? acc?.blockReason,
        })
      ),
    runAfterToolCall: (event: PluginHookAfterToolCallEvent, ctx: PluginHookToolContext) =>
      runVoidHook(registry, "after_tool_call", event, ctx, logger, catchErrors),
    runToolResultPersist: (
      event: PluginHookToolResultPersistEvent,
      ctx: PluginHookToolResultPersistContext
    ) => runToolResultPersistHook(registry, event, ctx, logger, catchErrors),
  };
}

/**
 * Create a hook runner for a specific registry.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createHookRunner(registry: PluginRegistry, options: HookRunnerOptions = {}) {
  const logger = options.logger;
  const catchErrors = options.catchErrors ?? true;

  return {
    ...buildAgentHooks(registry, logger, catchErrors),
    ...buildMessageHooks(registry, logger, catchErrors),
    ...buildToolHooks(registry, logger, catchErrors),
    // Session hooks
    runSessionStart: (event: PluginHookSessionStartEvent, ctx: PluginHookSessionContext) =>
      runVoidHook(registry, "session_start", event, ctx, logger, catchErrors),
    runSessionEnd: (event: PluginHookSessionEndEvent, ctx: PluginHookSessionContext) =>
      runVoidHook(registry, "session_end", event, ctx, logger, catchErrors),
    // Gateway hooks
    runGatewayStart: (event: PluginHookGatewayStartEvent, ctx: PluginHookGatewayContext) =>
      runVoidHook(registry, "gateway_start", event, ctx, logger, catchErrors),
    runGatewayStop: (event: PluginHookGatewayStopEvent, ctx: PluginHookGatewayContext) =>
      runVoidHook(registry, "gateway_stop", event, ctx, logger, catchErrors),
    // Utility
    hasHooks: (hookName: PluginHookName) =>
      registry.typedHooks.some((h) => h.hookName === hookName),
    getHookCount: (hookName: PluginHookName) =>
      registry.typedHooks.filter((h) => h.hookName === hookName).length,
  };
}

export type HookRunner = ReturnType<typeof createHookRunner>;
