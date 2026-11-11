/**
 * Public surface of `scripts/check-server-start.mjs`, so the unit tests can import
 * its helpers under `strict`. Everything not declared here is internal.
 */

export interface ServerStartOptions {
  /** Milliseconds to wait for a ready line before failing. */
  bootTimeoutMs?: number;
  /** Directory the entry is resolved against and the server runs in. */
  cwd?: string;
  /** Server entry, relative to `cwd`; started as `node <entry>`. */
  entry?: string;
  /** Environment variable the server reads its port from. */
  portEnv?: string;
  /** A line of server output matching any of these means "listening". */
  readyPatterns?: RegExp[];
  /**
   * Off when undefined. Otherwise, after the render: SIGTERM the server (started with
   * `PID1_SIGNAL_PRELOAD`) and require exit code 0 within this many milliseconds. Skipped on Windows.
   */
  shutdownTimeoutMs?: number;
  /** Path requested once the server is up. */
  smokePath?: string;
}

export type KillTreePlan = { args: string[]; command: 'taskkill' } | { signal: NodeJS.Signals };

export const NUXT_DEFAULTS: Readonly<Required<Omit<ServerStartOptions, 'cwd' | 'shutdownTimeoutMs'>>>;
/** Node arguments that register no-op SIGTERM / SIGINT listeners before the entry loads (PID 1 semantics). */
export const PID1_SIGNAL_PRELOAD: readonly string[];
/** Exit code 0 and no signal. */
export function isCleanShutdown(code: null | number | undefined, signal: NodeJS.Signals | null | undefined): boolean;
export function isReadyOutput(text: string, patterns: RegExp[]): boolean;
export function isRenderedStatus(status: number): boolean;
export function isKillablePid(pid: unknown, platform?: NodeJS.Platform): boolean;
/** Null when `pid` must not be touched (see `isKillablePid`). */
export function killTreePlan(pid: unknown, signal: NodeJS.Signals, platform?: NodeJS.Platform): KillTreePlan | null;
export function parseArgs(argv: string[]): ServerStartOptions;
/** Resolves to the exit code: 0 when the server came up and rendered, 1 otherwise. */
export function run(options?: ServerStartOptions, log?: (line: string) => void): Promise<0 | 1>;
