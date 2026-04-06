<p align="center">
  <img src="src/assets/branding/logo-full.svg" alt="ReArch" width="370" />
</p>

<p align="center">
  <strong>ReArch</strong> — Background AI. Let your entire workforce ship.
</p>

<p align="center">
  <a href="https://astro.build"><img src="https://img.shields.io/badge/Astro-6.0-bc52ee?logo=astro&logoColor=white" alt="Astro" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4.0-38bdf8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e" alt="License" /></a>
</p>

---

## What is ReArch?

ReArch is an AI background agent that writes, tests, and ships code — so everyone on your team can build, not just engineers.

- **Background Execution** — Runs in sandboxed VMs, works while you sleep
- **PR Automation** — Creates pull requests, handles review feedback automatically
- **Visual Verification** — Screenshots and live previews for frontend work
- **Multi-Repo Support** — Works across your entire codebase
- **Multiplayer Sessions** — Collaborate with teammates in real-time
- **Unlimited Concurrency** — Run as many sessions as you want simultaneously
- **Voice Support** — Talk to your agent naturally

---

## Quick Start

```bash
# Clone
git clone https://github.com/lab34-es/rearch.engineer.git my-project
cd my-project

# Install (requires Node 22.12+)
pnpm install

# Configure
cp .env.example .env

# Develop
pnpm dev
```

---

## Commands

| Command         | Description              |
| --------------- | ------------------------ |
| `pnpm dev`      | Start dev server         |
| `pnpm build`    | Production build         |
| `pnpm preview`  | Preview production build |
| `pnpm check`    | Astro type checker       |
| `pnpm lint`     | ESLint                   |
| `pnpm format`   | Prettier                 |
| `pnpm test`     | Vitest                   |
| `pnpm test:e2e` | Playwright E2E           |

---

## Project Structure

```
src/
  components/
    ui/           # UI components (form, data-display, feedback, overlay, etc.)
    patterns/     # Composed patterns (ContactForm, SearchInput, StatCard, etc.)
    layout/       # Header, Footer, ThemeToggle, Analytics
    landing/      # Credibility, TechStack, FeatureTabs, and more
    seo/          # SEO, JsonLd, Breadcrumbs
  content/        # Blog posts, authors, FAQs
  config/         # Site and navigation config
  styles/         # Global CSS and design tokens
  pages/          # Routes, API endpoints, OG image generation
```

---

## Configuration

**Site config**: `src/config/site.config.ts` — name, description, URL, social links

**Design tokens**: `src/styles/tokens/` — colors, typography, spacing

**Themes**: `src/styles/themes/` — switch between `default` and `midnight`, or create your own

**Environment**: `.env` — see `.env.example` for available variables

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Ensure `pnpm lint` and `pnpm check` pass
4. Open a PR

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Built by [Lab34](https://lab34.es)**
