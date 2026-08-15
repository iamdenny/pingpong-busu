import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppRouteError } from "../components/AppErrorBoundary";
import { Layout } from "../components/Layout";
import { runtimeIncidentRepository } from "../lib/runtime";
import { migrateLegacyHashRoute, routerBasename } from "../lib/browserRouting";
import { HomePage } from "../pages/HomePage";
import { PlayerDetailPage } from "../pages/PlayerDetailPage";
import { SearchResultsPage } from "../pages/SearchResultsPage";
migrateLegacyHashRoute();

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      errorElement: <AppRouteError repository={runtimeIncidentRepository} />,
      children: [
        { index: true, element: <HomePage /> },
        { path: "search", element: <SearchResultsPage /> },
        { path: "players/:id", element: <PlayerDetailPage /> },
      ],
    },
  ],
  { basename: routerBasename(import.meta.env.BASE_URL) },
);
export function App() {
  return <RouterProvider router={router} />;
}
