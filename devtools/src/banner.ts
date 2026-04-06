// ──────────────────────────────────────────────────────────────
// banner.ts — ReArch branded ASCII art banner
// ──────────────────────────────────────────────────────────────

import chalk from "chalk";

// Brand color: #EE4000 (red-orange from the ReArch logo)
const brand = chalk.hex("#EE4000");
const brandBold = chalk.hex("#EE4000").bold;
const dim = chalk.dim;
const white = chalk.white;

const LOGO_ART = [
  "  ██████╗  ███████╗  █████╗  ██████╗   ██████╗██╗  ██╗",
  "  ██╔══██╗ ██╔════╝ ██╔══██╗ ██╔══██╗ ██╔════╝██║  ██║",
  "  ██████╔╝ █████╗   ███████║ ██████╔╝ ██║     ███████║",
  "  ██╔══██╗ ██╔══╝   ██╔══██║ ██╔══██╗ ██║     ██╔══██║",
  "  ██║  ██║ ███████╗ ██║  ██║ ██║  ██║ ╚██████╗██║  ██║",
  "  ╚═╝  ╚═╝ ╚══════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝  ╚═════╝╚═╝  ╚═╝",
];

const TAGLINE = "Background AI. Let your entire workforce ship.";

/**
 * Returns the full branded banner as a string (for initial splash screen).
 */
export function renderBanner(): string {
  const lines: string[] = [];

  lines.push("");
  for (const line of LOGO_ART) {
    lines.push(brand(line));
  }
  lines.push("");
  lines.push(`  ${white(TAGLINE)}`);
  lines.push(`  ${dim("─".repeat(56))}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Returns a compact single-line banner for the dashboard header.
 */
export function renderCompactBanner(): string {
  const r = brandBold("██▀█▄");
  const name = brandBold(" ReArch");
  const sep = dim(" · ");
  const desc = dim("Development Server");

  return `  ${r}${name}${sep}${desc}`;
}
