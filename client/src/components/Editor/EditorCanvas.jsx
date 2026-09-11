import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import Delta from 'quill-delta';
import { Shield, Sparkles, AlertCircle } from 'lucide-react';

// Register QuillCursors module
Quill.register('modules/cursors', QuillCursors);

export const EditorCanvas = ({
  initialContent,
  onInitQuill,
  onTextChange,
  onSelectionChange,
  readOnly = false,
  remoteCursors = {}
}) => {
  const editorRef = useRef(null);
  const quillInstanceRef = useRef(null);
  const cursorsModuleRef = useRef(null);
  const [stats, setStats] = useState({ words: 0, chars: 0, readTime: '1 min' });

  useEffect(() => {
    if (!editorRef.current || quillInstanceRef.current) return;

    // Initialize Quill
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: false, // We use our custom toolbar
        cursors: {
          transformOnTextChange: true
        },
        history: {
          delay: 1000,
          maxStack: 100,
          userOnly: true
        }
      },
      placeholder: 'Start writing your document... Real-time collaboration is live!',
      readOnly: readOnly
    });

    quillInstanceRef.current = quill;
    cursorsModuleRef.current = quill.getModule('cursors');

    // Set initial content if provided
    if (initialContent && Array.isArray(initialContent)) {
      quill.setContents(new Delta(initialContent), 'silent');
    }

    // Text change listener
    quill.on('text-change', (delta, oldDelta, source) => {
      updateStats(quill);
      if (source === 'user' && onTextChange) {
        onTextChange(delta);
      }
    });

    // Selection / Cursor change listener
    quill.on('selection-change', (range, oldRange, source) => {
      if (source === 'user' && onSelectionChange) {
        onSelectionChange(range);
      }
    });

    // Click-to-open links in new tab
    const handleLinkClick = (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        e.preventDefault();
        window.open(link.href, '_blank', 'noopener,noreferrer');
      }
    };

    const node = editorRef.current;
    if (node) {
      node.addEventListener('click', handleLinkClick);
    }

    updateStats(quill);

    if (onInitQuill) {
      onInitQuill(quill);
    }

    return () => {
      if (node) {
        node.removeEventListener('click', handleLinkClick);
      }
    };
  }, []);

  // Update read-only state dynamically if permissions change
  useEffect(() => {
    if (quillInstanceRef.current) {
      quillInstanceRef.current.enable(!readOnly);
    }
  }, [readOnly]);

  // Update remote cursors on canvas
  useEffect(() => {
    if (!cursorsModuleRef.current) return;
    const cursors = cursorsModuleRef.current;

    // Prune stale cursors for disconnected peers
    const activeIds = Object.keys(remoteCursors);
    cursors.cursors().forEach(c => {
      if (!activeIds.includes(c.id)) {
        cursors.removeCursor(c.id);
      }
    });

    Object.entries(remoteCursors).forEach(([socketId, cursorData]) => {
      if (!cursorData || !cursorData.user) return;
      const { user, range } = cursorData;
      
      let cursor = cursors.cursors().find(c => c.id === socketId);
      if (!cursor) {
        cursors.createCursor(socketId, user.name || 'Collaborator', user.color || '#2563eb');
      }

      if (range) {
        cursors.moveCursor(socketId, range);
      }
    });
  }, [remoteCursors]);

  const updateStats = (quill) => {
    const text = quill.getText();
    const chars = text.replace(/\n$/, '').length;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.ceil(words / 200)) + ' min read';
    setStats({ words, chars, readTime });
  };

  return (
    <div className="editor-workspace">
      {readOnly && (
        <div className="read-only-banner" style={{ width: '100%', maxWidth: '850px', borderRadius: '8px 8px 0 0', marginBottom: '-1px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>Viewing Mode: You do not have permissions to edit this document.</span>
          </div>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Contact the owner to request edit access</span>
        </div>
      )}

      {/* Main Document Paper Canvas */}
      <div className="document-page-canvas" style={{ borderTopLeftRadius: readOnly ? 0 : '6px', borderTopRightRadius: readOnly ? 0 : '6px' }}>
        <div ref={editorRef} />
      </div>

      {/* Document Footer Bar with Live Stats and OT Concurrency Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '850px',
        padding: '0.75rem 1rem',
        fontSize: '0.8rem',
        color: 'var(--text-tertiary)',
        borderTop: '1px solid var(--border-subtle)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <span>{stats.words} words</span>
          <span>{stats.chars} characters</span>
          <span>{stats.readTime}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: 500 }}>
          <Shield size={13} />
          <span>OT Engine Active &bull; Eventual Consistency Guaranteed</span>
        </div>
      </div>
    </div>
  );
};
