import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const siteMetadata = {
  name: "BUSU",
  url: "https://busu.iamdenny.com/",
  imageUrl: "https://busu.iamdenny.com/busu-logo.png",
  imageAlt: "탁구 라켓과 부수 단계를 표현한 BUSU 로고",
} as const;

interface PageMetadataProps {
  title: string;
  description: string;
  type?: "website" | "profile";
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

export function buildCanonicalUrl(pathname: string, search: string): string {
  const url = new URL(siteMetadata.url);
  if (pathname !== "/" || search) url.hash = `${pathname}${search}`;
  return url.href;
}

export function PageMetadata({
  title,
  description,
  type = "website",
}: PageMetadataProps) {
  const location = useLocation();

  useEffect(() => {
    const canonicalUrl = buildCanonicalUrl(location.pathname, location.search);
    document.title = title;
    upsertCanonical(canonicalUrl);
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:locale", "ko_KR");
    upsertMeta("property", "og:site_name", siteMetadata.name);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", siteMetadata.imageUrl);
    upsertMeta("property", "og:image:secure_url", siteMetadata.imageUrl);
    upsertMeta("property", "og:image:width", "512");
    upsertMeta("property", "og:image:height", "512");
    upsertMeta("property", "og:image:alt", siteMetadata.imageAlt);
    upsertMeta("name", "twitter:card", "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", siteMetadata.imageUrl);
    upsertMeta("name", "twitter:image:alt", siteMetadata.imageAlt);
  }, [description, location.pathname, location.search, title, type]);

  return null;
}
