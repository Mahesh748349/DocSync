const Document = require('../models/Document');

/**
 * Evaluates user permissions for a given document
 * @param {Object} document - Mongoose Document
 * @param {string|ObjectId} userId - Current user ID
 * @returns {Object} { role: 'owner'|'editor'|'viewer'|'none', canView: boolean, canEdit: boolean, isOwner: boolean }
 */
function getDocumentPermission(document, userId) {
  if (!document) {
    return { role: 'none', canView: false, canEdit: false, isOwner: false };
  }

  const userIdStr = userId ? userId.toString() : null;
  const ownerIdStr = document.owner ? (document.owner._id || document.owner).toString() : null;

  // 1. Owner check
  if (userIdStr && ownerIdStr && userIdStr === ownerIdStr) {
    return { role: 'owner', canView: true, canEdit: true, isOwner: true };
  }

  // 2. Explicit collaborator check
  if (userIdStr && Array.isArray(document.collaborators)) {
    const collaborator = document.collaborators.find(c => {
      const cUserId = (c.user._id || c.user).toString();
      return cUserId === userIdStr;
    });

    if (collaborator) {
      const isEditor = collaborator.role === 'editor' || collaborator.role === 'owner';
      return {
        role: collaborator.role,
        canView: true,
        canEdit: isEditor,
        isOwner: collaborator.role === 'owner'
      };
    }
  }

  // 3. Public link check
  if (document.isPublic) {
    const isEditor = document.publicRole === 'editor';
    return {
      role: document.publicRole || 'viewer',
      canView: true,
      canEdit: isEditor,
      isOwner: false
    };
  }

  // 4. No access
  return { role: 'none', canView: false, canEdit: false, isOwner: false };
}

/**
 * Express middleware to enforce minimum role on document routes
 * @param {string} minRole - 'viewer' | 'editor' | 'owner'
 */
const requireDocRole = (minRole = 'viewer') => {
  return async (req, res, next) => {
    try {
      const docId = req.params.id || req.params.docId;
      const document = await Document.findById(docId).populate('owner', 'name email avatar color');
      
      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      const permissions = getDocumentPermission(document, req.user?._id);

      if (minRole === 'viewer' && !permissions.canView) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view this document' });
      }

      if (minRole === 'editor' && !permissions.canEdit) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to edit this document' });
      }

      if (minRole === 'owner' && !permissions.isOwner) {
        return res.status(403).json({ success: false, message: 'Access denied: Owner permission required' });
      }

      req.document = document;
      req.docPermissions = permissions;
      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};

module.exports = {
  getDocumentPermission,
  requireDocRole
};
