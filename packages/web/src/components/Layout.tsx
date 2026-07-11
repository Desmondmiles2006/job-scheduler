import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          Job Scheduler
        </Link>

        <nav>
          <div className="nav-section-label">Workspace</div>
          <Link to="/">Projects</Link>
          <br />
          <Link to="/workers">Workers</Link>
        </nav>

        <div className="org-badge">
          <div>{user?.name}</div>
          <div className="mono" style={{ opacity: 0.7 }}>
            {user?.email}
          </div>
          <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
