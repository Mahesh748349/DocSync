import React, { useState, useEffect } from 'react';
import {
  FileText, Plus, Search, Trash2, MoreVertical,
  Users, Globe, Clock, Shield, Sparkles, Moon, Sun,
  LogOut, FilePlus2, BookOpen
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Dashboard = ({ onSelectDocument }) => {
  const { user, token, logout } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'owned' | 'shared'
  const [theme, setTheme] = useState(localStorage.getItem('doc_theme') || 'light');
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (template = 'blank') => {
    let title = 'Untitled Document';
    if (template === 'project-proposal') title = 'Project Proposal: Distributed Editor';
    if (template === 'meeting-notes') title = 'Sprint Planning & Architecture Sync';

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title, template })
      });
      const data = await res.json();
      if (data.success && onSelectDocument) {
        onSelectDocument(data.document.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (docId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this document?')) {
      return;
    }
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('doc_theme', next);
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'owned') return doc.isOwner;
    if (activeTab === 'shared') return !doc.isOwner;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <header className="navbar">
        <div className="navbar-left">
          <div className="brand-logo">
            <div className="brand-icon">
              <FileText size={18} />
            </div>
            <span>DocSync</span>
          </div>

          <div style={{ position: 'relative', width: '360px', marginLeft: '1.5rem' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 1rem 0.5rem 2.25rem',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface-subtle)',
                outline: 'none',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>

        <div className="navbar-right">
          <button className="toolbar-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          <div style={{ position: 'relative' }}>
            <div
              className="avatar-stack-item"
              style={{ backgroundColor: user?.color || '#2563eb', cursor: 'pointer', marginLeft: 0 }}
              onClick={() => setShowUserMenu(!showUserMenu)}
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

      {/* Main Body */}
      <main style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Template Gallery Header */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
            Start a new document
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {/* Blank Doc */}
            <div
              onClick={() => handleCreate('blank')}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '140px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-subtle)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <Plus size={22} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Blank document</span>
            </div>

            {/* Project Proposal Template */}
            <div
              onClick={() => handleCreate('project-proposal')}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '140px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-purple)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <BookOpen size={20} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Project Proposal</span>
            </div>

            {/* Meeting Notes Template */}
            <div
              onClick={() => handleCreate('meeting-notes')}
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                height: '140px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-green)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <FilePlus2 size={20} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Meeting Notes</span>
            </div>
          </div>
        </section>

        {/* Documents Section */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600 }}>
              Recent Documents
            </h2>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-surface-subtle)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
              <button
                onClick={() => setActiveTab('all')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: activeTab === 'all' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'all' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('owned')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: activeTab === 'owned' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'owned' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'owned' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                Owned by me
              </button>
              <button
                onClick={() => setActiveTab('shared')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: activeTab === 'shared' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'shared' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: activeTab === 'shared' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                Shared with me
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-tertiary)' }}>
              Loading documents...
            </div>
          ) : filteredDocs.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border-strong)'
            }}>
              <FileText size={40} color="var(--text-tertiary)" style={{ marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No documents found</h3>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                Create a blank document above to start real-time collaborating!
              </p>
              <button className="btn btn-primary" onClick={() => handleCreate('blank')}>
                <Plus size={15} /> Create Document
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
              {filteredDocs.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '150px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--doc-shadow)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--primary-subtle)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={18} />
                      </div>
                      {doc.isOwner && (
                        <button
                          className="toolbar-btn"
                          style={{ color: 'var(--text-tertiary)' }}
                          onClick={(e) => handleDelete(doc.id, e)}
                          title="Delete document"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                    </div>

                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      background: doc.isOwner ? 'rgba(37, 99, 235, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: doc.isOwner ? '#2563eb' : '#059669',
                      textTransform: 'uppercase'
                    }}>
                      {doc.userRole}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
