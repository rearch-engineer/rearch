import { useState } from 'react';
import {
  GitBranch,
  Brain,
  Eye,
  Server,
  BarChart3,
  Monitor,
  Copy,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations, type Locale } from '@/i18n/index';

interface Tab {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}

interface TabContent {
  title: string;
  content: string;
}

interface FeatureTabsProps {
  locale?: Locale;
}

const codeExamples: Record<
  string,
  { code: string; filename: string; lang: 'css' | 'astro' | 'typescript' | 'javascript' }
> = {
  repositories: {
    lang: 'typescript',
    code: `// Connect your repositories
const config = {
  providers: ['github', 'bitbucket'],
  repositories: [
    { owner: 'my-org', repo: 'frontend', branch: 'main' },
    { owner: 'my-org', repo: 'api', branch: 'develop' },
  ],
  // Auto-detect language, framework, and tooling
  autoDetect: true,
};

// ReArch clones, indexes, and understands your codebase
// No migration needed — works with your existing setup`,
    filename: 'config/repositories.ts',
  },
  models: {
    lang: 'typescript',
    code: `// Frontier model configuration
const models = {
  // Use the latest models available
  primary: 'claude-sonnet-4-20250514',
  fallback: 'gpt-4o',

  // Model routing based on task complexity
  routing: {
    codegen: 'claude-sonnet-4-20250514',
    review: 'claude-sonnet-4-20250514',
    planning: 'o1-preview',
  },

  // Always up to date with latest releases
  autoUpgrade: true,
};`,
    filename: 'config/models.ts',
  },
  preview: {
    lang: 'typescript',
    code: `// Live preview configuration
const preview = {
  // Spin up isolated environments for each change
  isolation: {
    type: 'container',
    autoStart: true,
  },

  // Interact with your UI in real time
  mode: 'live', // not just screenshots

  // Validate changes before merging
  validation: {
    interactive: true,
    shareable: true,
    ttl: '24h',
  },
};`,
    filename: 'config/preview.ts',
  },
  mcp: {
    lang: 'typescript',
    code: `// MCP Server configuration
const mcpServers = {
  // Pick from the built-in gallery
  gallery: [
    'filesystem',
    'postgres',
    'github',
    'slack',
  ],

  // Or bring your own
  custom: [
    {
      name: 'internal-api',
      url: 'https://mcp.company.com/api',
      auth: { type: 'bearer', token: env.MCP_TOKEN },
    },
  ],
};`,
    filename: 'config/mcp-servers.ts',
  },
  cost: {
    lang: 'typescript',
    code: `// Cost monitoring & analytics
const monitoring = {
  // Track usage per user, conversation, project
  breakdown: ['user', 'conversation', 'project'],

  // Set budgets and alerts
  budgets: {
    monthly: { limit: 500, currency: 'USD' },
    perUser: { limit: 50, currency: 'USD' },
  },

  alerts: {
    threshold: 0.8, // Alert at 80% usage
    channels: ['email', 'slack'],
  },

  // Real-time dashboard included
  dashboard: true,
};`,
    filename: 'config/monitoring.ts',
  },
  workspace: {
    lang: 'typescript',
    code: `// Workspace configuration
const workspace = {
  // Browser-based IDE included
  browser: {
    enabled: true,
    theme: 'auto', // follows system preference
  },

  // VS Code extension available
  vscode: {
    extension: 'rearch.rearch-vscode',
    // Connect to running sessions from VS Code
    remoteAttach: true,
  },

  // Work from anywhere
  environments: ['browser', 'vscode', 'cli'],
};`,
    filename: 'config/workspace.ts',
  },
};

// Simple syntax highlighter
function highlightCode(code: string, lang: string): React.ReactNode[] {
  const lines = code.split('\n');

  return lines.map((line, lineIndex) => {
    const tokens: React.ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    const addToken = (text: string, className?: string) => {
      if (text) {
        tokens.push(
          <span key={`${lineIndex}-${keyIndex++}`} className={className}>
            {text}
          </span>
        );
      }
    };

    // Process the line character by character with regex patterns
    while (remaining.length > 0) {
      let matched = false;

      // Comments (// and /* */)
      const commentMatch = remaining.match(/^(\/\/.*|\/\*[\s\S]*?\*\/)/);
      if (commentMatch) {
        addToken(commentMatch[0], 'text-foreground-muted italic');
        remaining = remaining.slice(commentMatch[0].length);
        matched = true;
        continue;
      }

      // HTML comments
      const htmlCommentMatch = remaining.match(/^(<!--[\s\S]*?-->)/);
      if (htmlCommentMatch) {
        addToken(htmlCommentMatch[0], 'text-foreground-muted italic');
        remaining = remaining.slice(htmlCommentMatch[0].length);
        matched = true;
        continue;
      }

      // Strings (single, double, template)
      const stringMatch = remaining.match(/^(['"`])(?:(?!\1)[^\\]|\\.)*\1/);
      if (stringMatch) {
        addToken(stringMatch[0], 'text-green-600 dark:text-green-400');
        remaining = remaining.slice(stringMatch[0].length);
        matched = true;
        continue;
      }

      // Astro frontmatter delimiters
      if (remaining.startsWith('---')) {
        addToken('---', 'text-purple-600 dark:text-purple-400 font-semibold');
        remaining = remaining.slice(3);
        matched = true;
        continue;
      }

      // HTML/JSX tags
      const tagMatch = remaining.match(/^(<\/?[\w-]+|>|\/>)/);
      if (tagMatch) {
        addToken(tagMatch[0], 'text-pink-600 dark:text-pink-400');
        remaining = remaining.slice(tagMatch[0].length);
        matched = true;
        continue;
      }

      // CSS at-rules (@theme, @import, etc.)
      const atRuleMatch = remaining.match(/^(@[\w-]+)/);
      if (atRuleMatch) {
        addToken(atRuleMatch[0], 'text-purple-600 dark:text-purple-400 font-semibold');
        remaining = remaining.slice(atRuleMatch[0].length);
        matched = true;
        continue;
      }

      // Keywords
      const keywordMatch = remaining.match(
        /^(const|let|var|function|return|import|export|from|interface|type|class|extends|implements|new|async|await|if|else|for|while|switch|case|break|default|try|catch|finally|throw|typeof|instanceof|in|of|as|readonly|public|private|protected)\b/
      );
      if (keywordMatch) {
        addToken(keywordMatch[0], 'text-purple-600 dark:text-purple-400 font-semibold');
        remaining = remaining.slice(keywordMatch[0].length);
        matched = true;
        continue;
      }

      // Boolean/null
      const boolMatch = remaining.match(/^(true|false|null|undefined)\b/);
      if (boolMatch) {
        addToken(boolMatch[0], 'text-orange-700 dark:text-orange-300');
        remaining = remaining.slice(boolMatch[0].length);
        matched = true;
        continue;
      }

      // Numbers
      const numberMatch = remaining.match(/^(\d+\.?\d*)/);
      if (numberMatch) {
        addToken(numberMatch[0], 'text-orange-700 dark:text-orange-300');
        remaining = remaining.slice(numberMatch[0].length);
        matched = true;
        continue;
      }

      // CSS properties (word followed by colon)
      const cssPropMatch = remaining.match(/^([\w-]+)(:)/);
      if (cssPropMatch && (lang === 'css' || line.includes('{'))) {
        addToken(cssPropMatch[1], 'text-blue-600 dark:text-blue-400');
        addToken(cssPropMatch[2], 'text-foreground-secondary');
        remaining = remaining.slice(cssPropMatch[0].length);
        matched = true;
        continue;
      }

      // CSS functions (var, oklch, etc.)
      const cssFuncMatch = remaining.match(
        /^(var|oklch|rgb|rgba|hsl|hsla|calc|url|clamp|min|max)(\()/
      );
      if (cssFuncMatch) {
        addToken(cssFuncMatch[1], 'text-amber-700 dark:text-amber-300');
        addToken(cssFuncMatch[2], 'text-foreground-secondary');
        remaining = remaining.slice(cssFuncMatch[0].length);
        matched = true;
        continue;
      }

      // Function calls
      const funcMatch = remaining.match(/^([\w]+)(\()/);
      if (funcMatch) {
        addToken(funcMatch[1], 'text-amber-700 dark:text-amber-300');
        addToken(funcMatch[2], 'text-foreground-secondary');
        remaining = remaining.slice(funcMatch[0].length);
        matched = true;
        continue;
      }

      // Type annotations after colon
      const typeMatch = remaining.match(/^(:\s*)([\w<>[\]|&]+)/);
      if (typeMatch) {
        addToken(typeMatch[1], 'text-foreground-secondary');
        addToken(typeMatch[2], 'text-cyan-700 dark:text-cyan-300');
        remaining = remaining.slice(typeMatch[0].length);
        matched = true;
        continue;
      }

      // Default: single character
      if (!matched) {
        addToken(remaining[0], 'text-foreground-secondary');
        remaining = remaining.slice(1);
      }
    }

    return tokens.length > 0 ? tokens : [<span key={lineIndex}> </span>];
  });
}

function CodeBlock({ code, filename, lang }: { code: string; filename: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const highlightedLines = highlightCode(code.trim(), lang);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group border-border bg-background-secondary relative w-full overflow-hidden rounded-md border font-mono text-xs shadow-sm">
      {/* Header */}
      <div className="border-border bg-background flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="bg-border-strong h-2 w-2 rounded-full" />
            <div className="bg-border-strong h-2 w-2 rounded-full" />
            <div className="bg-border-strong h-2 w-2 rounded-full" />
          </div>
          <span className="text-foreground-muted font-sans text-[10px] font-medium">
            {filename}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="text-foreground-muted hover:bg-secondary hover:text-foreground flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-600" strokeWidth={2} />
              <span className="text-green-600">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={2} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Area */}
      <div className="bg-background overflow-x-auto p-3">
        <pre className="flex flex-col leading-5">
          {highlightedLines.map((lineTokens, i) => (
            <div key={i} className="table-row">
              <span className="text-foreground-subtle table-cell w-6 pr-3 text-right text-[10px] select-none">
                {i + 1}
              </span>
              <span className="table-cell whitespace-pre">{lineTokens}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

const tabIds = ['repositories', 'models', 'preview', 'mcp', 'cost', 'workspace'] as const;

const tabIcons: Record<string, LucideIcon> = {
  repositories: GitBranch,
  models: Brain,
  preview: Eye,
  mcp: Server,
  cost: BarChart3,
  workspace: Monitor,
};

export function FeatureTabs({ locale = 'en' as Locale }: FeatureTabsProps) {
  const t = useTranslations(locale);
  const [activeTab, setActiveTab] = useState('repositories');

  const tabs: Tab[] = tabIds.map((id) => ({
    id,
    label: t(`features.tabs.${id}.label` as Parameters<typeof t>[0]),
    desc: t(`features.tabs.${id}.desc` as Parameters<typeof t>[0]),
    icon: tabIcons[id],
  }));

  const activeTabContent: TabContent = {
    title: t(`features.tabs.${activeTab}.title` as Parameters<typeof t>[0]),
    content: t(`features.tabs.${activeTab}.content` as Parameters<typeof t>[0]),
  };
  const activeCodeExample = codeExamples[activeTab];

  return (
    <section id="features" className="bg-background relative overflow-hidden py-24">
      {/* Decorative logomark watermark */}
      <div
        className="pointer-events-none absolute -top-8 right-8 hidden h-[28rem] w-[28rem] opacity-[0.04] grayscale md:block lg:-top-12 lg:right-24 lg:h-[44rem] lg:w-[44rem] dark:opacity-[0.06]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 90 101" fill="none" className="h-full w-full">
          <path
            d="M35.1288 23.8398L45.1667 49.4151L56.2482 23.8398H87.1082C86.5647 23.3764 85.9776 22.9637 85.3616 22.5944L48.6165 0.704798C46.377 -0.0699896 43.4273 -0.439281 41.2675 0.842377L3.36286 23.3692C3.13819 23.5067 2.92801 23.666 2.72508 23.8326H35.1288V23.8398Z"
            fill="currentColor"
          />
          <path
            d="M0.144951 28.8578C0.079723 29.2851 0.0434853 29.7123 0.0434853 30.1323L0 72.036C0 76.1778 1.95684 78.3936 5.26172 80.3631L39.4919 100.703L0.144951 28.8578Z"
            fill="currentColor"
          />
          <path
            d="M89.9203 28.7058L50.0588 101L86.6661 79.1539C88.7027 77.9374 90 75.0265 90 72.6442L89.9783 29.6037C89.9783 29.2923 89.9493 28.9954 89.913 28.6985L89.9203 28.7058Z"
            fill="currentColor"
          />
        </svg>
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Header */}
        <div className="mb-16">
          <h2 className="font-display text-foreground text-3xl font-bold md:text-4xl">
            {t('features.sectionTitle')}
            <br />
            <span className="text-brand-500">{t('features.sectionTitleHighlight')}</span>
          </h2>
          <p className="text-foreground-muted mt-4 max-w-2xl text-lg">
            {t('features.sectionDescription')}
          </p>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Sidebar */}
          <div className="flex flex-col gap-2 lg:col-span-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex flex-col items-start rounded-md p-4 text-left transition-all ${
                  activeTab === tab.id
                    ? 'bg-secondary ring-border shadow-sm ring-1'
                    : 'hover:bg-background-secondary hover:pl-5'
                }`}
              >
                <span
                  className={`font-display flex items-center gap-2 text-base font-bold ${
                    activeTab === tab.id
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400'
                  }`}
                >
                  <tab.icon
                    className={`h-5 w-5 ${activeTab === tab.id ? 'text-brand-500' : 'text-foreground-subtle group-hover:text-brand-500'}`}
                    strokeWidth={2}
                  />
                  {tab.label}
                </span>
                <span className="text-foreground-muted mt-1 pl-7 text-sm">{tab.desc}</span>
              </button>
            ))}
          </div>

          {/* Content Preview */}
          <div className="lg:col-span-8">
            <div className="mb-6">
              <h3 className="text-foreground text-xl font-bold">{activeTabContent.title}</h3>
              <p className="text-foreground-muted mt-2">{activeTabContent.content}</p>
            </div>
            <CodeBlock
              code={activeCodeExample.code}
              filename={activeCodeExample.filename}
              lang={activeCodeExample.lang}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
// ok
export default FeatureTabs;
