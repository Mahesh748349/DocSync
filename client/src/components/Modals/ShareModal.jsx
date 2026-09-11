import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Link2, Check, Shield, Trash2, Globe, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const ShareModal = ({
  isOpen,
  onClose,
  docId,
  isOwner = false,
  collaborators = [],
  isPublic = false,
  publicRole = 'viewer',
  onCollaboratorsUpdate
}) => {
  const { token, user } = useAuth();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [currentCollaborators, setCurrentCollaborators] = useState(collaborators);
  const [currentIsPublic, setCurrentIsPublic] = useState(isPublic);
  const [currentPublicRole, setCurrentPublicRole] = useState(publicRole);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCurrentCollaborators(collaborators);
    setCurrentIsPublic(isPublic);
    setCurrentPublicRole(publicRole);
  }, [collaborators, isPublic, publicRole]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/document/${docId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/documents/${docId}/collaborators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to invite collaborator');
      }
      setCurrentCollaborators(data.collaborators);
      if (onCollaboratorsUpdate) onCollaboratorsUpdate(data.collaborators);
      setInviteEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`/api/documents/${docId}/collaborators/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentCollaborators(data.collaborators);
        if (onCollaboratorsUpdate) onCollaboratorsUpdate(data.collaborators);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    try {
      const res = await fetch(`/api/documents/${docId}/collaborators/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCurrentCollaborators(data.collaborators);
        if (onCollaboratorsUpdate) onCollaboratorsUpdate(data.collaborators);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePublicAccess = async (isPub, role) => {
    try {
      const res = await fetch(`/api/documents/${docId}/sharing`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isPublic: isPub, publicRole: role })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentIsPublic(data.isPublic);
        setCurrentPublicRole(data.publicRole);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} />
            </div>
            <h3 className="modal-title">Share Document & Permissions</h3>
          </div>
          <button className="toolbar-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Invite Form (Owner Only) */}
          {isOwner ? (
            <form onSubmit={handleInvite}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Add people and groups
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.85rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-subtle)',
                    outline: 'none'
                  }}
                  required
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{
                    padding: '0.55rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-subtle)',
                    fontWeight: 500
                  }}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  <UserPlus size={14} /> Invite
                </button>
              </div>
              {error && <div style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', marginTop: '6px' }}>{error}</div>}
            </form>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.5rem', background: 'var(--bg-surface-subtle)', borderRadius: '6px' }}>
              Only the document owner can add or modify collaborators.
            </div>
          )}

          {/* Collaborator List */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              People with access
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {currentCollaborators.map((c, idx) => {
                const colUser = c.user || {};
                const isItemOwner = c.role === 'owner';
                return (
                  <div key={colUser._id || idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-subtle)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: colUser.color || '#2563eb',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.8rem'
                      }}>
                        {(colUser.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          {colUser.name} {colUser._id === user?.id && '(You)'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          {colUser.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isItemOwner ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                          Owner
                        </span>
                      ) : isOwner ? (
                        <>
                          <select
                            value={c.role}
                            onChange={(e) => handleRoleChange(colUser._id, e.target.value)}
                            style={{
                              fontSize: '0.8rem',
                              padding: '2px 6px',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              background: 'var(--bg-surface)'
                            }}
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            className="toolbar-btn"
                            style={{ color: 'var(--accent-rose)' }}
                            onClick={() => handleRemoveCollaborator(colUser._id)}
                            title="Remove access"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {c.role}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* General Access / Link Sharing */}
          <div style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: currentIsPublic ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-surface-subtle)',
                color: currentIsPublic ? '#10b981' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {currentIsPublic ? <Globe size={18} /> : <Lock size={18} />}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {currentIsPublic ? 'Anyone with the link' : 'Restricted'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {currentIsPublic
                    ? `Anyone with this link can ${currentPublicRole}`
                    : 'Only added collaborators can access'}
                </div>
              </div>
            </div>

            {isOwner && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={currentIsPublic ? currentPublicRole : 'restricted'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'restricted') {
                      handleTogglePublicAccess(false, 'viewer');
                    } else {
                      handleTogglePublicAccess(true, val);
                    }
                  }}
                  style={{
                    fontSize: '0.8rem',
                    padding: '4px 8px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    background: 'var(--bg-surface)'
                  }}
                >
                  <option value="restricted">Restricted</option>
                  <option value="viewer">Anyone (Viewer)</option>
                  <option value="editor">Anyone (Editor)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCopyLink}>
            {copied ? <Check size={14} color="#10b981" /> : <Link2 size={14} />}
            <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
