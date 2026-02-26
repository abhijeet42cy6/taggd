import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Upload } from './pages/Upload';
import { ProjectDetail } from './pages/ProjectDetail';
import { Search, Bell, HelpCircle } from 'lucide-react';

const App = () => {
  return (
    <Router>
      <div className="flex min-h-screen bg-[#121212] text-foreground font-sans selection:bg-primary/30">
        <Sidebar />

        <main className="flex-1 ml-56 min-h-screen flex flex-col">
          {/* Main Topbar */}
          <nav className="h-12 border-b border-[#2e2e2e] flex items-center justify-between px-6 sticky top-0 bg-[#121212]/90 backdrop-blur-xl z-40">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative max-w-xs w-full group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={12} />
                <input
                  type="text"
                  placeholder="Global search..."
                  className="w-full bg-[#1c1c1c] border border-[#2e2e2e] rounded-md py-1 pl-8 pr-4 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all font-medium"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 border-r border-[#2e2e2e] pr-4 mr-2">
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-[#1f1f1f]">
                  <Bell size={14} />
                </button>
                <button className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-[#1f1f1f]">
                  <HelpCircle size={14} />
                </button>
              </div>
              <div className="w-6 h-6 rounded-full bg-zinc-800 border border-[#2e2e2e] flex items-center justify-center text-[10px] font-bold text-zinc-400">
                AD
              </div>
            </div>
          </nav>

          {/* Core Layout Container */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/audit" element={<div className="p-20 text-center text-muted-foreground font-mono text-xs">Waiting for audit stream...</div>} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </Router>
  );
};

export default App;
