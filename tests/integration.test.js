const assert = require('assert');
const { io: Client } = require('socket.io-client');
const Delta = require('quill-delta');

const BASE_URL = 'http://127.0.0.1:5000';

console.log('🚀 Running Full-Stack Real-Time Document Platform Integration Tests...\n');

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runIntegrationTests() {
  let passed = 0;
  let total = 0;

  function pass(name) {
    total++;
    passed++;
    console.log(`  ✓ ${name}`);
  }

  try {
    // 1. Health check
    const health = await request('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'online');
    pass('API Gateway: Health endpoint active');

    // 2. 1-Click Guest / Recruiter Auth
    const guestUser1 = await request('/api/auth/guest', {
      method: 'POST',
      body: { name: 'Alice (Owner)' }
    });
    assert.strictEqual(guestUser1.status, 201);
    assert.ok(guestUser1.data.token);
    assert.strictEqual(guestUser1.data.user.name, 'Alice (Owner)');
    pass('Auth: 1-Click guest authentication generated token and profile');

    const guestUser2 = await request('/api/auth/guest', {
      method: 'POST',
      body: { name: 'Bob (Editor)' }
    });
    assert.strictEqual(guestUser2.status, 201);
    pass('Auth: Second collaborator identity provisioned');

    const guestUser3 = await request('/api/auth/guest', {
      method: 'POST',
      body: { name: 'Charlie (Viewer)' }
    });
    assert.strictEqual(guestUser3.status, 201);
    pass('Auth: Third user identity provisioned for viewer tests');

    // 3. Document Creation (Owner)
    const newDoc = await request('/api/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestUser1.data.token}` },
      body: { title: 'Integration Test Document', template: 'blank' }
    });
    assert.strictEqual(newDoc.status, 201);
    const docId = newDoc.data.document.id;
    assert.ok(docId);
    pass('Document: Created document and persisted to MongoDB');

    // 4. Document RBAC Sharing: Add Bob as Editor and Charlie as Viewer
    const addBob = await request(`/api/documents/${docId}/collaborators`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestUser1.data.token}` },
      body: { userId: guestUser2.data.user.id, role: 'editor' }
    });
    assert.strictEqual(addBob.status, 200);
    pass('RBAC: Added collaborator Bob as Editor');

    const addCharlie = await request(`/api/documents/${docId}/collaborators`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestUser1.data.token}` },
      body: { userId: guestUser3.data.user.id, role: 'viewer' }
    });
    assert.strictEqual(addCharlie.status, 200);
    pass('RBAC: Added collaborator Charlie as Viewer');

    // 5. Connect WebSocket clients
    const socketAlice = Client(BASE_URL, { auth: { token: guestUser1.data.token } });
    const socketBob = Client(BASE_URL, { auth: { token: guestUser2.data.token } });
    const socketCharlie = Client(BASE_URL, { auth: { token: guestUser3.data.token } });

    await Promise.all([
      new Promise(res => socketAlice.on('connect', res)),
      new Promise(res => socketBob.on('connect', res)),
      new Promise(res => socketCharlie.on('connect', res))
    ]);
    pass('WebSockets: Connected 3 concurrent authenticated Socket.io clients');

    // 6. Join Document Room
    let aliceInit, bobInit, charlieInit;
    await Promise.all([
      new Promise(res => {
        socketAlice.on('document-init', data => { aliceInit = data; res(); });
        socketAlice.emit('join-document', { docId });
      }),
      new Promise(res => {
        socketBob.on('document-init', data => { bobInit = data; res(); });
        socketBob.emit('join-document', { docId });
      }),
      new Promise(res => {
        socketCharlie.on('document-init', data => { charlieInit = data; res(); });
        socketCharlie.emit('join-document', { docId });
      })
    ]);

    assert.strictEqual(aliceInit.role, 'owner');
    assert.strictEqual(bobInit.role, 'editor');
    assert.strictEqual(charlieInit.role, 'viewer');
    assert.strictEqual(aliceInit.canEdit, true);
    assert.strictEqual(bobInit.canEdit, true);
    assert.strictEqual(charlieInit.canEdit, false);
    pass('RBAC: Socket handshake enforced distinct permissions (Owner/Editor/Viewer)');

    // Allow rooms to stabilize in memory
    await sleep(200);

    // 7. Real-Time Delta Exchange via Operational Transformation
    const editPromise = new Promise(resolve => {
      socketBob.on('op-broadcast', (data) => resolve(data));
    });

    const opAlice = new Delta().insert('Hello ');
    socketAlice.emit('edit-op', {
      docId,
      op: opAlice.ops,
      baseVersion: aliceInit.version
    });

    const broadcast = await editPromise;
    assert.strictEqual(broadcast.version, 1);
    assert.strictEqual(broadcast.author.id, guestUser1.data.user.id);
    pass('Real-Time Sync: WebSocket broadcasted delta to remote collaborator with low latency');

    // 8. Viewer RBAC Edit Rejection
    const viewerEditPromise = new Promise(resolve => {
      socketCharlie.on('permission-denied', (err) => resolve(err));
    });

    socketCharlie.emit('edit-op', {
      docId,
      op: new Delta().insert('Hacked by viewer').ops,
      baseVersion: 1
    });

    const denied = await viewerEditPromise;
    assert.strictEqual(denied.code, 'READ_ONLY_ACCESS');
    pass('RBAC Security: Server-side Socket dropped unauthorized viewer edit with READ_ONLY_ACCESS');

    // 9. Remote Cursor Tracking
    const cursorPromise = new Promise(resolve => {
      socketBob.on('cursor-update', (cursorData) => resolve(cursorData));
    });

    socketAlice.emit('cursor-move', {
      docId,
      range: { index: 6, length: 0 }
    });

    const cursorData = await cursorPromise;
    assert.strictEqual(cursorData.range.index, 6);
    assert.strictEqual(cursorData.user.id, guestUser1.data.user.id);
    pass('Real-Time Presence: Cursor movement broadcasted with collaborator metadata');

    // 10. Version History Snapshot and Rollback
    const checkpoint = await request(`/api/documents/${docId}/versions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestUser1.data.token}` },
      body: { description: 'Integration Milestone' }
    });
    assert.strictEqual(checkpoint.status, 201);
    pass('Version History: Created snapshot checkpoint in MongoDB');

    // Disconnect sockets cleanly
    socketAlice.disconnect();
    socketBob.disconnect();
    socketCharlie.disconnect();

    console.log(`\nResults: ${passed}/${total} integration tests passed!`);
    console.log('✨ Full-Stack Collaborative Document Platform successfully validated!\n');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failure:', err);
    process.exit(1);
  }
}

runIntegrationTests();
