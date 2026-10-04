// Printed TI-84 legends, matching the trainer keyboard. These are display names;
// clicks still send the original physical key to the calculator engine.
const second = {
  'Y=': 'STAT PLOT', WINDOW: 'TBLSET', ZOOM: 'FORMAT', TRACE: 'CALC', GRAPH: 'TABLE',
  MODE: 'QUIT', DEL: 'INS', 'X,T,θ,n': 'LINK', STAT: 'LIST',
  MATH: 'TEST', APPS: 'ANGLE', PRGM: 'DRAW', VARS: 'DISTR',
  'x⁻¹': 'MATRIX', SIN: 'SIN^-1', COS: 'COS^-1', TAN: 'TAN^-1', '^': 'pi',
  'x²': 'sqrt', ',': 'EE', '(': '{', ')': '}', '÷': 'e',
  LOG: '10^x', '7': 'u', '8': 'v', '9': 'w', '×': '[',
  LN: 'e^x', '4': 'L4', '5': 'L5', '6': 'L6', '−': ']',
  'STO→': 'RCL', '1': 'L1', '2': 'L2', '3': 'L3', '+': 'MEM',
  ON: 'OFF', '0': 'CATALOG', '.': 'i', '(−)': 'ANS', ENTER: 'ENTRY',
};
const alpha = {
  MATH: 'A', APPS: 'B', PRGM: 'C', 'x⁻¹': 'D', SIN: 'E', COS: 'F', TAN: 'G', '^': 'H',
  'x²': 'I', ',': 'J', '(': 'K', ')': 'L', '÷': 'M', LOG: 'N',
  '7': 'O', '8': 'P', '9': 'Q', '×': 'R', LN: 'S',
  '4': 'T', '5': 'U', '6': 'V', '−': 'W', 'STO→': 'X',
  '1': 'Y', '2': 'Z', '3': 'Θ', '+': "''", '0': 'SPACE', '.': ':', '(−)': '?', ENTER: 'SOLVE',
};

export function keyboardLayer(snapshot) {
  if (snapshot.alphaActive) return 'alpha';
  if (snapshot.secondActive) return 'second';
  return 'normal';
}

export function keyLabel(key, layer) {
  if (key === '2ND' || key === 'ALPHA') return key;
  return (layer === 'alpha' ? alpha[key] : layer === 'second' ? second[key] : null) || key;
}

export function keyInstruction(key, hint, layer, nextKey) {
  // Exploratory input can activate a modifier before its checkpoint is credited.
  // In that case guide the student to the function, not a second modifier press.
  if (nextKey && ((key === '2ND' && layer === 'second') || (key === 'ALPHA' && layer === 'alpha'))) key = nextKey;
  const label = keyLabel(key, layer);
  return label === key ? hint : 'Press ' + label + ' (' + key + ').';
}
