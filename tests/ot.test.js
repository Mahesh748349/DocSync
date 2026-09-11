const assert = require('assert');
const { Delta, transform, transformPosition, compose, apply, getText, diff, invert } = require('../server/ot/transform');

console.log('🧪 Running Operational Transformation (OT) Concurrency Engine Tests...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// Test 1: Basic Delta construction and string representation
test('Delta: Basic construction and text extraction', () => {
  const doc = new Delta([{ insert: 'Hello World\n' }]);
  assert.strictEqual(getText(doc), 'Hello World\n');
});

// Test 2: Applying Delta to document state
test('apply: Insert, Delete, and Retain', () => {
  const initial = new Delta([{ insert: 'Hello World' }]);
  
  // Insert in middle
  const insertOp = new Delta().retain(6).insert('Beautiful ');
  const res1 = apply(initial, insertOp);
  assert.strictEqual(getText(res1), 'Hello Beautiful World');

  // Delete
  const deleteOp = new Delta().retain(6).delete(10);
  const res2 = apply(res1, deleteOp);
  assert.strictEqual(getText(res2), 'Hello World');
});

// Test 3: Concurrent Inserts at the same position (TP1 Convergence)
test('OT: Concurrent inserts at the same position converge identically', () => {
  const initial = new Delta([{ insert: 'Cat' }]);
  
  // User A inserts 'Big ' at index 0
  const opA = new Delta().insert('Big ');
  
  // User B inserts 'Fat ' at index 0
  const opB = new Delta().insert('Fat ');

  // opA has priority
  const opBPrime = transform(opB, opA, true);  // Transform opB against opA (opA has priority)
  const opAPrime = transform(opA, opB, false); // Transform opA against opB (opA still has priority)

  // Path 1: Initial o opA o opBPrime
  const state1 = apply(apply(initial, opA), opBPrime);
  
  // Path 2: Initial o opB o opAPrime
  const state2 = apply(apply(initial, opB), opAPrime);

  assert.strictEqual(getText(state1), getText(state2), 'States must converge!');
  assert.strictEqual(getText(state1), 'Big Fat Cat');
});

// Test 4: Concurrent Insert and Delete
test('OT: Concurrent Insert vs Delete converges', () => {
  const initial = new Delta([{ insert: 'The quick brown fox' }]);
  
  // User A deletes 'quick ' (index 4 to 10)
  const opA = new Delta().retain(4).delete(6);
  
  // User B inserts 'very ' before 'brown' (index 10)
  const opB = new Delta().retain(10).insert('very ');

  const opBPrime = transform(opB, opA, false);
  const opAPrime = transform(opA, opB, true);

  const state1 = apply(apply(initial, opA), opBPrime);
  const state2 = apply(apply(initial, opB), opAPrime);

  assert.strictEqual(getText(state1), getText(state2), 'States must converge!');
  assert.strictEqual(getText(state1), 'The very brown fox');
});

// Test 5: Overlapping concurrent deletes
test('OT: Overlapping concurrent deletes converge without duplicate deletion', () => {
  const initial = new Delta([{ insert: 'ABCDEFGHIJ' }]);
  
  // User A deletes 'BCD' (index 1 to 4)
  const opA = new Delta().retain(1).delete(3);
  
  // User B deletes 'CDE' (index 2 to 5)
  const opB = new Delta().retain(2).delete(3);

  const opBPrime = transform(opB, opA, false);
  const opAPrime = transform(opA, opB, true);

  const state1 = apply(apply(initial, opA), opBPrime);
  const state2 = apply(apply(initial, opB), opAPrime);

  assert.strictEqual(getText(state1), getText(state2), 'States must converge!');
  assert.strictEqual(getText(state1), 'AFGHIJ');
});

// Test 6: Multi-client realistic collaborative session
test('OT: Multi-client typing session converges regardless of receipt order', () => {
  const initial = new Delta([{ insert: 'Google Docs Platform' }]);
  
  // Alice (at start of doc) adds prefix 'Modern '
  const opAlice = new Delta().insert('Modern ');
  
  // Bob (at end of doc) appends ' with OT'
  const opBob = new Delta().retain(20).insert(' with OT');

  // Charlie edits the middle 'Docs' -> 'Collaborative Docs'
  const opCharlie = new Delta().retain(7).insert('Collaborative ');

  // Server applies Alice first
  const docAfterAlice = apply(initial, opAlice);

  // Bob's op arrives, transformed against Alice
  const opBob_transformed = transform(opBob, opAlice, false);
  const docAfterBob = apply(docAfterAlice, opBob_transformed);

  // Charlie's op arrives, transformed against Alice, then transformed against Bob's transformed op
  const opCharlie_trans1 = transform(opCharlie, opAlice, false);
  const opCharlie_trans2 = transform(opCharlie_trans1, opBob_transformed, false);
  const finalDoc = apply(docAfterBob, opCharlie_trans2);

  assert.strictEqual(getText(finalDoc), 'Modern Google Collaborative Docs Platform with OT');
});

// Test 7: Cursor Position Transformation
test('transformPosition: Cursor position transforms accurately during remote edits', () => {
  const cursorIndex = 10;
  
  // Insert 5 characters before cursor
  const insertBefore = new Delta().retain(2).insert('12345');
  assert.strictEqual(transformPosition(cursorIndex, insertBefore), 15);

  // Insert after cursor
  const insertAfter = new Delta().retain(12).insert('12345');
  assert.strictEqual(transformPosition(cursorIndex, insertAfter), 10);

  // Delete before cursor
  const deleteBefore = new Delta().retain(2).delete(4);
  assert.strictEqual(transformPosition(cursorIndex, deleteBefore), 6);
});

// Test 8: Delta Composition (Squashing sequential edits)
test('compose: Squashes sequential edits into single atomic delta', () => {
  const initial = new Delta([{ insert: 'Hello World' }]);
  const op1 = new Delta().retain(6).insert('Big ');
  const op2 = new Delta().retain(10).insert('Brave ');

  const composed = compose(op1, op2);
  const stepByStep = apply(apply(initial, op1), op2);
  const oneShot = apply(initial, composed);

  assert.strictEqual(getText(stepByStep), getText(oneShot));
  assert.strictEqual(getText(oneShot), 'Hello Big Brave World');
});

// Test 9: Invert operation for Undo
test('invert: Reverses an operation cleanly against a document state', () => {
  const initial = new Delta([{ insert: 'Hello World' }]);
  const op = new Delta().retain(6).insert('Beautiful ');
  
  const updated = apply(initial, op);
  assert.strictEqual(getText(updated), 'Hello Beautiful World');

  const undoOp = invert(op, initial);
  const restored = apply(updated, undoOp);
  assert.strictEqual(getText(restored), 'Hello World');
});

console.log(`\nOT Verification Summary: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('✨ All Operational Transformation concurrency tests passed successfully!\n');
} else {
  process.exit(1);
}
