import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api";
import type { Project } from "../api";
import { ApiError } from "../api/client";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const page = await api.listProjects();
    setProjects(page.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.createProject(name);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Each project owns its own queues, retry policies, and jobs.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        {error && <div className="error-banner">{error}</div>}
        <form className="form-inline" onSubmit={handleCreate}>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="projectName">New project name</label>
            <input id="projectName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create project"}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">No projects yet. Create one above to get started.</div>
      ) : (
        <div className="list">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="row" style={{ color: "inherit" }}>
              <span className="row-title">{p.name}</span>
              <span className="row-meta">{new Date(p.createdAt).toLocaleDateString()}</span>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
