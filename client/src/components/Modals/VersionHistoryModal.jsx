import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw, Plus, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const VersionHistoryModal = ({
  isOpen,
  onClose,
  docId,
  isOwner = false,
  onRestoreVersion
}) => {
  const { token } = useAuth();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkpointDesc, setCheckpointDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen && docId) {
      fetchSnapshots();
    }
  }, [isOpen, docId]);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSnapshots(data.snapshots || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCheckpoint = async (e) => {
    e.preventDefault();
    if (!checkpointDesc.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ description: checkpointDesc.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setSnapshots([data.snapshot, ...snapshots]);
        setCheckpointDesc('');
        setMessage('Snapshot checkpoint created!');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (version) => {
    if (!window.confirm(`Are you sure you want to restore Document to Version ${version}?`)) {
      return;
    }
    setRestoring(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ version })
      });
      const data = await res.json();
      if (data.success) {
        if (onRestoreVersion) {
          onRestoreVersion(data.content, data.newVersion);
        }
        setMessage(`Restored to version ${version}!`);
        setTimeout(() => {
          setMessage('');
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className={`drawer-container ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="drawer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} color="var(--primary)" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Version History</h3>
        </div>
        <button className="toolbar-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Checkpoint creator form */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-subtle)' }}>
        <form onSubmit={handleCreateCheckpoint} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            placeholder="Name this version snapshot..."
            value={checkpointDesc}
            onChange={(e) => setCheckpointDesc(e.target.value)}
            style={{
              flex: 1,
              padding: '0.45rem 0.75rem',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
              fontSize: '0.85rem'
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={isCreating} style={{ padding: '0.45rem 0.75rem' }}>
            <Plus size={14} /> Save
          </button>
        </form>
        {message && (
          <div style={{ color: 'var(--accent-green)', fontSize: '0.8rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={12} /> {message}
          </div>
        )}
      </div>

      {/* Snapshot List */}
      <div className="drawer-list">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            Loading history...
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            No snapshots recorded yet. Click Save above to create one.
          </div>
        ) : (
          snapshots.map((snap) => (
            <div key={snap.id || snap.version} className="version-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'var(--primary-subtle)',
                  color: 'var(--primary)'
                }}>
                  Version {snap.version}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} />
                  {new Date(snap.createdAt).toLocaleDateString()} {new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {snap.description || 'Autosave checkpoint'}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                Saved by {snap.savedByName || 'User'}
              </div>

              {isOwner && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '0.75rem', padding: '4px 8px' }}
                  onClick={() => handleRestore(snap.version)}
                  disabled={restoring}
                >
                  <RotateCcw size={12} /> Restore this version
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
