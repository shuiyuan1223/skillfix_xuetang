/**
 * CLI UI utilities
 *
 * Consistent formatting, colors, and UI components for CLI commands.
 */

// ANSI color codes
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Shorthand functions
export const c = {
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
  red: (s: string) => `${colors.red}${s}${colors.reset}`,
  green: (s: string) => `${colors.green}${s}${colors.reset}`,
  yellow: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  blue: (s: string) => `${colors.blue}${s}${colors.reset}`,
  cyan: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  magenta: (s: string) => `${colors.magenta}${s}${colors.reset}`,
  gray: (s: string) => `${colors.gray}${s}${colors.reset}`,

  // Status colors
  success: (s: string) => `${colors.green}${s}${colors.reset}`,
  error: (s: string) => `${colors.red}${s}${colors.reset}`,
  warn: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  info: (s: string) => `${colors.cyan}${s}${colors.reset}`,

  // Combined styles
  header: (s: string) => `${colors.bold}${colors.cyan}${s}${colors.reset}`,
  title: (s: string) => `${colors.bold}${s}${colors.reset}`,
  label: (s: string) => `${colors.gray}${s}${colors.reset}`,
  value: (s: string) => `${colors.white}${s}${colors.reset}`,
};

// Icons
export const icons = {
  // Status
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  pending: '○',
  running: '●',

  // Actions
  arrow: '→',
  arrowRight: '▶',
  arrowDown: '▼',
  check: '✓',
  cross: '✗',
  dot: '•',
  star: '★',

  // Objects
  folder: '📁',
  file: '📄',
  config: '⚙',
  key: '🔑',
  link: '🔗',
  clock: '⏱',
  calendar: '📅',

  // Health
  health: '🏥',
  heart: '❤',
  sleep: '🌙',
  activity: '🏃',
  steps: '👟',

  // System
  server: '🌐',
  terminal: '💻',
  robot: '🤖',
  tools: '🔧',
  doctor: '🩺',
};

// Box drawing characters
export const box = {
  // Single line
  h: '─',
  v: '│',
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  t: '┬',
  b: '┴',
  l: '├',
  r: '┤',
  x: '┼',

  // Heavy/Double
  hh: '━',
  vv: '┃',
  ttl: '┏',
  ttr: '┓',
  bbl: '┗',
  bbr: '┛',

  // Rounded
  rtl: '╭',
  rtr: '╮',
  rbl: '╰',
  rbr: '╯',
};

/**
 * Print a header box
 */
export function printHeader(title: string, subtitle?: string): void {
  const width = 60;
  const padding = Math.max(0, Math.floor((width - title.length - 2) / 2));
  const paddingRight = width - title.length - 2 - padding;

  console.log(`${c.cyan(box.ttl + box.hh.repeat(width) + box.ttr)}`);
  console.log(`${c.cyan(box.vv)}${' '.repeat(padding)} ${c.bold(title)} ${' '.repeat(paddingRight)}${c.cyan(box.vv)}`);
  if (subtitle) {
    const sp = Math.max(0, Math.floor((width - subtitle.length) / 2));
    const spr = width - subtitle.length - sp;
    console.log(`${c.cyan(box.vv)}${' '.repeat(sp)}${c.dim(subtitle)}${' '.repeat(spr)}${c.cyan(box.vv)}`);
  }
  console.log(`${c.cyan(box.bbl + box.hh.repeat(width) + box.bbr)}`);
}

/**
 * Print a section header
 */
export function printSection(title: string, icon?: string): void {
  console.log('');
  console.log(`${icon ? `${icon} ` : ''}${c.bold(title)}`);
  console.log(c.dim(box.h.repeat(50)));
}

/**
 * Print a divider
 */
export function printDivider(char = box.h): void {
  console.log(c.dim(char.repeat(50)));
}

/**
 * Print a key-value pair
 */
export function printKV(key: string, value: string, keyWidth = 14): void {
  const paddedKey = key.padEnd(keyWidth);
  console.log(`  ${c.dim(paddedKey)} ${value}`);
}

/**
 * Print a status line with icon
 */
export function printStatus(
  status: 'success' | 'error' | 'warning' | 'info' | 'pending',
  message: string,
  detail?: string
): void {
  const statusConfig = {
    success: { icon: icons.success, color: c.green },
    error: { icon: icons.error, color: c.red },
    warning: { icon: icons.warning, color: c.yellow },
    info: { icon: icons.info, color: c.cyan },
    pending: { icon: icons.pending, color: c.gray },
  };

  const cfg = statusConfig[status];
  const detailStr = detail ? ` ${c.dim(detail)}` : '';
  console.log(`  ${cfg.color(cfg.icon)} ${message}${detailStr}`);
}

/**
 * Print a table
 */
export function printTable(
  headers: string[],
  rows: string[][],
  options: { padding?: number; headerColor?: (s: string) => string } = {}
): void {
  const padding = options.padding ?? 2;
  const headerColor = options.headerColor ?? c.bold;

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(0, ...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRowWidth);
  });

  // Print header
  const headerRow = headers.map((h, i) => headerColor(h.padEnd(widths[i]))).join(' '.repeat(padding));
  console.log(`  ${headerRow}`);

  // Print separator
  const separator = widths.map((w) => box.h.repeat(w)).join(' '.repeat(padding));
  console.log(`  ${c.dim(separator)}`);

  // Print rows
  for (const row of rows) {
    const rowStr = row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' '.repeat(padding));
    console.log(`  ${rowStr}`);
  }
}

/**
 * Progress spinner
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private current = 0;
  private interval: Timer | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    process.stdout.write(`  ${c.cyan(this.frames[0])} ${this.message}`);
    this.interval = setInterval(() => {
      this.current = (this.current + 1) % this.frames.length;
      process.stdout.write(`\r  ${c.cyan(this.frames[this.current])} ${this.message}`);
    }, 80);
  }

  stop(status: 'success' | 'error' | 'warning' = 'success'): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const iconMap: Record<string, string> = {
      success: c.green(icons.success),
      error: c.red(icons.error),
      warning: c.yellow(icons.warning),
    };
    const icon = iconMap[status] ?? c.yellow(icons.warning);
    process.stdout.write(`\r  ${icon} ${this.message}\n`);
  }

  update(message: string): void {
    this.message = message;
  }
}

/**
 * Progress bar
 */
export function progressBar(current: number, total: number, width = 30): string {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  const bar = c.green('█'.repeat(filled)) + c.dim('░'.repeat(empty));
  return `${bar} ${percent}%`;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * Format duration in ms to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diff = now.getTime() - then.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  if (seconds > 5) {
    return `${seconds}s ago`;
  }
  return 'just now';
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Format number with comma separators
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Create a mini bar chart
 */
export function miniChart(values: number[], width = 20): string {
  if (values.length === 0) {
    return '';
  }
  const max = Math.max(...values);
  if (max === 0) {
    return '▁'.repeat(width);
  }

  const bars = '▁▂▃▄▅▆▇█';
  const normalized = values.map((v) => Math.round((v / max) * 7));

  // Sample if too many values
  const step = Math.ceil(values.length / width);
  const sampled = [];
  for (let i = 0; i < values.length; i += step) {
    sampled.push(normalized[i]);
  }

  return sampled.map((v) => bars[v]).join('');
}

/**
 * Print error and exit
 */
export function fatal(message: string, detail?: string): never {
  console.error(`\n${c.red(icons.error)} ${c.red('Error:')} ${message}`);
  if (detail) {
    console.error(`  ${c.dim(detail)}`);
  }
  console.error('');
  process.exit(1);
}

/**
 * Print warning
 */
export function warn(message: string, detail?: string): void {
  console.log(`${c.yellow(icons.warning)} ${c.yellow('Warning:')} ${message}`);
  if (detail) {
    console.log(`  ${c.dim(detail)}`);
  }
}

/**
 * Print success message
 */
export function success(message: string): void {
  console.log(`\n${c.green(icons.success)} ${message}\n`);
}

/**
 * Print info message
 */
export function info(message: string): void {
  console.log(`${c.cyan(icons.info)} ${message}`);
}

/**
 * Clear screen
 */
export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}
