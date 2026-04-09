import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Login from '@/pages/Login';
import Whatsapp from '@/pages/Whatsapp';
import Admin from '@/pages/Admin';

function App() {
  const { init, initialized } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="w-full max-w-md px-6">
          <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-6">
            <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
            <div className="mt-4 h-10 w-full bg-zinc-800 rounded animate-pulse" />
            <div className="mt-3 h-10 w-full bg-zinc-800 rounded animate-pulse" />
            <div className="mt-6 h-10 w-32 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Whatsapp />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
