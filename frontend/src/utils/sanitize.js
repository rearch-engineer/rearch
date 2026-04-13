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

/**
 * Validates and returns a URL only if it is safe for use in an <img src>.
 * - Allows blob: URLs for local previews.
 * - Allows http/https only when the pathname looks like an image file.
 */
export const sanitizeImageUrl = (url) => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);

    if (parsed.protocol === "blob:") {
      return url;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return undefined;
    }

    const imagePathPattern = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
    return imagePathPattern.test(parsed.pathname) ? url : undefined;
  } catch {
    return undefined;
  }
};
