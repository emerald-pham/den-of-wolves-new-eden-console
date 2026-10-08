import assert from 'node:assert/strict';

// Executed in the browser against painted label words, not CSS declarations.
export function referenceLabelGeometry(element) {
  const label = element.firstElementChild;
  const text = label.firstChild;
  const words = [...text.textContent.matchAll(/\S+/g)].map(match => {
    const range = document.createRange();
    range.setStart(text, match.index);
    range.setEnd(text, match.index + match[0].length);
    return { word: match[0], lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size };
  });
  const state = element.lastElementChild.getBoundingClientRect();
  const bounds = label.getBoundingClientRect();
  return { words, label: bounds.toJSON(), state: state.toJSON() };
}

export function assertReferenceLabelGeometry(geometry) {
  assert.deepEqual(geometry.words.map(({ word }) => word), ['Operations', 'reference']);
  assert.ok(geometry.words.every(({ lines }) => lines === 1),
    `Operations reference words must remain whole: ${JSON.stringify(geometry.words)}`);
}
