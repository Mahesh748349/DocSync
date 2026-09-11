import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import QuillCursors from 'quill-cursors';
import Delta from 'quill-delta';
import { Shield, Sparkles, AlertCircle, ExternalLink, Copy, Check, Unlink } from 'lucide-react';

// Register QuillCursors module
if (!Quill.imports['modules/cursors']) {
  Quill.register('modules/cursors', QuillCursors);
}

export const EditorCanvas = ({
  initialContent,
  onInitQuill,
  onTextChange,
  onSelectionChange,
  readOnly = false,
  remoteCursors = {},
  workspaceRef,
  onScroll
}) => {
  const editorRef = useRef(null);
  const quillInstanceRef = useRef(null);
  const cursorsModuleRef = useRef(null);
  const [stats, setStats] = useState({ words: 0, chars: 0, readTime: '1 min' });
  const [activeLink, setActiveLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editorRef.current || quillInstanceRef.current) return;

    // Initialize Quill
    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: false, // Custom toolbar
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

      if (range) {
        const format = quill.getFormat(range);
        if (format.link) {
          const bounds = quill.getBounds(range.index, range.length || 1);
          if (bounds) {
            setActiveLink({
              url: format.link,
              top: bounds.bottom + 10,
              left: Math.max(10, bounds.left),
              range
            });
            return;
          }
        }
      }
      setActiveLink(null);
    });

    // Direct click and Ctrl+Click handler on quill.root
    const handleRootClick = (e) => {
      const target = e.target;
      const link = (target.nodeType === 3 ? target.parentElement : target)?.closest('a');

      if (link && link.href) {
        // If Ctrl or Cmd or Alt is held, or in read-only mode, open immediately!
        if (e.ctrlKey || e.metaKey || readOnly) {
          e.preventDefault();
          window.open(link.href, '_blank', 'noopener,noreferrer');
          return;
        }

        // Show floating link preview card right beneath the link
        const linkRect = link.getBoundingClientRect();
        const editorRect = editorRef.current.getBoundingClientRect();
        setActiveLink({
          url: link.href,
          top: linkRect.bottom - editorRect.top + 10,
          left: Math.max(10, linkRect.left - editorRect.left),
          range: quill.getSelection()
        });
      } else {
        if (!target.closest('.link-floating-tooltip')) {
          setActiveLink(null);
        }
      }
    };

    quill.root.addEventListener('click', handleRootClick);

    updateStats(quill);

    if (onInitQuill) {
      onInitQuill(quill);
    }

    return () => {
      quill.root.removeEventListener('click', handleRootClick);
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
    <div
      className="editor-workspace"
      ref={workspaceRef}
      onScroll={onScroll}
    >
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
      <div
        className="document-page-canvas"
        style={{
          borderTopLeftRadius: readOnly ? 0 : '6px',
          borderTopRightRadius: readOnly ? 0 : '6px',
          position: 'relative'
        }}
      >
        <div ref={editorRef} />

        {/* Google Docs-style Floating Link Preview Card */}
        {activeLink && (
          <div
            className="link-floating-tooltip"
            style={{
              top: `${activeLink.top}px`,
              left: `${activeLink.left}px`
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '220px' }}>
              <ExternalLink size={13} color="var(--primary)" />
              <a
                href={activeLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-tooltip-url"
                title={activeLink.url}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(activeLink.url, '_blank', 'noopener,noreferrer');
                }}
              >
                {activeLink.url}
              </a>
            </div>

            <div className="link-tooltip-actions">
              <button
                type="button"
                className="link-tooltip-btn primary-action"
                title="Open website in new tab"
                onClick={() => window.open(activeLink.url, '_blank', 'noopener,noreferrer')}
              >
                Open ↗
              </button>
              <button
                type="button"
                className="link-tooltip-btn"
                title="Copy link"
                onClick={() => {
                  navigator.clipboard.writeText(activeLink.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="link-tooltip-btn text-danger"
                  title="Remove link"
                  onClick={() => {
                    if (quillInstanceRef.current && activeLink.range) {
                      quillInstanceRef.current.formatText(
                        activeLink.range.index,
                        activeLink.range.length || 1,
                        'link',
                        false,
                        'user'
                      );
                    }
                    setActiveLink(null);
                  }}
                >
                  Unlink
                </button>
              )}
            </div>
            <span className="link-tooltip-hint">(Ctrl+Click to open)</span>
          </div>
        )}
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
