/**
 * App shell — top-level router.
 *
 * All three routes mount inside the F-21 AppLayout (ShellBar + SideNav +
 * main content). The default '/' route redirects to /customer because
 * the customer workspace is the demo entry point. F-11/F-12/F-13 own
 * the three child routes; the chrome is layout-only and carries no
 * per-route data-testid so HAPPY-6 three-workspace separation holds.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@components/shell/AppLayout';
import CustomerRoute from '@routes/customer';
import AdminRoute from '@routes/admin';
import InternalRoute from '@routes/internal';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/customer" replace />} />
        <Route path="/customer" element={<CustomerRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/internal" element={<InternalRoute />} />
      </Route>
    </Routes>
  );
}
