import {
  CodeOutlined,
  WebOutlined,
  StorageOutlined,
  WidgetsOutlined,
  SmartToyOutlined,
  BrushOutlined,
  ApiOutlined,
  TerminalOutlined,
} from "@mui/icons-material";

/**
 * Icons available for container service entries.
 * The `id` must match a key in SessionSidebar's ICON_MAP.
 * Add entries here to expose new icons across the whole app.
 */
export const AVAILABLE_ICONS = [
  { id: "Code", label: "Code", Component: CodeOutlined },
  { id: "Web", label: "Web", Component: WebOutlined },
  { id: "Storage", label: "Storage", Component: StorageOutlined },
  { id: "Api", label: "API", Component: ApiOutlined },
  { id: "AI", label: "AI", Component: SmartToyOutlined },
  { id: "Design", label: "Design", Component: BrushOutlined },
  { id: "Terminal", label: "Terminal", Component: TerminalOutlined },
  { id: "Widgets", label: "Other", Component: WidgetsOutlined },
];

export function ServiceIcon({ iconId, sx = {} }) {
  const found = AVAILABLE_ICONS.find((i) => i.id === iconId);
  const Comp = found ? found.Component : WidgetsOutlined;
  return <Comp sx={{ fontSize: 18, ...sx }} />;
}

/** Quick-add presets. Each entry includes a suggested icon. */
export const SERVICE_PRESETS = [
  { label: "Frontend", icon: "Web", internalPort: 5173 },
  { label: "Backend", icon: "Storage", internalPort: 3000 },
  { label: "Custom", icon: "Widgets", internalPort: "" },
];

/** Built-in templates the agent container can be created from. */
export const TEMPLATE_OPTIONS = [
  {
    value: "",
    label: "Custom (.rearch in repo)",
    description: "Use the repository's own .rearch/ folder",
    requiresRepository: true,
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "OpenCode only",
  },
  {
    value: "node",
    label: "Node.js",
    description: "OpenCode + Node.js runtime + dev server",
  },
  {
    value: "node-browser",
    label: "Node.js + Browser",
    description: "OpenCode + Node.js + headless browser",
  },
  {
    value: "node-react-pg",
    label: "Node.js + React + PostgreSQL database",
    description: "OpenCode + Node.js & PostgreSQL db",
  },
];

/**
 * Default services per template. `null` for Custom: services are derived from
 * the repository's .rearch/Dockerfile EXPOSE lines.
 */
export const TEMPLATE_DEFAULT_SERVICES = {
  "": null,
  minimal: [
    { label: "Terminal", icon: "Terminal", internalPort: 7681 },
  ],
  node: [
    { label: "Backend", icon: "Storage", internalPort: 3000 },
    { label: "Terminal", icon: "Terminal", internalPort: 7681 },
  ],
  "node-browser": [
    { label: "Backend", icon: "Storage", internalPort: 3000 },
    { label: "Terminal", icon: "Terminal", internalPort: 7681 },
  ],
  "node-react-pg": [
    { label: "Backend", icon: "Storage", internalPort: 3000 },
    { label: "Frontend", icon: "Web", internalPort: 4200 },
    { label: "Database", icon: "Storage", internalPort: 8081 },
    { label: "Terminal", icon: "Terminal", internalPort: 7681 },
  ],
};

/**
 * Well-known port mappings used when parsing EXPOSE lines from a custom
 * Dockerfile. `null` discards a port (internal tooling).
 */
const PORT_SERVICE_MAP = {
  8080: { label: "Web", icon: "Web" },
  5173: { label: "Frontend", icon: "Web" },
  3000: { label: "Backend", icon: "Storage" },
  3001: { label: "Backend", icon: "Storage" },
  4096: null, // opencode port, not user-facing
};

/**
 * Parse EXPOSE instructions from a raw Dockerfile string into service entries.
 */
export function parseDockerfileExposedPorts(dockerfileContent) {
  const seen = new Set();
  const services = [];
  for (const line of (dockerfileContent || "").split("\n")) {
    const match = line.trim().match(/^EXPOSE\s+(.+)/i);
    if (!match) continue;
    for (const token of match[1].split(/\s+/)) {
      const port = parseInt(token.split("/")[0], 10);
      if (isNaN(port) || seen.has(port)) continue;
      seen.add(port);
      if (Object.prototype.hasOwnProperty.call(PORT_SERVICE_MAP, port)) {
        const mapping = PORT_SERVICE_MAP[port];
        if (mapping !== null) {
          services.push({ label: mapping.label, icon: mapping.icon, internalPort: port });
        }
      } else {
        services.push({ label: `Port ${port}`, icon: "Widgets", internalPort: port });
      }
    }
  }
  return services;
}

/** Indices of services sharing the same port. */
export function getDuplicatePortIndices(services) {
  const portMap = {};
  const duplicates = new Set();
  services.forEach((s, i) => {
    const port = s.internalPort;
    if (port === "" || port === undefined || port === null) return;
    if (portMap[port] !== undefined) {
      duplicates.add(portMap[port]);
      duplicates.add(i);
    } else {
      portMap[port] = i;
    }
  });
  return duplicates;
}
