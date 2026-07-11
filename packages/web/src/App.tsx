import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { ProjectDetail } from "./pages/ProjectDetail";
import { QueueDetail } from "./pages/QueueDetail";
import { JobDetail } from "./pages/JobDetail";
import { DeadLetterQueue } from "./pages/DeadLetterQueue";
import { Workers } from "./pages/Workers";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workers"
          element={
            <ProtectedRoute>
              <Workers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/dead-letter-jobs"
          element={
            <ProtectedRoute>
              <DeadLetterQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/queues/:queueId"
          element={
            <ProtectedRoute>
              <QueueDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId/queues/:queueId/jobs/:jobId"
          element={
            <ProtectedRoute>
              <JobDetail />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
