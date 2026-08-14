import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { appVersion } from "./lib/appVersion";
import { runtimeIncidentRepository } from "./lib/runtime";
import { installRuntimeIncidentListeners } from "./lib/runtime-incident-repository";
import "./styles/global.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});
const uninstallRuntimeIncidentListeners = installRuntimeIncidentListeners(
  runtimeIncidentRepository,
  appVersion,
);
if (import.meta.hot) import.meta.hot.dispose(uninstallRuntimeIncidentListeners);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary repository={runtimeIncidentRepository}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
