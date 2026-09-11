import Delta from 'quill-delta';

/**
 * Client-Side Operational Transformation State Machine
 * 
 * Implements the standard 3-state OT client protocol (Google Wave / ShareDB model):
 * 1. Synchronized: No outstanding operations sent to the server.
 * 2. AwaitingConfirm: One operation in-flight to server, awaiting acknowledgement.
 * 3. AwaitingWithBuffer: One operation in-flight, additional local keystrokes buffered.
 */
export class ClientOTManager {
  constructor({ socket, docId, baseVersion = 0, onApplyRemoteOp, onStatusChange }) {
    this.socket = socket;
    this.docId = docId;
    this.version = baseVersion;
    this.onApplyRemoteOp = onApplyRemoteOp;
    this.onStatusChange = onStatusChange;

    this.state = 'Synchronized'; // 'Synchronized' | 'AwaitingConfirm' | 'AwaitingWithBuffer'
    this.outstandingOp = null;  // Op sent to server awaiting ack
    this.bufferedOp = null;     // Local edits buffered while awaiting ack

    this.setupSocketListeners();
  }

  setupSocketListeners() {
    if (!this.socket) return;

    // Server acknowledged our sent operation
    this.socket.on('op-ack', ({ docId, newVersion, baseVersion }) => {
      if (docId !== this.docId) return;
      this.handleServerAck(newVersion);
    });

    // Server broadcasted a remote peer's operation
    this.socket.on('op-broadcast', ({ docId, op, version, author }) => {
      if (docId !== this.docId) return;
      this.handleRemoteOp(new Delta(op), version, author);
    });
  }

  /**
   * Called when local user generates a delta edit in the editor
   * @param {Delta} op - Local delta
   */
  submitLocalOp(op) {
    if (!op || op.ops.length === 0) return;
    const delta = op instanceof Delta ? op : new Delta(op);

    switch (this.state) {
      case 'Synchronized':
        // Transition to AwaitingConfirm: send op immediately
        this.outstandingOp = delta;
        this.state = 'AwaitingConfirm';
        this.sendOpToServer(delta, this.version);
        this.notifyStatus('Saving...');
        break;

      case 'AwaitingConfirm':
        // Transition to AwaitingWithBuffer: buffer local changes
        this.bufferedOp = delta;
        this.state = 'AwaitingWithBuffer';
        this.notifyStatus('Saving...');
        break;

      case 'AwaitingWithBuffer':
        // Compose newly typed delta onto the existing buffer
        this.bufferedOp = this.bufferedOp.compose(delta);
        this.notifyStatus('Saving...');
        break;

      default:
        break;
    }
  }

  /**
   * Handles server acknowledgement of our outstanding operation
   */
  handleServerAck(newVersion) {
    this.version = newVersion;

    switch (this.state) {
      case 'AwaitingConfirm':
        this.outstandingOp = null;
        this.state = 'Synchronized';
        this.notifyStatus('All changes saved');
        break;

      case 'AwaitingWithBuffer':
        // Outstanding op acknowledged. Now promote buffered op to outstanding op and transmit!
        this.outstandingOp = this.bufferedOp;
        this.bufferedOp = null;
        this.state = 'AwaitingConfirm';
        this.sendOpToServer(this.outstandingOp, this.version);
        this.notifyStatus('Saving...');
        break;

      case 'Synchronized':
      default:
        break;
    }
  }

  /**
   * Handles a remote operation broadcast from another collaborator
   * @param {Delta} serverOp - Remote operation
   * @param {number} newVersion - Server revision version
   * @param {Object} author - Author information
   */
  handleRemoteOp(serverOp, newVersion, author) {
    this.version = newVersion;
    let opToApplyLocally = serverOp;

    switch (this.state) {
      case 'Synchronized':
        // No local inflight changes: apply server op directly to editor
        this.onApplyRemoteOp(opToApplyLocally, author);
        break;

      case 'AwaitingConfirm': {
        // Transform incoming serverOp against our outstanding op
        // Note: serverOp has priority (server committed it first)
        const transformedServerOp = this.outstandingOp.transform(serverOp, false);
        const transformedOutstandingOp = serverOp.transform(this.outstandingOp, true);

        this.outstandingOp = transformedOutstandingOp;
        this.onApplyRemoteOp(transformedServerOp, author);
        break;
      }

      case 'AwaitingWithBuffer': {
        // Transform against outstanding op first
        const serverOp1 = this.outstandingOp.transform(serverOp, false);
        const transformedOutstanding = serverOp.transform(this.outstandingOp, true);

        // Then transform against buffered op
        const serverOp2 = this.bufferedOp.transform(serverOp1, false);
        const transformedBuffered = serverOp1.transform(this.bufferedOp, true);

        this.outstandingOp = transformedOutstanding;
        this.bufferedOp = transformedBuffered;

        // Apply final transformed server op to local editor
        this.onApplyRemoteOp(serverOp2, author);
        break;
      }

      default:
        break;
    }
  }

  sendOpToServer(op, baseVersion) {
    this.socket.emit('edit-op', {
      docId: this.docId,
      op: op.ops,
      baseVersion
    });
  }

  notifyStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  destroy() {
    if (this.socket) {
      this.socket.off('op-ack');
      this.socket.off('op-broadcast');
    }
  }
}
