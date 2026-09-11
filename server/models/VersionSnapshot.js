const mongoose = require('mongoose');

const versionSnapshotSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true
  },
  version: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: Array,
    required: true
  },
  savedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  savedByName: {
    type: String,
    default: 'System Autosave'
  },
  description: {
    type: String,
    default: 'Manual checkpoint'
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

module.exports = mongoose.model('VersionSnapshot', versionSnapshotSchema);
