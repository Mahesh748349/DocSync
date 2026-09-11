import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Quill from 'quill';
import Delta from 'quill-delta';
import { ClientOTManager } from '../../ot/client-ot';
import { Sparkles, Shield, User, X } from 'lucide-react';

export const SplitViewSimulator = ({ docId, mainUser, onClose }) => {
  const [simUser, setSimUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState('editor');
  const simEditorRef = useRef(null);
  const simQuillRef = useRef(null);
  const simSocketRef = useRef(null);
  const simOtManagerRef = useRef(null);

  useEffect(() => {
    // 1. Create a guest collaborator session
    const setupSimCollaborator = async () => {
      try {
        const guestRes = await fetch('/api/auth/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Sarah Connor (Simulated Editor)' })
        });
        const guestData = await guestRes.json();
        if (!guestData.success) return;

        setSimUser(guestData.user);

        // 2. Connect distinct Socket.io instance
        const socket = io('/', {
          auth: { token: guestData.token }
        });
        simSocketRef.current = socket;

        // 3. Initialize Quill editor
        if (simEditorRef.current && !simQuillRef.current) {
          const quill = new Quill(simEditorRef.current, {
            theme: 'snow',
            modules: { toolbar: false },
            placeholder: 'Simulated user typing area...'
          });
          simQuillRef.current = quill;

          socket.on('connect', () => {
            setConnected(true);
            socket.emit('join-document', { docId });
          });

          socket.on('document-init', ({ content, version }) => {
            quill.setContents(new Delta(content), 'silent');

            // 4. Initialize OT Manager for simulated client
            const otManager = new ClientOTManager({
              socket,
              docId,
              baseVersion: version,
              onApplyRemoteOp: (remoteOp, author) => {
                quill.updateContents(remoteOp, 'silent');
              }
            });
            simOtManagerRef.current = otManager;

            // Handle user typing
            quill.on('text-change', (delta, oldDelta, source) => {
              if (source === 'user') {
                otManager.submitLocalOp(delta);
              }
            });

            // Handle cursor position
            quill.on('selection-change', (range, oldRange, source) => {
              if (source === 'user' && range) {
                socket.emit('cursor-move', { docId, range });
              }
            });
          });
        }
      } catch (err) {
        console.error('Failed to setup simulated user:', err);
      }
    };

    setupSimCollaborator();

    return () => {
      if (simSocketRef.current) {
        simSocketRef.current.disconnect();
      }
    };
  }, [docId]);

  return (
    <div className="split-pane">
      {/* Header */}
      <div className="split-pane-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: simUser?.color || '#dc2626',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 600
          }}>
            S
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {simUser?.name || 'Simulated Editor'}
            </span>
            <span style={{
              marginLeft: '6px',
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              color: '#059669',
              fontWeight: 600
            }}>
              LIVE PEER
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            {connected ? '● Connected via WebSocket' : '○ Connecting...'}
          </span>
          <button className="toolbar-btn" onClick={onClose} title="Close Split View">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'var(--bg-app)' }}>
        <div style={{
          background: 'var(--bg-surface)',
          boxShadow: 'var(--doc-shadow)',
          borderRadius: 'var(--radius-sm)',
          padding: '2rem',
          minHeight: '600px'
        }}>
          <div ref={simEditorRef} />
        </div>
      </div>

      {/* Bottom prompt */}
      <div style={{
        padding: '0.6rem 1rem',
        background: 'var(--bg-surface-subtle)',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={13} color="var(--primary)" />
          <span>Type on either side to witness instantaneous OT convergence!</span>
        </div>
        <span style={{ color: 'var(--text-tertiary)' }}>Independent Socket Connection</span>
      </div>
    </div>
  );
};
