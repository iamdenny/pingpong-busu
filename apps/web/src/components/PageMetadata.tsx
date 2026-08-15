import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  buildCanonicalUrl,
  buildPageMetadata,
  siteMetadata,
} from "../lib/pageMetadata";

export { buildCanonicalUrl, siteMetadata } from "../lib/pageMetadata";

interface PageMetadataProps {
  title: string;
  description: string;
  type?: "website" | "profile";
  robots?: "index,follow" | "noindex,follow";
}

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): void {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function upsertCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }
  element.href = href;
}

export function PageMetadata({
  title,
  description,
  type = "website",
  robots,
}: PageMetadataProps) {
  const location = useLocation();

  useEffect(() => {
    const metadata = buildPageMetadata(
      location.pathname,
      title,
      description,
      type,
      robots,
    );
    const canonicalUrl = buildCanonicalUrl(location.pathname);
    document.title = title;
    upsertCanonical(canonicalUrl);
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", metadata.robots);
    upsertMeta("property", "og:locale", "ko_KR");
    upsertMeta("property", "og:site_name", siteMetadata.name);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", siteMetadata.imageUrl);
    upsertMeta("property", "og:image:secure_url", siteMetadata.imageUrl);
    upsertMeta("property", "og:image:type", "image/png");
    upsertMeta("property", "og:image:width", "1200");
    upsertMeta("property", "og:image:height", "630");
    upsertMeta("property", "og:image:alt", siteMetadata.imageAlt);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", siteMetadata.imageUrl);
    upsertMeta("name", "twitter:image:alt", siteMetadata.imageAlt);
  }, [description, location.pathname, location.search, robots, title, type]);

  return null;
}
