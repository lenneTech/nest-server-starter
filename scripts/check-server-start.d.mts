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
  /** Path requested once the server is up. */
  smokePath?: string;
}

export type KillTreePlan = { args: string[]; command: 'taskkill' } | { signal: NodeJS.Signals };

export const NUXT_DEFAULTS: Readonly<Required<Omit<ServerStartOptions, 'cwd'>>>;
export function isReadyOutput(text: string, patterns: RegExp[]): boolean;
export function isRenderedStatus(status: number): boolean;
export function killTreePlan(pid: number, signal: NodeJS.Signals, platform?: NodeJS.Platform): KillTreePlan;
export function parseArgs(argv: string[]): ServerStartOptions;
/** Resolves to the exit code: 0 when the server came up and rendered, 1 otherwise. */
export function run(options?: ServerStartOptions, log?: (line: string) => void): Promise<0 | 1>;
