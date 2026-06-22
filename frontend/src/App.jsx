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
import DeadlineControl from "./pages/DeadlineControl.jsx";
import Reports from "./pages/Reports.jsx";
import Journal from "./pages/Journal.jsx";
import Catalog from "./pages/Catalog.jsx";
import Users from "./pages/Users.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
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
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Spinner /> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
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
        <Route path="/deadlines" element={<DeadlineControl />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/journal" element={<Journal />} />
        <Route
          path="/catalog"
          element={
            <RoleGuard allow={PRIV}>
              <Catalog />
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
