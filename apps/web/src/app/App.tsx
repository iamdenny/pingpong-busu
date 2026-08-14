import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppRouteError } from "../components/AppErrorBoundary";
import { Layout } from "../components/Layout";
import { runtimeIncidentRepository } from "../lib/runtime";
import { HomePage } from "../pages/HomePage";
import { PlayerDetailPage } from "../pages/PlayerDetailPage";
import { SearchResultsPage } from "../pages/SearchResultsPage";
export const router = createHashRouter([
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
]);
export function App() {
  return <RouterProvider router={router} />;
}
