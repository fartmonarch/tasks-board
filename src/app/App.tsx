import "./App.css";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ProjectInvitationPage } from "../features/projects/pages/ProjectInvitationPage";
import { ProjectsPage } from "../features/projects/pages/ProjectsPage";
import { BoardPage } from "../features/tasks/pages/BoardPage";
import {
  decodeProjectId,
  encodeProjectId,
} from "../features/projects/projectIdCodec";

function ProjectBoardRoute() {
  const { projectRef } = useParams();
  const projectId = decodeProjectId(projectRef);
  if (!projectId) return <Navigate to="/projects" replace />;

  const compactProjectRef = encodeProjectId(projectId);
  if (projectRef !== compactProjectRef) {
    return (
      <Navigate
        to={`/projects/${compactProjectRef}/board`}
        replace
      />
    );
  }

  return <BoardPage projectId={projectId} />;
}

function ShortBoardPathRedirect() {
  const { projectId } = useParams();
  const decodedProjectId = decodeProjectId(projectId);
  if (!decodedProjectId) return <Navigate to="/projects" replace />;

  return (
    <Navigate
      to={`/projects/${encodeProjectId(decodedProjectId)}/board`}
      replace
    />
  );
}

function App() {
  return (
    <Routes>
      <Route path="/invite" element={<ProjectInvitationPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/all" element={<ProjectsPage showAll />} />
      <Route
        path="/projects/:projectRef/board"
        element={<ProjectBoardRoute />}
      />
      <Route
        path="/p/:projectId"
        element={<ShortBoardPathRedirect />}
      />
      <Route path="/" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
export default App;