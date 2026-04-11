import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { Report } from './pages/Report';
import { GroupList } from './pages/GroupList';
import { SystemDashboard } from './pages/SystemDashboard';
import { Database } from 'lucide-react';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
        <nav className="fixed top-0 w-full p-4 flex justify-between items-center z-50 pointer-events-none">
          <div className="pointer-events-auto flex gap-4 bg-slate-900/50 backdrop-blur border border-slate-800 p-2 rounded-xl">
            <Link to="/" className="px-3 py-1 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all">Home</Link>
            <Link to="/groups" className="px-3 py-1 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all">Past Scans</Link>
            <Link to="/system" className="px-3 py-1 flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
              <Database className="w-4 h-4" /> System
            </Link>
          </div>
        </nav>

        <main className="relative z-10 pt-16">
          <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 pointer-events-none" />

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/groups" element={<GroupList />} />
            <Route path="/system" element={<SystemDashboard />} />
            <Route path="/report/:scanId" element={<Report />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
