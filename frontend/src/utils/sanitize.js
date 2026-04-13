/**
 * Validates and returns a URL only if it uses a safe protocol.
 * Returns undefined for invalid or potentially dangerous URLs.
 */
export const sanitizeUrl = (url) => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "blob:"].includes(parsed.protocol)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
};
