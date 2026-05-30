import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BuildLive } from './pages/BuildLive';
import { IdeaStream } from './pages/IdeaStream';
import { IdeaDetail } from './pages/IdeaDetail';
import { ProjectDetail } from './pages/ProjectDetail';
import { Session } from './pages/Session';
import { Settings } from './pages/Settings';
import { Auth } from './pages/Auth';
import { ProjectPulls } from './pages/ProjectPulls';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { isLoggedIn } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/buildlive" />} />
          <Route path="/buildlive" element={<BuildLive />} />
          <Route path="/buildlive/:id" element={<ProjectDetail />} />
          <Route path="/buildlive/:id/pulls" element={isLoggedIn() ? <ProjectPulls /> : <Navigate to="/auth" />} />
          <Route path="/ideastream" element={<IdeaStream />} />
          <Route path="/ideastream/:id" element={<IdeaDetail />} />
          <Route path="/session/:id" element={isLoggedIn() ? <Session /> : <Navigate to="/auth" />} />
          <Route path="/settings" element={isLoggedIn() ? <Settings /> : <Navigate to="/auth" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
