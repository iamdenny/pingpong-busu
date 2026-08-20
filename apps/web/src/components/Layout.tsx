import {
  Link,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { appVersion } from "../lib/appVersion";
import { isDemoMode, isDevLiveMode } from "../lib/runtime";
import { feedbackRepository } from "../lib/runtime";
import { FeedbackDialog } from "./FeedbackDialog";
import { SearchForm } from "./SearchForm";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  // 홈은 히어로 검색을 쓰므로 머리글 검색은 나머지 화면에서만 제공한다.
  const showsHeaderSearch = location.pathname !== "/";
  return (
    <div className="app-shell">
      {/* 새 화면은 위에서 시작하고, 뒤로 가면 보던 위치로 돌아온다. */}
      <ScrollRestoration />
      {isDemoMode && (
        <div className="demo-banner" role="status">
          현재 화면은 개발용 가상 데이터입니다.
        </div>
      )}
      {isDevLiveMode && (
        <div className="live-dev-banner" role="status">
          개발용 실시간 검색 · 애즈트리 공개 기록을 출처와 함께 표시합니다.
        </div>
      )}
      <header className="site-header">
        <Link to="/" className="brand" aria-label="BUSU 홈" viewTransition>
          <img
            src={`${import.meta.env.BASE_URL}busu-logo.png`}
            alt=""
            aria-hidden="true"
          />
          <span>BUSU</span>
          <small>탁구 기록 통합검색</small>
        </Link>
        {showsHeaderSearch && (
          <SearchForm
            key={location.key}
            compact
            initialQuery={
              new URLSearchParams(location.search).get("q")?.trim() ?? ""
            }
            onSearch={(value) => {
              void navigate(`/search?q=${encodeURIComponent(value)}`, {
                viewTransition: true,
              });
            }}
          />
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        <strong>BUSU</strong>
        <p>부수를 판정하지 않고, 판단할 근거를 한곳에 모읍니다.</p>
        <p>
          공개 대회 기록을 출처와 함께 제공하며, 정정 요청은 근거 확인 후
          반영합니다.
        </p>
        <p className="directory-link">
          {/* Static build output, not router routes: full navigations are intended. */}
          <a href={`${import.meta.env.BASE_URL}directory/`}>
            탁구 선수 전체 목록
          </a>
          <a href={`${import.meta.env.BASE_URL}guide/`}>탁구 부수 안내</a>
        </p>
        <FeedbackDialog
          repository={feedbackRepository}
          appVersion={appVersion}
        />
        <small className="app-version">버전 {appVersion}</small>
      </footer>
    </div>
  );
}
