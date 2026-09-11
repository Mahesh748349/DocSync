const { Delta } = require('./delta');
const { transform } = require('./transform');
const Document = require('../models/Document');
const VersionSnapshot = require('../models/VersionSnapshot');

class OTServer {
  constructor() {
    // In-memory cache of actively edited documents: docId -> DocSession
    this.sessions = new Map();
    this.SAVE_DEBOUNCE_MS = 2000;
  }

  /**
   * Retrieves or initializes an active editing session for a document
   */
  async getOrCreateSession(docId) {
    const id = docId.toString();
    if (this.sessions.has(id)) {
      return this.sessions.get(id);
    }

    const doc = await Document.findById(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }

    const session = {
      docId: id,
      content: new Delta(doc.content && doc.content.length > 0 ? doc.content : [{ insert: '\n' }]),
      version: doc.version || 0,
      title: doc.title,
      owner: doc.owner,
      revisionLog: Array.isArray(doc.revisionLog) ? doc.revisionLog.slice(-150) : [],
      dirty: false,
      saveTimer: null,
      activeUsers: new Map() // socketId -> { user, cursor }
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Applies an operational transformation to an active document
   * Handles concurrent operations when client's baseVersion < currentVersion
   *
   * @param {string} docId 
   * @param {Array|Delta} clientOp - Delta operation from client
   * @param {number} clientVersion - Version of document client created this op on
   * @param {Object} user - User applying the operation
   * @returns {Object} { transformedOp, newVersion, baseContent }
   */
  async applyOperation(docId, clientOp, clientVersion, user) {
    const session = await this.getOrCreateSession(docId);
    let opToApply = clientOp instanceof Delta ? clientOp : new Delta(clientOp);

    // If client is behind, transform against all missed revisions in order
    if (clientVersion < session.version) {
      // Find all revisions committed after client's baseVersion
      const missedRevisions = session.revisionLog.filter(rev => rev.version > clientVersion);

      for (const rev of missedRevisions) {
        // Transform incoming op against the committed revision
        // Committed revision has priority (server tie-break)
        opToApply = transform(opToApply, rev.op, true);
      }
    }

    // Apply the transformed delta to the canonical document state
    session.content = session.content.compose(opToApply);
    session.version += 1;

    const revisionEntry = {
      version: session.version,
      op: opToApply.ops,
      author: user?._id || user?.id,
      authorName: user?.name || 'Anonymous',
      authorColor: user?.color || '#2563eb',
      timestamp: new Date()
    };

    session.revisionLog.push(revisionEntry);
    if (session.revisionLog.length > 200) {
      session.revisionLog.shift(); // Keep memory bounded
    }

    session.dirty = true;
    this.scheduleSave(session);

    return {
      transformedOp: opToApply.ops,
      newVersion: session.version,
      author: {
        id: user?._id || user?.id,
        name: user?.name || 'Anonymous',
        color: user?.color || '#2563eb'
      }
    };
  }

  /**
   * Debounced persistence to MongoDB
   */
  scheduleSave(session) {
    if (session.saveTimer) {
      clearTimeout(session.saveTimer);
    }

    session.saveTimer = setTimeout(async () => {
      await this.persistSession(session);
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Persists active session state to MongoDB
   */
  async persistSession(session) {
    if (!session || !session.dirty) return;
    try {
      await Document.findByIdAndUpdate(session.docId, {
        content: session.content.ops,
        version: session.version,
        revisionLog: session.revisionLog.slice(-50),
        lastSavedAt: new Date()
      });
      session.dirty = false;
      // console.log(`[OTServer] Persisted doc ${session.docId} at version ${session.version}`);
    } catch (err) {
      console.error(`[OTServer] Error persisting document ${session.docId}:`, err);
    }
  }

  /**
   * Creates a formal version snapshot milestone in MongoDB
   */
  async createSnapshot(docId, user, description = 'Manual checkpoint') {
    const session = await this.getOrCreateSession(docId);
    // Flush changes to DB first
    await this.persistSession(session);

    const snapshot = await VersionSnapshot.create({
      documentId: session.docId,
      version: session.version,
      title: session.title,
      content: session.content.ops,
      savedBy: user?._id || user?.id,
      savedByName: user?.name || 'System',
      description
    });

    return snapshot;
  }

  /**
   * Restores a document to a previous snapshot or version
   */
  async restoreVersion(docId, targetVersion, user) {
    const session = await this.getOrCreateSession(docId);
    let targetContent = null;

    // Check snapshots first
    const snapshot = await VersionSnapshot.findOne({ documentId: docId, version: targetVersion });
    if (snapshot) {
      targetContent = snapshot.content;
    } else {
      // Reconstruct from revisions if available or load directly
      throw new Error(`Snapshot for version ${targetVersion} not found.`);
    }

    // Generate diff between current content and target content
    const targetDelta = new Delta(targetContent);
    const diffOp = session.content.diff(targetDelta);

    // Apply as a new version edit on top of history
    return await this.applyOperation(docId, diffOp, session.version, {
      ...user,
      name: `${user.name} (Restored v${targetVersion})`
    });
  }

  /**
   * Disposes an active session from memory once all clients have disconnected
   */
  async cleanupSession(docId) {
    const id = docId.toString();
    const session = this.sessions.get(id);
    if (session && session.activeUsers.size === 0) {
      if (session.dirty) {
        await this.persistSession(session);
      }
      this.sessions.delete(id);
    }
  }
}

// Export singleton instance
const otServer = new OTServer();
module.exports = otServer;
