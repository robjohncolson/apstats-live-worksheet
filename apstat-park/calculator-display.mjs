// Consume the trainer's render payloads without constructing a green LCD canvas.
export function createWorldDisplay() {
  let lines = [{ text: 'READY', selected: false }];
  return {
    getLines: () => lines,
    renderHome(values) { lines = (values.length ? values : ['READY']).map(text => ({ text })); },
    renderMenu(menu) {
      const tabs = menu.tabs?.map(tab => tab === menu.activeTab ? '[' + tab + ']' : tab).join('  ');
      const first = Math.max(0, menu.cursorIndex - 6);
      lines = [{ text: tabs || menu.title || 'MENU' },
        ...menu.items.slice(first, first + 7).map((text, i) => ({ text, selected: first + i === menu.cursorIndex }))];
    },
    renderWizard(wizard) {
      lines = [{ text: wizard.title.replace(/-wizard$/, '').replaceAll('-', ' ') },
        ...wizard.fields.map((field, i) => ({
          text: field.label + (field.displayValue == null ? '' : ': ' + field.displayValue),
          selected: i === wizard.cursorIndex,
        }))];
    },
    renderResult(result) { lines = result.lines.map(text => ({ text })); },
    renderEditor(editor) {
      const firstCol = Math.max(0, Math.min(3, editor.cursorCol - 1));
      const firstRow = Math.max(0, editor.cursorRow - 4);
      const cell = value => String(value ?? '').slice(0, 7).padEnd(8);
      lines = [{ text: editor.columns.slice(firstCol, firstCol + 3)
        .map((name, i) => cell(firstCol + i === editor.cursorCol ? '[' + name + ']' : name)).join('') }];
      for (let row = firstRow; row < Math.min(editor.rows.length, firstRow + 5); row++) {
        lines.push({ text: editor.rows[row].slice(firstCol, firstCol + 3).map(cell).join(''),
          selected: row === editor.cursorRow });
      }
      const value = editor.entry ?? editor.rows[editor.cursorRow]?.[editor.cursorCol] ?? '';
      lines.push({ text: editor.columns[editor.cursorCol] + '(' + (editor.cursorRow + 1) + ')=' + value });
    },
    renderGraph() { lines = [{ text: 'GRAPH' }]; },
    clear() { lines = []; },
  };
}
