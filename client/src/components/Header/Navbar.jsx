import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Cloud, CloudOff, Share2, History,
  Download, Moon, Sun, Users, SplitSquareHorizontal,
  ChevronDown, LogOut, ShieldCheck, Eye, Edit3
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Navbar = ({
  documentTitle,
  onTitleChange,
  saveStatus = 'Saved to Cloud',
  isSaving = false,
  userRole = 'editor',
  activeCollaborators = [],
  onOpenShare,
  onOpenHistory,
  onToggleSplitDemo,
  onExport,
  isSplitActive = false,
  onBackToDashboard
}) => {
  const { user, logout } = useAuth();
  const [title, setTitle] = useState(documentTitle || 'Untitled Document');
  const [theme, setTheme] = useState(localStorage.getItem('doc_theme') || 'light');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const exportRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    setTitle(documentTitle || 'Untitled Document');
  }, [documentTitle]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('doc_theme', theme);
  }, [theme]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTitleBlur = () => {
    if (title.trim() !== documentTitle && onTitleChange) {
      onTitleChange(title.trim());
    }
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'owner':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'rgba(37, 99, 235, 0.1)',
            color: '#2563eb',
            fontWeight: 600,
            textTransform: 'uppercase'
          }}>
            <ShieldCheck size={11} /> Owner
          </span>
        );
      case 'editor':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#059669',
            fontWeight: 600,
            textTransform: 'uppercase'
          }}>
            <Edit3 size={11} /> Editor
          </span>
        );
      case 'viewer':
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#d97706',
            fontWeight: 600,
            textTransform: 'uppercase'
          }}>
            <Eye size={11} /> Viewer
          </span>
        );
    }
  };

  return (
    <header className="navbar">
      {/* Left: Brand & Document Info */}
      <div className="navbar-left">
        <div className="brand-logo" onClick={onBackToDashboard} title="Back to Documents">
          <div className="brand-icon">
            <FileText size={18} />
          </div>
          <span style={{ letterSpacing: '-0.02em' }}>DocSync</span>
        </div>

        <div className="doc-info-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              className="doc-title-input"
              value={title}
              disabled={userRole === 'viewer'}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              title={userRole === 'viewer' ? 'Read-only mode' : 'Click to rename document'}
            />
            {getRoleBadge(userRole)}
          </div>

          <div className="doc-status-indicator">
            <div className={`doc-status-dot ${isSaving ? 'saving' : ''}`} />
            <span>{isSaving ? 'Saving changes...' : saveStatus}</span>
          </div>
        </div>
      </div>

      {/* Right: Presence Avatars & Actions */}
      <div className="navbar-right">
        {/* Active Collaborator Presence Avatar Stack */}
        <div className="avatar-stack" title={`${activeCollaborators.length} active editor(s)`}>
          {activeCollaborators.map((c, idx) => (
            <div
              key={c.socketId || idx}
              className="avatar-stack-item"
              style={{ backgroundColor: c.user?.color || '#2563eb' }}
              title={`${c.user?.name || 'Collaborator'} (${c.role})`}
            >
              {(c.user?.name || 'U').charAt(0).toUpperCase()}
              <div className={`avatar-role-badge ${c.role === 'viewer' ? 'viewer' : ''}`} />
            </div>
          ))}
        </div>

        {/* Split Screen Multi-User Simulator Demo Button */}
        <button
          className={`btn ${isSplitActive ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onToggleSplitDemo}
          title="Simulate 2 simultaneous collaborators side-by-side"
          style={{ gap: '6px' }}
        >
          <SplitSquareHorizontal size={15} />
          <span>{isSplitActive ? 'Exit Split View' : 'Simulate 2 Editors'}</span>
        </button>

        {/* Version History Button */}
        <button
          className="btn btn-secondary"
          onClick={onOpenHistory}
          title="Inspect version history and snapshots"
        >
          <History size={15} />
          <span>History</span>
        </button>

        {/* Share Button (RBAC) */}
        <button
          className="btn btn-primary"
          onClick={onOpenShare}
          title="Manage document permissions and share link"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          <Share2 size={15} />
          <span>Share</span>
        </button>

        {/* Export Dropdown */}
        <div style={{ position: 'relative' }} ref={exportRef}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowExportMenu(!showExportMenu)}
            title="Download document"
          >
            <Download size={15} />
            <ChevronDown size={13} />
          </button>

          {showExportMenu && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--modal-shadow)',
              padding: '0.4rem',
              minWidth: '160px',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', border: 'none', width: '100%', fontSize: '0.8rem' }}
                onClick={() => { onExport('markdown'); setShowExportMenu(false); }}
              >
                Markdown (.md)
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', border: 'none', width: '100%', fontSize: '0.8rem' }}
                onClick={() => { onExport('text'); setShowExportMenu(false); }}
              >
                Plain Text (.txt)
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', border: 'none', width: '100%', fontSize: '0.8rem' }}
                onClick={() => { onExport('html'); setShowExportMenu(false); }}
              >
                Web Page (.html)
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', border: 'none', width: '100%', fontSize: '0.8rem' }}
                onClick={() => { window.print(); setShowExportMenu(false); }}
              >
                Print / Save as PDF
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          className="toolbar-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* User Profile / Logout */}
        <div style={{ position: 'relative' }} ref={userRef}>
          <div
            className="avatar-stack-item"
            style={{
              backgroundColor: user?.color || '#2563eb',
              cursor: 'pointer',
              marginLeft: 0
            }}
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={user?.name || 'User Profile'}
          >
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </div>

          {showUserMenu && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--modal-shadow)',
              padding: '0.75rem',
              minWidth: '200px',
              zIndex: 60
            }}>
              <div style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user?.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{user?.email}</div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--accent-rose)', border: 'none' }}
                onClick={() => { setShowUserMenu(false); logout(); }}
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
