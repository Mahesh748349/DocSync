const Delta = require('quill-delta');

/**
 * Operational Transformation Module
 * 
 * Provides transformation, composition, inversion, and position shifting
 * to guarantee eventual consistency across concurrent editing clients.
 */

/**
 * Transforms operation `incomingOp` against an already-applied concurrent operation `concurrentOp`.
 * In OT terminology:
 * Given a base document state S:
 * S o concurrentOp o transform(incomingOp, concurrentOp, priority) == S o incomingOp o transform(concurrentOp, incomingOp, !priority)
 * 
 * @param {Delta|Array} incomingOp - The new operation that needs to be adapted
 * @param {Delta|Array} concurrentOp - The operation that was already applied
 * @param {boolean} priority - Tie-breaking priority when both operations insert at the same index
 * @returns {Delta} Transformed operation
 */
function transform(incomingOp, concurrentOp, priority = false) {
  const incDelta = incomingOp instanceof Delta ? incomingOp : new Delta(incomingOp);
  const conDelta = concurrentOp instanceof Delta ? concurrentOp : new Delta(concurrentOp);
  
  // Note: in quill-delta, conDelta.transform(incDelta, priority) adapts incDelta against conDelta
  return conDelta.transform(incDelta, priority);
}

/**
 * Transforms a cursor / selection index through an operation
 * @param {number} index - Original cursor index
 * @param {Delta|Array} op - Applied delta
 * @param {boolean} priority - Whether cursor stays after insertion at same index
 * @returns {number} Updated cursor position
 */
function transformPosition(index, op, priority = false) {
  const delta = op instanceof Delta ? op : new Delta(op);
  return delta.transformPosition(index, priority);
}

/**
 * Composes two consecutive operations into a single consolidated operation
 * @param {Delta|Array} opA - First operation
 * @param {Delta|Array} opB - Subsequent operation
 * @returns {Delta} Composed operation
 */
function compose(opA, opB) {
  const deltaA = opA instanceof Delta ? opA : new Delta(opA);
  const deltaB = opB instanceof Delta ? opB : new Delta(opB);
  return deltaA.compose(deltaB);
}

/**
 * Applies a Delta to a base document state (represented as Delta or plain text)
 * @param {Delta|Array|string} baseDoc - Current document state
 * @param {Delta|Array} op - Delta to apply
 * @returns {Delta} Updated document state
 */
function apply(baseDoc, op) {
  let docDelta;
  if (typeof baseDoc === 'string') {
    docDelta = new Delta([{ insert: baseDoc }]);
  } else if (baseDoc instanceof Delta) {
    docDelta = baseDoc;
  } else {
    docDelta = new Delta(baseDoc);
  }

  const opDelta = op instanceof Delta ? op : new Delta(op);
  return docDelta.compose(opDelta);
}

/**
 * Helper to extract plain text from a Delta document state
 * @param {Delta|Array} docState - Delta ops
 * @returns {string} Plain text representation
 */
function getText(docState) {
  const ops = docState instanceof Delta ? docState.ops : (Array.isArray(docState) ? docState : (docState?.ops || []));
  let text = '';
  for (const op of ops) {
    if (typeof op.insert === 'string') {
      text += op.insert;
    }
  }
  return text;
}

/**
 * Computes minimal Delta diff between two Delta states or text strings
 * @param {Delta|string} docA 
 * @param {Delta|string} docB 
 * @returns {Delta}
 */
function diff(docA, docB) {
  const deltaA = typeof docA === 'string' ? new Delta([{ insert: docA }]) : (docA instanceof Delta ? docA : new Delta(docA));
  const deltaB = typeof docB === 'string' ? new Delta([{ insert: docB }]) : (docB instanceof Delta ? docB : new Delta(docB));
  return deltaA.diff(deltaB);
}

/**
 * Inverts an operation against a base document state (for undo functionality)
 * @param {Delta|Array} op 
 * @param {Delta|Array} baseDoc 
 * @returns {Delta}
 */
function invert(op, baseDoc) {
  const opDelta = op instanceof Delta ? op : new Delta(op);
  const docDelta = baseDoc instanceof Delta ? baseDoc : new Delta(baseDoc);
  return opDelta.invert(docDelta);
}

module.exports = {
  Delta,
  transform,
  transformPosition,
  compose,
  apply,
  getText,
  diff,
  invert
};
