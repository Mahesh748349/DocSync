import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import Delta from 'quill-delta';
import { ClientOTManager } from '../../ot/client-ot';
import { Sparkles, X, AlertCircle, RefreshCw } from 'lucide-react';

// Register QuillCursors module
if (!Quill.imports['modules/cursors']) {
  Quill.register('modules/cursors', QuillCursors);
}

export const SplitViewSimulator = ({ docId, mainUser, mainToken, onClose }) => {
  const [simUser, setSimUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initializing simulated peer...');
  
  const simEditorRef = useRef(null);
  const simQuillRef = useRef(null);
  const simSocketRef = useRef(null);
  const simOtManagerRef = useRef(null);
  const cursorsModuleRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const setupSimCollaborator = async () => {
      try {
        setLoading(true);
        setStatusMessage('Creating authenticated simulator peer...');

        // 1. Authorize a simulated peer session on this document
        const res = await fetch(`/api/documents/${docId}/simulate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mainToken}`
          }
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to setup simulator session');
        }

        if (!isMounted) return;
        setSimUser(data.user);
        setStatusMessage('Connecting WebSocket gateway...');

        // 2. Connect independent Socket.io client
        const socket = io('/', {
          auth: { token: data.token }
        });
        simSocketRef.current = socket;

        // 3. Initialize Quill instance for simulated user if container exists
        if (simEditorRef.current && !simQuillRef.current) {
          const quill = new Quill(simEditorRef.current, {
            theme: 'snow',
            modules: {
              toolbar: false,
              cursors: {
                transformOnTextChange: true
              }
            },
            placeholder: 'Type here as Sarah Connor... Your keystrokes and red cursor will appear live in the Master Client!'
          });
          simQuillRef.current = quill;
          cursorsModuleRef.current = quill.getModule('cursors');

          // Click-to-open links inside editor
          simEditorRef.current.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
              e.preventDefault();
              window.open(link.href, '_blank', 'noopener,noreferrer');
            }
          });
        }

        socket.on('connect', () => {
          if (!isMounted) return;
          setConnected(true);
          setStatusMessage('Joining document room...');
          socket.emit('join-document', { docId });
        });

        socket.on('join-error', ({ message }) => {
          if (!isMounted) return;
          setError(`Join error: ${message}`);
          setLoading(false);
        });

        // Document initialized from server
        socket.on('document-init', ({ content, version }) => {
          if (!isMounted) return;
          setLoading(false);
          setStatusMessage('Synchronized');

          if (simQuillRef.current) {
            simQuillRef.current.setContents(new Delta(content), 'silent');
          }

          // 4. Initialize OT Manager for simulated client
          const otManager = new ClientOTManager({
            socket,
            docId,
            baseVersion: version,
            onApplyRemoteOp: (remoteOp) => {
              if (simQuillRef.current) {
                simQuillRef.current.updateContents(remoteOp, 'silent');
              }
            },
            onStatusChange: (status) => {
              if (isMounted) setStatusMessage(status);
            }
          });
          simOtManagerRef.current = otManager;

          // Handle local typing in simulated editor
          simQuillRef.current.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
              otManager.submitLocalOp(delta);
              // Transmit live cursor movement immediately
              const sel = simQuillRef.current.getSelection();
              if (sel) {
                socket.emit('cursor-move', { docId, range: sel });
              }
            }
          });

          // Handle selection changes
          simQuillRef.current.on('selection-change', (range, oldRange, source) => {
            if (source === 'user' && range) {
              socket.emit('cursor-move', { docId, range });
            }
          });
        });

        // 5. Receive remote cursors (from the Master User)
        socket.on('cursor-update', ({ socketId, user: cursorUser, range }) => {
          if (!cursorsModuleRef.current || !cursorUser) return;
          const cursors = cursorsModuleRef.current;
          let cursor = cursors.cursors().find(c => c.id === socketId);
          if (!cursor) {
            cursors.createCursor(socketId, cursorUser.name || 'Master User', cursorUser.color || '#2563eb');
          }
          if (range) {
            cursors.moveCursor(socketId, range);
          }
        });

        socket.on('user-left', ({ socketId }) => {
          if (cursorsModuleRef.current) {
            cursorsModuleRef.current.removeCursor(socketId);
          }
        });

      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    setupSimCollaborator();

    return () => {
      isMounted = false;
      if (simSocketRef.current) {
        simSocketRef.current.emit('leave-document', { docId });
        simSocketRef.current.disconnect();
      }
      if (simOtManagerRef.current) {
        simOtManagerRef.current.destroy();
      }
    };
  }, [docId, mainToken]);

  return (
    <div className="split-pane">
      {/* Header */}
      <div className="split-pane-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: simUser?.color || '#ef4444',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            S
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {simUser?.name || 'Sarah Connor'}
            </span>
            <span style={{
              marginLeft: '8px',
              fontSize: '0.7rem',
              padding: '2px 7px',
              borderRadius: '4px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              fontWeight: 700,
              letterSpacing: '0.5px'
            }}>
              LIVE PEER
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontSize: '0.75rem',
            color: connected ? 'var(--accent-green)' : 'var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: connected ? 'var(--accent-green)' : 'var(--accent-amber)',
              display: 'inline-block'
            }} />
            {loading ? statusMessage : (connected ? 'Peer Active' : 'Connecting...')}
          </span>
          <button className="toolbar-btn" onClick={onClose} title="Close Split View">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Editor Canvas Area */}
      <div className="editor-workspace" style={{ background: 'var(--bg-app)' }}>
        {error ? (
          <div style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--accent-rose)',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--doc-shadow)',
            maxWidth: '500px',
            margin: '2rem auto'
          }}>
            <AlertCircle size={32} style={{ margin: '0 auto 1rem', display: 'block' }} />
            <h4 style={{ marginBottom: '0.5rem' }}>Simulator Connection Error</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        ) : (
          <div
            className="document-page-canvas"
            style={{
              borderTop: '3px solid #ef4444',
              position: 'relative'
            }}
          >
            {loading && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                zIndex: 10,
                color: 'var(--text-secondary)',
                fontSize: '0.9rem'
              }}>
                <RefreshCw size={24} className="spin" style={{ color: '#ef4444' }} />
                <span>{statusMessage}</span>
              </div>
            )}
            <div ref={simEditorRef} />
          </div>
        )}
      </div>

      {/* Bottom Footer Callout */}
      <div style={{
        padding: '0.65rem 1rem',
        background: 'var(--bg-surface-subtle)',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={14} color="#ef4444" />
          <span>Type on <strong>either side</strong> to see real-time OT sync & colored cursors!</span>
        </div>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>
          Independent WebSocket + OT State Machine
        </span>
      </div>
    </div>
  );
};
