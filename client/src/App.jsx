import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { AuthModal } from './components/Auth/AuthModal';
import { Dashboard } from './pages/Dashboard';
import { DocumentPage } from './pages/DocumentPage';
import { FileText } from 'lucide-react';

export function App() {
  const { user, loading } = useAuth();
  const [currentDocId, setCurrentDocId] = useState(null);

  useEffect(() => {
    // Check if URL has a document ID e.g. /document/12345
    const path = window.location.pathname;
    const match = path.match(/\/document\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      setCurrentDocId(match[1]);
    }

    const handlePopState = () => {
      const p = window.location.pathname;
      const m = p.match(/\/document\/([a-zA-Z0-9]+)/);
      if (m && m[1]) {
        setCurrentDocId(m[1]);
      } else {
        setCurrentDocId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToDoc = (docId) => {
    setCurrentDocId(docId);
    window.history.pushState({}, '', `/document/${docId}`);
  };

  const navigateToDashboard = () => {
    setCurrentDocId(null);
    window.history.pushState({}, '', '/');
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-primary)'
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          marginBottom: '1rem',
          animation: 'pulse 1.5s infinite'
        }}>
          <FileText size={24} />
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>Initializing DocSync...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  if (currentDocId) {
    return (
      <DocumentPage
        docId={currentDocId}
        onBackToDashboard={navigateToDashboard}
      />
    );
  }

  return <Dashboard onSelectDocument={navigateToDoc} />;
}
export default App;
