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
      const first = Math.max(0, wizard.cursorIndex - 5);
      lines = [{ text: wizard.title.replace(/-wizard$/, '').replaceAll('-', ' ') },
        ...wizard.fields.slice(first, first + 6).map((field, i) => ({
          text: field.label + (field.displayValue == null ? '' : ': ' + field.displayValue)
            + (field.cursorOption != null ? ' [' + field.cursorOption + ']' : ''),
          selected: first + i === wizard.cursorIndex,
        }))];
    },
    renderResult(result) { lines = result.lines.map(text => ({ text })); },
    renderEditor(editor) {
      if (editor.dimensions && editor.dimension !== null) {
        lines = [{ text: editor.name + ' dimensions' }, { text: 'Rows: ' + editor.dimensions[0], selected: editor.dimension === 0 },
          { text: 'Columns: ' + editor.dimensions[1], selected: editor.dimension === 1 }, { text: 'Entry: ' + (editor.entry ?? '') }];
        return;
      }
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
    renderGraph(graph) {
      lines = [{ text: graph?.title || 'GRAPH' }];
      if (graph?.type === 'ModBoxplot') {
        for (const key of ['minX', 'Q1', 'Med', 'Q3', 'maxX']) lines.push({ text: key + '=' + graph.stats[key] });
      } else for (const point of graph?.points?.slice(0, 5) || []) {
        lines.push({ text: 'x=' + point.x + ' y=' + Number(point.y.toPrecision(5)) });
      }
      if (graph?.traceInfo) lines.push({ text: 'TRACE x=' + graph.traceInfo.x + ' y=' + Number(graph.traceInfo.y.toPrecision(5)), selected: true });
    },
    clear() { lines = []; },
  };
}
