import { useState, useEffect } from "react";

const TOKEN_KEY = "auth_token";

/**
 * Fetches a URL with the JWT Authorization header and returns a blob URL
 * suitable for use as an <img src> or similar. Revokes the blob URL on
 * unmount / URL change to avoid memory leaks.
 */
export default function useAuthSrc(url) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!url) return;

    let revoked = false;
    const token = localStorage.getItem(TOKEN_KEY);

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!revoked) {
          setBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => {
        /* image will render as broken — nothing useful to surface here */
      });

    return () => {
      revoked = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [url]);

  return blobUrl;
}

/**
 * Fetch a file with JWT auth and open it in a new browser tab.
 * Works for both images and non-image files.
 */
export function openAuthFile(url, filename) {
  const token = localStorage.getItem(TOKEN_KEY);

  fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    })
    .catch(() => {
      /* silently fail */
    });
}
