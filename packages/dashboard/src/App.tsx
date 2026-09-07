import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { AuditLog } from "./pages/AuditLog";
import { LiveFeed } from "./pages/LiveFeed";
import { Login } from "./pages/Login";
import { PolicyEditor } from "./pages/PolicyEditor";

/** PolicyEditor is the only screen behind auth (spec §10.3). */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LiveFeed />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route
            path="/policies"
            element={
              <RequireAuth>
                <PolicyEditor />
              </RequireAuth>
            }
          />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}