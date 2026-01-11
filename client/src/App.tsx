import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Report } from './pages/Report';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
        {/* Navbar could go here */}
        <nav className="fixed top-0 w-full p-4 flex justify-between items-center z-50 pointer-events-none">
          <div className="pointer-events-auto">
            {/* Logo placeholder if needed */}
          </div>
        </nav>

        <main className="relative z-10">
          <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 pointer-events-none" />

          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/report/:scanId" element={<Report />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
