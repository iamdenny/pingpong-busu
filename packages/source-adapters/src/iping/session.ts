export type IpingSessionPage =
  "authenticated" | "guest" | "challenge" | "unknown";

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
