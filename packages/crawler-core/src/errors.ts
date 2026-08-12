export class SourceError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = new.target.name; }
}
export class SourceDisabledError extends SourceError { constructor(message = '출처가 비활성화되어 있습니다.') { super('source_disabled', message); } }
export class SourceTimeoutError extends SourceError { constructor(message = '출처 요청 시간이 초과되었습니다.') { super('source_timeout', message); } }
export class SourceBlockedError extends SourceError { constructor(message = '출처 접근이 차단되었습니다.') { super('source_blocked', message); } }
export class SourceParseError extends SourceError { constructor(message = '출처 응답을 해석하지 못했습니다.') { super('source_parse_error', message); } }
export class SourceSchemaChangedError extends SourceError { constructor(message = '출처 페이지 구조가 변경된 것으로 보입니다.') { super('source_schema_changed', message); } }
export class SourceRateLimitedError extends SourceError { constructor(message = '출처 요청 제한에 도달했습니다.') { super('source_rate_limited', message); } }
export class SourceUnsupportedError extends SourceError { constructor(message = '실시간 조회를 지원하지 않는 출처입니다.') { super('source_unsupported', message); } }

export function mapSourceError(error: unknown): SourceError {
  if (error instanceof SourceError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new SourceTimeoutError();
  return new SourceParseError(error instanceof Error ? error.message : '알 수 없는 출처 오류');
}
