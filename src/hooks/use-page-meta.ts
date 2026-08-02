import { useEffect } from "react";

const SITE_NAME = "Creative Home Decor";
const DEFAULT_TITLE = `${SITE_NAME} - Premium Home Textiles for Global Retailers`;
const DEFAULT_DESCRIPTION =
  "Export-focused home textile manufacturer serving US and global markets. High-quality cotton-based products with consistent production standards.";

/**
 * Sets the document title and meta description for a page.
 * Falls back to the site-wide defaults when no values are given.
 */
export function usePageMeta(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;

    const content = description || DEFAULT_DESCRIPTION;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = content;
  }, [title, description]);
}
