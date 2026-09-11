import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Delta from 'quill-delta';
import { Navbar } from '../components/Header/Navbar';
import { Toolbar } from '../components/Editor/Toolbar';
import { EditorCanvas } from '../components/Editor/EditorCanvas';
import { ShareModal } from '../components/Modals/ShareModal';
import { VersionHistoryModal } from '../components/Modals/VersionHistoryModal';
import { SplitViewSimulator } from '../components/Demo/SplitViewSimulator';
import { ClientOTManager } from '../ot/client-ot';
import { useAuth } from '../context/AuthContext';

export const DocumentPage = ({ docId, onBackToDashboard }) => {
  const { user, token } = useAuth();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('Saved to Cloud');
  const [isSaving, setIsSaving] = useState(false);
  const [activeCollaborators, setActiveCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [quillInstance, setQuillInstance] = useState(null);

  // Modals state
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSplitActive, setIsSplitActive] = useState(false);
  const [isSyncScroll, setIsSyncScroll] = useState(false);

  const socketRef = useRef(null);
  const otManagerRef = useRef(null);
  const quillRef = useRef(null);
  const masterWorkspaceRef = useRef(null);
  const simWorkspaceRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // 1. Fetch document metadata & access check
  useEffect(() => {
    fetchDocument();
  }, [docId]);

  const fetchDocument = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Could not load document');
      }
      setDoc(data.document);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Initialize Socket.io connection and OT manager
  useEffect(() => {
    if (!docId || !token) return;

    const socket = io('/', {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // console.log('[Socket] Connected to server, joining doc:', docId);
      socket.emit('join-document', { docId });
    });

    socket.on('join-error', ({ message }) => {
      setError(message);
    });

    // Document init from server
    socket.on('document-init', ({ title, content, version, role, canEdit, isOwner, activeCollaborators }) => {
      setDoc(prev => ({
        ...prev,
        title,
        content,
        version,
        permissions: { role, canEdit, isOwner }
      }));
      setActiveCollaborators(activeCollaborators || []);

      // If Quill is already mounted, load content
      if (quillRef.current) {
        quillRef.current.setContents(new Delta(content), 'silent');
      }

      // Initialize Client OT Manager
      const otManager = new ClientOTManager({
        socket,
        docId,
        baseVersion: version,
        onApplyRemoteOp: (remoteOp) => {
          if (quillRef.current) {
            quillRef.current.updateContents(remoteOp, 'silent');
          }
        },
        onStatusChange: (status) => {
          if (status === 'Saving...') {
            setIsSaving(true);
            setSaveStatus('Saving changes...');
          } else {
            setIsSaving(false);
            setSaveStatus('All changes saved to cloud');
          }
        }
      });
      otManagerRef.current = otManager;
    });

    // Another collaborator joined
    socket.on('user-joined', (newCollaborator) => {
      setActiveCollaborators(prev => {
        const filtered = prev.filter(c => c.socketId !== newCollaborator.socketId);
        return [...filtered, newCollaborator];
      });
    });

    // A collaborator left
    socket.on('user-left', ({ socketId }) => {
      setActiveCollaborators(prev => prev.filter(c => c.socketId !== socketId));
      setRemoteCursors(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    // Remote cursor movement
    socket.on('cursor-update', ({ socketId, user: cursorUser, range }) => {
      setRemoteCursors(prev => ({
        ...prev,
        [socketId]: { user: cursorUser, range }
      }));
    });

    // Permission denied on attempt to edit as viewer
    socket.on('permission-denied', ({ message }) => {
      alert(`[RBAC Notice] ${message}`);
    });

    return () => {
      socket.emit('leave-document', { docId });
      socket.disconnect();
      if (otManagerRef.current) {
        otManagerRef.current.destroy();
      }
    };
  }, [docId, token]);

  const handleInitQuill = (q) => {
    setQuillInstance(q);
    quillRef.current = q;
    if (doc?.content && q.getText().trim() === '') {
      q.setContents(new Delta(doc.content), 'silent');
    }
  };

  // Handle local text change in Quill
  const handleTextChange = (delta) => {
    if (doc?.permissions?.role === 'viewer') return;
    if (otManagerRef.current) {
      otManagerRef.current.submitLocalOp(delta);
    }
  };

  // Handle local cursor / selection change
  const handleSelectionChange = (range) => {
    if (socketRef.current && range) {
      socketRef.current.emit('cursor-move', { docId, range });
    }
  };

  // Update title
  const handleTitleChange = async (newTitle) => {
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle })
      });
      const data = await res.json();
      if (data.success) {
        setDoc(prev => ({ ...prev, title: data.title }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Version Restore
  const handleRestoreVersion = (newContent, newVersion) => {
    if (quillRef.current) {
      quillRef.current.setContents(new Delta(newContent), 'silent');
    }
    if (otManagerRef.current) {
      otManagerRef.current.version = newVersion;
    }
  };

  // Export handlers
  const handleExport = (format) => {
    if (!quillRef.current) return;
    const text = quillRef.current.getText();
    const html = quillRef.current.root.innerHTML;
    let filename = `${doc?.title || 'document'}`;
    let blob, ext;

    if (format === 'markdown') {
      ext = '.md';
      const md = `# ${doc?.title}\n\n${text}`;
      blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    } else if (format === 'text') {
      ext = '.txt';
      blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    } else if (format === 'html') {
      ext = '.html';
      const fullHtml = `<!DOCTYPE html><html><head><title>${doc?.title}</title><meta charset="utf-8"></head><body style="max-width:800px;margin:2rem auto;font-family:sans-serif;line-height:1.6;"><h1>${doc?.title}</h1>${html}</body></html>`;
      blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    }

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', color: 'var(--text-tertiary)' }}>
        Loading document & initializing real-time engine...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)', padding: '2rem' }}>
        <h2 style={{ color: 'var(--accent-rose)', marginBottom: '1rem' }}>Unable to open document</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
        <button className="btn btn-primary" onClick={onBackToDashboard}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  const isReadOnly = doc?.permissions?.role === 'viewer';

  const handleMasterScroll = (e) => {
    if (isSyncScroll && simWorkspaceRef.current) {
      simWorkspaceRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleSimScroll = (e) => {
    if (isSyncScroll && masterWorkspaceRef.current) {
      masterWorkspaceRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const scrollMasterToTop = () => {
    if (masterWorkspaceRef.current) {
      masterWorkspaceRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollSimToTop = () => {
    if (simWorkspaceRef.current) {
      simWorkspaceRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <Navbar
        documentTitle={doc?.title}
        onTitleChange={handleTitleChange}
        saveStatus={saveStatus}
        isSaving={isSaving}
        userRole={doc?.permissions?.role || 'editor'}
        activeCollaborators={activeCollaborators}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onToggleSplitDemo={() => setIsSplitActive(!isSplitActive)}
        onExport={handleExport}
        isSplitActive={isSplitActive}
        onBackToDashboard={onBackToDashboard}
      />

      {/* Editor Formatting Toolbar */}
      <Toolbar quill={quillInstance} readOnly={isReadOnly} />

      {/* Main Workspace (Normal or Split View) */}
      <div className={isSplitActive ? "split-view-container" : "single-view-container"}>
        {/* Left Pane: Main User */}
        <div className={isSplitActive ? "split-pane" : "single-pane"}>
          {isSplitActive && (
            <div className="split-pane-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  backgroundColor: user?.color || 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 600
                }}>
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {user?.name} ({doc?.permissions?.role?.toUpperCase()})
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  fontWeight: 600
                }}>
                  MASTER CLIENT
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className={`toolbar-btn-pill ${isSyncScroll ? 'active' : ''}`}
                  onClick={() => {
                    const next = !isSyncScroll;
                    setIsSyncScroll(next);
                    if (next && masterWorkspaceRef.current && simWorkspaceRef.current) {
                      simWorkspaceRef.current.scrollTop = masterWorkspaceRef.current.scrollTop;
                    }
                  }}
                  title="Keep both panes scrolled to the exact same position"
                >
                  🔗 Sync Scroll: {isSyncScroll ? 'ON' : 'OFF'}
                </button>
                <button
                  className="toolbar-btn-pill"
                  onClick={scrollMasterToTop}
                  title="Scroll Master Client to top of document"
                >
                  ↑ Top
                </button>
              </div>
            </div>
          )}
          <EditorCanvas
            initialContent={doc?.content}
            onInitQuill={handleInitQuill}
            onTextChange={handleTextChange}
            onSelectionChange={handleSelectionChange}
            readOnly={isReadOnly}
            remoteCursors={remoteCursors}
            workspaceRef={masterWorkspaceRef}
            onScroll={handleMasterScroll}
          />
        </div>

        {/* Right Pane: Simulated Collaborator */}
        {isSplitActive && (
          <SplitViewSimulator
            docId={docId}
            mainUser={user}
            mainToken={token}
            onClose={() => setIsSplitActive(false)}
            workspaceRef={simWorkspaceRef}
            onScroll={handleSimScroll}
            onScrollToTop={scrollSimToTop}
          />
        )}
      </div>

      {/* Share & Permissions RBAC Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        docId={docId}
        isOwner={doc?.permissions?.isOwner}
        collaborators={doc?.collaborators || []}
        isPublic={doc?.isPublic}
        publicRole={doc?.publicRole}
        onCollaboratorsUpdate={(updated) => {
          setDoc(prev => ({ ...prev, collaborators: updated }));
        }}
      />

      {/* Version History Drawer */}
      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        docId={docId}
        isOwner={doc?.permissions?.isOwner}
        onRestoreVersion={handleRestoreVersion}
      />
    </div>
  );
};
