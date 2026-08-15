const SCRIPT_ID = "umami-analytics";
const PRODUCTION_ANALYTICS_HOST = "analytics.iamdenny.com";
const MAX_PENDING_EVENTS = 50;
const WEBSITE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PLAYER_NAME_PATTERN =
  /^(?:[가-힣]{2,6}|[A-Za-z]{2,30}(?:-[A-Za-z]{1,30})?)$/u;
const KOREAN_REGION_SUFFIX_PATTERN = /^[가-힣]{1,8}(?:시|군|구|도)$/u;
const KOREAN_REGION_LEVEL_PATTERN =
  /^(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)$/u;
const KOREAN_REGION_ALIASES = new Set([
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "수원",
  "용인",
  "성남",
  "고양",
  "화성",
  "창원",
  "청주",
  "천안",
  "전주",
  "포항",
  "김해",
]);

type AnalyticsValue = string | number | boolean;
type AnalyticsData = Readonly<Record<string, AnalyticsValue>>;
interface PendingEvent {
  eventName: string;
  data?: AnalyticsData;
}
const pendingEvents: PendingEvent[] = [];
let analyticsEnabled = false;

interface UmamiTracker {
  track: (eventName: string, data?: AnalyticsData) => void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export interface UmamiConfig {
  scriptUrl: string | undefined;
  websiteId: string | undefined;
}

function validScriptUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isLocal =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    const isProduction =
      url.protocol === "https:" &&
      url.hostname === PRODUCTION_ANALYTICS_HOST &&
      url.port === "";
    return (
      (isLocal || isProduction) &&
      url.pathname === "/script.js" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function flushPendingEvents(): void {
  const tracker = window.umami;
  if (!tracker) return;
  for (const event of pendingEvents.splice(0))
    tracker.track(event.eventName, event.data);
}

export function initUmamiAnalytics(config: UmamiConfig): boolean {
  try {
    const scriptUrl = config.scriptUrl?.trim();
    const websiteId = config.websiteId?.trim();
    if (
      !scriptUrl ||
      !websiteId ||
      !validScriptUrl(scriptUrl) ||
      !WEBSITE_ID_PATTERN.test(websiteId) ||
      document.getElementById(SCRIPT_ID)
    )
      return false;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = scriptUrl;
    script.dataset.websiteId = websiteId;
    // Page views keep only the path. A validated search term is sent separately.
    script.dataset.excludeSearch = "true";
    script.addEventListener("load", flushPendingEvents, { once: true });
    script.addEventListener(
      "error",
      () => {
        analyticsEnabled = false;
        pendingEvents.splice(0);
      },
      { once: true },
    );
    document.head.append(script);
    analyticsEnabled = true;
    return true;
  } catch {
    analyticsEnabled = false;
    pendingEvents.splice(0);
    return false;
  }
}

export function safeSearchTerm(value: string): string | undefined {
  const normalized = value.trim().replace(/\s+/gu, " ");
  const [name = "", ...regionParts] = normalized.split(" ");
  if (!SAFE_PLAYER_NAME_PATTERN.test(name)) return undefined;
  if (regionParts.length === 0) return name;
  if (regionParts.length > 2) return undefined;
  const [first = "", second] = regionParts;
  const validRegion = second
    ? KOREAN_REGION_LEVEL_PATTERN.test(first) &&
      KOREAN_REGION_SUFFIX_PATTERN.test(second)
    : KOREAN_REGION_ALIASES.has(first) ||
      KOREAN_REGION_LEVEL_PATTERN.test(first) ||
      KOREAN_REGION_SUFFIX_PATTERN.test(first);
  if (!validRegion) return undefined;
  return normalized;
}

export function searchResultBucket(count: number): string {
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  return "21+";
}

export function trackAnalyticsEvent(
  eventName: string,
  data?: AnalyticsData,
): void {
  try {
    if (!analyticsEnabled) return;
    if (window.umami) {
      window.umami.track(eventName, data);
      return;
    }
    if (pendingEvents.length >= MAX_PENDING_EVENTS) pendingEvents.shift();
    pendingEvents.push({ eventName, ...(data ? { data } : {}) });
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

export function trackSearchSubmitted(query: string, resultCount: number): void {
  const safeQuery = safeSearchTerm(query);
  if (!safeQuery) return;
  trackAnalyticsEvent("search_submitted", {
    query: safeQuery,
    result_bucket: searchResultBucket(resultCount),
  });
}
