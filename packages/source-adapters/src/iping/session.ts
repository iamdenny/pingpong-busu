export type IpingSessionPage =
  "authenticated" | "guest" | "challenge" | "unknown";

const ipingSessionIdPattern = /^[A-Za-z0-9,-]{16,128}$/u;

export function extractIpingSessionId(html: string): string | undefined {
  for (const input of html.matchAll(/<input\b[^>]*>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of input[0].matchAll(
      /\b(name|value)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu,
    )) {
      attributes.set(
        attribute[1]?.toLocaleLowerCase() ?? "",
        attribute[2] ?? attribute[3] ?? attribute[4] ?? "",
      );
    }
    if (attributes.get("name") !== "PHPSESSID") continue;
    const sessionId = attributes.get("value");
    return sessionId && ipingSessionIdPattern.test(sessionId)
      ? sessionId
      : undefined;
  }
  return undefined;
}

export function extractIpingSessionCookie(html: string): string | undefined {
  const sessionId = extractIpingSessionId(html);
  return sessionId ? `PHPSESSID=${sessionId}` : undefined;
}

export function extractIpingSessionCookieFromHeader(
  header: string | null,
): string | undefined {
  if (!header) return undefined;
  const sessionId = /(?:^|[,\n]\s*)PHPSESSID=([^;,\s]+)/iu.exec(header)?.[1];
  return sessionId && ipingSessionIdPattern.test(sessionId)
    ? `PHPSESSID=${sessionId}`
    : undefined;
}

export function extractIpingSessionIdFromCookie(
  cookie: string,
): string | undefined {
  const sessionId = /^PHPSESSID=([^;]+)$/u.exec(cookie)?.[1];
  return sessionId && ipingSessionIdPattern.test(sessionId)
    ? sessionId
    : undefined;
}

export function classifyIpingSessionHtml(html: string): IpingSessionPage {
  if (/자동등록방지|Please prove that you are human/iu.test(html)) {
    return "challenge";
  }
  if (
    (html.includes('name="Mid"') && html.includes('name="Pwd"')) ||
    /href=(['"])[^'"]*\?pg=login(?:[&#'"])/iu.test(html)
  ) {
    return "guest";
  }
  if (/mb_logout\.php|[?&]pg=logout(?:[&#'"])|로그아웃/iu.test(html)) {
    return "authenticated";
  }
  return "unknown";
}
