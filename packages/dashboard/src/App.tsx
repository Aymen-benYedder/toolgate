import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuditLog } from "./pages/AuditLog";
import { LiveFeed } from "./pages/LiveFeed";
import { Login } from "./pages/Login";
import { PolicyEditor } from "./pages/PolicyEditor";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LiveFeed />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/policies" element={<PolicyEditor />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}