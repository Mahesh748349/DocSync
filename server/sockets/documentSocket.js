const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const User = require('../models/User');
const Document = require('../models/Document');
const otServer = require('../ot/ot-server');
const { getDocumentPermission } = require('../middleware/rbac');

function initializeSocket(io) {
  // Socket.io JWT authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        color: user.color,
        avatar: user.avatar,
        isGuest: user.isGuest
      };

      next();
    } catch (err) {
      return next(new Error(`Authentication error: ${err.message}`));
    }
  });

  io.on('connection', (socket) => {
    // console.log(`[Socket] Connected: ${socket.user.name} (${socket.id})`);

    // Track rooms joined by this socket
    const joinedDocs = new Set();

    // 1. Join document room
    socket.on('join-document', async ({ docId }) => {
      try {
        if (!docId) return;
        const doc = await Document.findById(docId);
        if (!doc) {
          return socket.emit('join-error', { message: 'Document not found' });
        }

        const perm = getDocumentPermission(doc, socket.user.id);
        if (!perm.canView) {
          return socket.emit('join-error', { message: 'Access denied: You cannot view this document' });
        }

        const room = `doc:${docId}`;
        await socket.join(room);
        joinedDocs.add(docId);

        const session = await otServer.getOrCreateSession(docId);

        // Store active presence
        const presenceInfo = {
          socketId: socket.id,
          user: socket.user,
          role: perm.role,
          canEdit: perm.canEdit,
          isOwner: perm.isOwner,
          cursor: null,
          joinedAt: new Date()
        };
        session.activeUsers.set(socket.id, presenceInfo);

        // Collect list of current active collaborators
        const activeCollaborators = Array.from(session.activeUsers.values()).map(p => ({
          socketId: p.socketId,
          user: p.user,
          role: p.role,
          canEdit: p.canEdit,
          cursor: p.cursor
        }));

        // Send initial document state and presence to joining client
        socket.emit('document-init', {
          docId,
          title: doc.title,
          content: session.content.ops,
          version: session.version,
          role: perm.role,
          canEdit: perm.canEdit,
          isOwner: perm.isOwner,
          activeCollaborators
        });

        // Notify other peers in room about new collaborator
        socket.to(room).emit('user-joined', {
          socketId: socket.id,
          user: socket.user,
          role: perm.role,
          canEdit: perm.canEdit
        });

        // console.log(`[Socket] ${socket.user.name} joined doc ${docId} as ${perm.role}`);
      } catch (err) {
        console.error(`[Socket] join-document error:`, err);
        socket.emit('join-error', { message: err.message });
      }
    });

    // 2. Client sends an edit operation (Delta)
    socket.on('edit-op', async ({ docId, op, baseVersion }) => {
      try {
        if (!docId || !op) return;

        const session = otServer.sessions.get(docId.toString());
        if (!session) {
          return socket.emit('op-error', { message: 'Active document session not found' });
        }

        const presence = session.activeUsers.get(socket.id);
        if (!presence || !presence.canEdit) {
          return socket.emit('permission-denied', {
            message: 'You have read-only (viewer) access and cannot edit this document.',
            code: 'READ_ONLY_ACCESS'
          });
        }

        // Apply Operational Transformation via OT Server
        const result = await otServer.applyOperation(docId, op, baseVersion, socket.user);

        // Acknowledge operation to sender
        socket.emit('op-ack', {
          docId,
          newVersion: result.newVersion,
          baseVersion
        });

        // Broadcast transformed delta to all other collaborators in room
        socket.to(`doc:${docId}`).emit('op-broadcast', {
          docId,
          op: result.transformedOp,
          version: result.newVersion,
          author: result.author
        });
      } catch (err) {
        console.error(`[Socket] edit-op error:`, err);
        socket.emit('op-error', { message: err.message });
      }
    });

    // 3. Remote cursor movement
    socket.on('cursor-move', ({ docId, range, coordinates }) => {
      if (!docId) return;
      const session = otServer.sessions.get(docId.toString());
      if (session && session.activeUsers.has(socket.id)) {
        session.activeUsers.get(socket.id).cursor = range;
      }

      socket.to(`doc:${docId}`).emit('cursor-update', {
        socketId: socket.id,
        user: socket.user,
        range,
        coordinates
      });
    });

    // 4. Live typing indicator
    socket.on('typing-status', ({ docId, isTyping }) => {
      if (!docId) return;
      socket.to(`doc:${docId}`).emit('user-typing', {
        socketId: socket.id,
        user: socket.user,
        isTyping
      });
    });

    // 5. Explicit leave document
    socket.on('leave-document', ({ docId }) => {
      if (!docId) return;
      handleLeave(socket, docId);
    });

    // 6. Socket disconnect cleanup
    socket.on('disconnecting', () => {
      for (const docId of joinedDocs) {
        handleLeave(socket, docId);
      }
    });

    socket.on('disconnect', () => {
      // console.log(`[Socket] Disconnected: ${socket.user.name} (${socket.id})`);
    });
  });

  async function handleLeave(socket, docId) {
    const room = `doc:${docId}`;
    await socket.leave(room);
    const session = otServer.sessions.get(docId.toString());
    if (session) {
      session.activeUsers.delete(socket.id);
      socket.to(room).emit('user-left', {
        socketId: socket.id,
        user: socket.user
      });
      if (session.activeUsers.size === 0) {
        otServer.cleanupSession(docId);
      }
    }
  }
}

module.exports = initializeSocket;
