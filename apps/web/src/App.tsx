import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BuildLive } from './pages/BuildLive';
import { IdeaStream } from './pages/IdeaStream';
import { IdeaDetail } from './pages/IdeaDetail';
import { ProjectDetail } from './pages/ProjectDetail';
import { Session } from './pages/Session';
import { Settings } from './pages/Settings';
import { Account } from './pages/Account';
import { Privacy } from './pages/Privacy';
import { Messages } from './pages/Messages';
import { Auth } from './pages/Auth';
import { ProjectPulls } from './pages/ProjectPulls';
import { Maker } from './pages/Maker';
import { Makers } from './pages/Makers';
import { Publish } from './pages/Publish';
import { Landing } from './pages/Landing';
import { useAuth } from './hooks/useAuth';

function Home() {
  const { isLoggedIn } = useAuth();
  if (isLoggedIn()) return <Navigate to="/buildlive" replace />;
  return <Landing />;
}

function AppShell() {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn()) return <Navigate to="/" replace />;
  return <Layout />;
}

export default function App() {
  const { isLoggedIn } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
        <Route element={<AppShell />}>
          <Route path="/buildlive" element={<BuildLive />} />
          <Route path="/buildlive/:id" element={<ProjectDetail />} />
          <Route path="/buildlive/:id/pulls" element={isLoggedIn() ? <ProjectPulls /> : <Navigate to="/auth" />} />
          <Route path="/ideastream" element={<IdeaStream />} />
          <Route path="/ideastream/:id" element={<IdeaDetail />} />
          <Route path="/u/:handle" element={<Maker />} />
          <Route path="/makers" element={<Makers />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="/publish/:id" element={<Publish />} />
          <Route path="/session/:id" element={<Session />} />
          <Route path="/account" element={<Account />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/messages" element={<Messages />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
