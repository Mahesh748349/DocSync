const Document = require('../models/Document');
const User = require('../models/User');
const VersionSnapshot = require('../models/VersionSnapshot');
const otServer = require('../ot/ot-server');
const { getDocumentPermission } = require('../middleware/rbac');

// Create new document
exports.createDocument = async (req, res) => {
  try {
    const { title, template } = req.body;
    
    let initialContent = [{ insert: '\n' }];
    if (template === 'project-proposal') {
      initialContent = [
        { insert: 'Project Proposal: Next-Gen Collaborative Platform\n', attributes: { header: 1 } },
        { insert: 'Executive Summary\n', attributes: { header: 2 } },
        { insert: 'This document outlines the architecture, real-time synchronization requirements, and role-based permissions for our collaborative editor.\n\n' },
        { insert: 'Key Objectives\n', attributes: { header: 2 } },
        { insert: '• Low latency WebSocket broadcasting using Socket.io\n' },
        { insert: '• Mathematical Operational Transformation (OT) concurrency control\n' },
        { insert: '• Granular RBAC permissions: Owner, Editor, Viewer\n\n' },
        { insert: 'Technical Specifications\n', attributes: { header: 2 } },
        { insert: 'Built with Node.js, Express, MongoDB, and React with responsive desktop-grade editing.\n' }
      ];
    } else if (template === 'meeting-notes') {
      initialContent = [
        { insert: 'Sprint Planning & Architecture Sync\n', attributes: { header: 1 } },
        { insert: 'Date: ', attributes: { bold: true } },
        { insert: `${new Date().toLocaleDateString()}\n` },
        { insert: 'Attendees: ', attributes: { bold: true } },
        { insert: `${req.user.name}, Engineering Team\n\n` },
        { insert: 'Agenda Items\n', attributes: { header: 2 } },
        { insert: '1. Review Operational Transformation test suite\n' },
        { insert: '2. Multi-cursor positioning latency benchmarks\n' },
        { insert: '3. Real-time permission demotion/promotion flow\n\n' },
        { insert: 'Action Items\n', attributes: { header: 2 } },
        { insert: '[ ] Verify MongoDB write debounce\n' },
        { insert: '[ ] Validate viewer mode read-only lock\n' }
      ];
    }

    const doc = await Document.create({
      title: title || 'Untitled Document',
      content: initialContent,
      owner: req.user._id,
      collaborators: [
        {
          user: req.user._id,
          role: 'owner'
        }
      ],
      version: 0
    });

    // Save initial version 0 snapshot
    await VersionSnapshot.create({
      documentId: doc._id,
      version: 0,
      title: doc.title,
      content: initialContent,
      savedBy: req.user._id,
      savedByName: req.user.name,
      description: 'Initial Document Creation'
    });

    res.status(201).json({
      success: true,
      document: {
        id: doc._id,
        title: doc.title,
        version: doc.version,
        updatedAt: doc.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all documents accessible to user (owned or shared)
exports.getUserDocuments = async (req, res) => {
  try {
    const docs = await Document.find({
      $or: [
        { owner: req.user._id },
        { 'collaborators.user': req.user._id }
      ]
    })
      .populate('owner', 'name email avatar color')
      .populate('collaborators.user', 'name email avatar color')
      .sort({ updatedAt: -1 });

    const formatted = docs.map(doc => {
      const perm = getDocumentPermission(doc, req.user._id);
      return {
        id: doc._id,
        title: doc.title,
        version: doc.version,
        isPublic: doc.isPublic,
        publicRole: doc.publicRole,
        owner: doc.owner,
        collaboratorsCount: doc.collaborators ? doc.collaborators.length : 1,
        userRole: perm.role,
        isOwner: perm.isOwner,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt
      };
    });

    res.json({ success: true, documents: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get single document by ID with content and permissions
exports.getDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('owner', 'name email avatar color')
      .populate('collaborators.user', 'name email avatar color');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user?._id);
    if (!perm.canView) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view this document' });
    }

    // Check if there is an active session in OT server
    let currentContent = doc.content;
    let currentVersion = doc.version;

    if (otServer.sessions.has(doc._id.toString())) {
      const session = otServer.sessions.get(doc._id.toString());
      currentContent = session.content.ops;
      currentVersion = session.version;
    }

    res.json({
      success: true,
      document: {
        id: doc._id,
        title: doc.title,
        content: currentContent,
        version: currentVersion,
        isPublic: doc.isPublic,
        publicRole: doc.publicRole,
        owner: doc.owner,
        collaborators: doc.collaborators.map(c => ({
          user: c.user,
          role: c.role,
          addedAt: c.addedAt
        })),
        permissions: perm,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update document title
exports.updateDocumentTitle = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title cannot be empty' });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.canEdit) {
      return res.status(403).json({ success: false, message: 'Only editors or owners can rename the document' });
    }

    doc.title = title.trim();
    await doc.save();

    // Update active memory session if open
    if (otServer.sessions.has(doc._id.toString())) {
      otServer.sessions.get(doc._id.toString()).title = doc.title;
    }

    res.json({ success: true, title: doc.title });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete document (Owner only)
exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the document owner can delete this document' });
    }

    await Document.findByIdAndDelete(req.params.id);
    await VersionSnapshot.deleteMany({ documentId: req.params.id });

    // Clean up memory session
    otServer.sessions.delete(req.params.id.toString());

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Add collaborator (Owner only)
exports.addCollaborator = async (req, res) => {
  try {
    const { email, userId, role = 'editor' } = req.body;
    
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be either editor or viewer' });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the document owner can manage collaborators' });
    }

    let targetUser = null;
    if (userId) {
      targetUser = await User.findById(userId);
    } else if (email) {
      targetUser = await User.findOne({ email: email.toLowerCase() });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (targetUser._id.toString() === doc.owner.toString()) {
      return res.status(400).json({ success: false, message: 'Owner already has full permissions' });
    }

    const existingIndex = doc.collaborators.findIndex(c => c.user.toString() === targetUser._id.toString());
    if (existingIndex >= 0) {
      doc.collaborators[existingIndex].role = role;
    } else {
      doc.collaborators.push({
        user: targetUser._id,
        role: role,
        addedAt: new Date()
      });
    }

    await doc.save();

    const updated = await Document.findById(doc._id).populate('collaborators.user', 'name email avatar color');
    res.json({ success: true, collaborators: updated.collaborators });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update collaborator role (Owner only)
exports.updateCollaboratorRole = async (req, res) => {
  try {
    const { role } = req.body;
    const { id, userId } = req.params;

    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be editor or viewer' });
    }

    const doc = await Document.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the document owner can update permissions' });
    }

    const collaborator = doc.collaborators.find(c => c.user.toString() === userId.toString());
    if (!collaborator) {
      return res.status(404).json({ success: false, message: 'Collaborator not found on this document' });
    }

    collaborator.role = role;
    await doc.save();

    const updated = await Document.findById(doc._id).populate('collaborators.user', 'name email avatar color');
    res.json({ success: true, collaborators: updated.collaborators });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Remove collaborator (Owner only)
exports.removeCollaborator = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const doc = await Document.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.isOwner && req.user._id.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Only owner can remove collaborators' });
    }

    doc.collaborators = doc.collaborators.filter(c => c.user.toString() !== userId.toString());
    await doc.save();

    const updated = await Document.findById(doc._id).populate('collaborators.user', 'name email avatar color');
    res.json({ success: true, collaborators: updated.collaborators });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update link sharing settings (Owner only)
exports.updateLinkSharing = async (req, res) => {
  try {
    const { isPublic, publicRole = 'viewer' } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.isOwner) {
      return res.status(403).json({ success: false, message: 'Only owner can change link sharing settings' });
    }

    doc.isPublic = !!isPublic;
    if (['viewer', 'editor'].includes(publicRole)) {
      doc.publicRole = publicRole;
    }
    await doc.save();

    res.json({
      success: true,
      isPublic: doc.isPublic,
      publicRole: doc.publicRole
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get version snapshots
exports.getVersionHistory = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.canView) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const snapshots = await VersionSnapshot.find({ documentId: doc._id })
      .sort({ version: -1 })
      .limit(50);

    res.json({
      success: true,
      currentVersion: doc.version,
      snapshots: snapshots.map(s => ({
        id: s._id,
        version: s.version,
        title: s.title,
        savedByName: s.savedByName,
        description: s.description,
        createdAt: s.createdAt
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create a manual version snapshot checkpoint
exports.createSnapshotCheckpoint = async (req, res) => {
  try {
    const { description } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.canEdit) {
      return res.status(403).json({ success: false, message: 'Editing permissions required to create snapshots' });
    }

    const snapshot = await otServer.createSnapshot(doc._id, req.user, description || 'Manual checkpoint');
    res.status(201).json({
      success: true,
      snapshot: {
        id: snapshot._id,
        version: snapshot.version,
        title: snapshot.title,
        savedByName: snapshot.savedByName,
        description: snapshot.description,
        createdAt: snapshot.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Restore previous version
exports.restoreVersion = async (req, res) => {
  try {
    const { version } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const perm = getDocumentPermission(doc, req.user._id);
    if (!perm.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the owner can restore previous versions' });
    }

    const snapshot = await VersionSnapshot.findOne({ documentId: doc._id, version: Number(version) });
    if (!snapshot) {
      return res.status(404).json({ success: false, message: `Version ${version} snapshot not found` });
    }

    // Replace current content with snapshot content
    const session = await otServer.getOrCreateSession(doc._id);
    const { Delta } = require('../ot/delta');
    const targetDelta = new Delta(snapshot.content);
    const diffOp = session.content.diff(targetDelta);

    const result = await otServer.applyOperation(doc._id, diffOp, session.version, req.user);

    res.json({
      success: true,
      message: `Document restored to version ${version}`,
      newVersion: result.newVersion,
      content: snapshot.content
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
