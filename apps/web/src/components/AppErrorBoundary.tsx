import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { appVersion } from "../lib/appVersion";
import {
  runtimeIncidentInput,
  type RuntimeIncidentRepository,
} from "../lib/runtime-incident-repository";

interface AppErrorBoundaryProps {
  children: ReactNode;
  repository: RuntimeIncidentRepository;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

function ErrorRecoveryView() {
  return (
    <main className="app-error" role="alert">
      <p className="eyebrow">일시적인 오류</p>
      <h1>화면을 표시하지 못했습니다</h1>
      <p>
        오류 정보는 개인정보 없이 전달되었습니다. 페이지를 다시 불러와 주세요.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        다시 불러오기
      </button>
    </main>
  );
}

export function AppRouteError({
  repository,
}: {
  repository: RuntimeIncidentRepository;
}) {
  useEffect(() => {
    void repository
      .report(runtimeIncidentInput("render_error", appVersion))
      .catch(() => undefined);
  }, [repository]);
  return <ErrorRecoveryView />;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void error;
    void info;
    void this.props.repository
      .report(runtimeIncidentInput("render_error", appVersion))
      .catch(() => undefined);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <ErrorRecoveryView />;
  }
}
