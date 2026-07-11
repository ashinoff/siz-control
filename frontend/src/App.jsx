import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import { Spinner } from "./components/ui.jsx";
import Layout from "./components/Layout.jsx";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import InventoryList from "./pages/InventoryList.jsx";
import Warehouse from "./pages/Warehouse.jsx";
import Employees from "./pages/Employees.jsx";
import Issue from "./pages/Issue.jsx";
import Return from "./pages/Return.jsx";
import Move from "./pages/Move.jsx";
import Verify from "./pages/Verify.jsx";
import Writeoff from "./pages/Writeoff.jsx";
import DeadlineControl from "./pages/DeadlineControl.jsx";
import Reports from "./pages/Reports.jsx";
import Journal from "./pages/Journal.jsx";
import Catalog from "./pages/Catalog.jsx";
import Users from "./pages/Users.jsx";
import Norms from "./pages/Norms.jsx";
import Compliance from "./pages/Compliance.jsx";
import OtDeadlines from "./pages/OtDeadlines.jsx";
import OtReport from "./pages/OtReport.jsx";
import Import from "./pages/Import.jsx";
import ImportIssued from "./pages/ImportIssued.jsx";
import Backup from "./pages/Backup.jsx";
import DbCheck from "./pages/DbCheck.jsx";
import Trash from "./pages/Trash.jsx";
import Documents from "./pages/Documents.jsx";

// В iframe платформы не показываем свою форму логина — при отказе «Нет доступа».
const EMBEDDED = typeof window !== "undefined" && window.self !== window.top;

function SsoLoading() {
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: "center" }}>
        <Spinner />
        <div style={{ marginTop: 12, color: "var(--text-muted)" }}>Вход через платформу…</div>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: "center" }}>
        <h2>Нет доступа</h2>
        <div style={{ marginTop: 10, color: "var(--text-muted)" }}>
          У вашей учётной записи нет доступа к этому приложению.<br />
          Обратитесь к администратору.
        </div>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading, ssoPending } = useAuth();
  if (ssoPending) return <SsoLoading />;
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleGuard({ allow, children }) {
  const { roleCode } = useAuth();
  if (!allow.includes(roleCode)) return <Navigate to="/" replace />;
  return children;
}

const PRIV = ["admin", "lab", "sue"];

export default function App() {
  const { user, loading, ssoPending } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          ssoPending ? <SsoLoading /> : loading ? <Spinner /> : user ? <Navigate to="/" replace /> : EMBEDDED ? <AccessDenied /> : <Login />
        }
      />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/all" element={<InventoryList key="all" scope="all" />} />
        <Route path="/ppe" element={<InventoryList key="ppe" scope="ppe" />} />
        <Route path="/materials" element={<InventoryList key="material" scope="material" />} />
        <Route path="/equipment" element={<InventoryList key="equipment" scope="equipment" />} />
        <Route path="/warehouse" element={<Warehouse />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/issue" element={<Issue />} />
        <Route path="/return" element={<Return />} />
        <Route
          path="/move"
          element={
            <RoleGuard allow={PRIV}>
              <Move />
            </RoleGuard>
          }
        />
        <Route
          path="/verify"
          element={
            <RoleGuard allow={PRIV}>
              <Verify />
            </RoleGuard>
          }
        />
        <Route path="/writeoff" element={<Writeoff />} />
        <Route path="/norms" element={<Norms />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/ot/deadlines" element={<OtDeadlines />} />
        <Route path="/ot/report" element={<OtReport />} />
        <Route path="/deadlines" element={<DeadlineControl />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/documents" element={<Documents />} />
        <Route
          path="/catalog"
          element={
            <RoleGuard allow={PRIV}>
              <Catalog />
            </RoleGuard>
          }
        />
        <Route
          path="/import"
          element={
            <RoleGuard allow={["admin"]}>
              <Import />
            </RoleGuard>
          }
        />
        <Route
          path="/import-issued"
          element={
            <RoleGuard allow={["admin"]}>
              <ImportIssued />
            </RoleGuard>
          }
        />
        <Route
          path="/dbcheck"
          element={
            <RoleGuard allow={["admin"]}>
              <DbCheck />
            </RoleGuard>
          }
        />
        <Route
          path="/trash"
          element={
            <RoleGuard allow={["admin"]}>
              <Trash />
            </RoleGuard>
          }
        />
        <Route
          path="/backup"
          element={
            <RoleGuard allow={["admin"]}>
              <Backup />
            </RoleGuard>
          }
        />
        <Route
          path="/users"
          element={
            <RoleGuard allow={["admin"]}>
              <Users />
            </RoleGuard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
