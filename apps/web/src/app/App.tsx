import { createHashRouter, RouterProvider } from "react-router-dom";
import { Layout } from "../components/Layout";
import { HomePage } from "../pages/HomePage";
import { PlayerDetailPage } from "../pages/PlayerDetailPage";
import { SearchResultsPage } from "../pages/SearchResultsPage";
export const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
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
