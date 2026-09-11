const express = require('express');
const router = express.Router();
const {
  createDocument,
  getUserDocuments,
  getDocument,
  updateDocumentTitle,
  deleteDocument,
  addCollaborator,
  updateCollaboratorRole,
  removeCollaborator,
  updateLinkSharing,
  getVersionHistory,
  createSnapshotCheckpoint,
  restoreVersion
} = require('../controllers/documentController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .post(createDocument)
  .get(getUserDocuments);

router.route('/:id')
  .get(getDocument)
  .put(updateDocumentTitle)
  .delete(deleteDocument);

router.post('/:id/collaborators', addCollaborator);
router.put('/:id/collaborators/:userId', updateCollaboratorRole);
router.delete('/:id/collaborators/:userId', removeCollaborator);

router.put('/:id/sharing', updateLinkSharing);

router.get('/:id/versions', getVersionHistory);
router.post('/:id/versions', createSnapshotCheckpoint);
router.post('/:id/versions/restore', restoreVersion);

module.exports = router;
