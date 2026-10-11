// Fallback when the trainer's TI84ScreenRenderer.traceLabel is not loaded (plain tests).
function plainTraceLabel(info) {
  if (info.label !== undefined) return info.label + '=' + info.x;
  if (info.upper !== undefined) return 'min=' + info.x + ' max<' + info.upper + ' n=' + info.y;
  return 'x=' + info.x + ' y=' + Number(Number(info.y).toPrecision(5));
}

// Consume the trainer's render payloads as text lines (tests, the relay's interpretation,
// the screen-reader output) and, when a screen is given, also as the real calculator screen.
// traceLabel: the trainer's TRACE readout (TI84ScreenRenderer.traceLabel), so the Park
// shows exactly what the calculator shows (Med=2.5, min=3 max<5 n=2).
// screen: a TI84ScreenRenderer instance (APSTAT_PARK_CALCULATOR_FEEL_SPEC §A) that draws
// the same menu/wizard/result/editor geometry as the TI-84 CE on its own canvas. Graphs are
// not forwarded: the trainer's renderGraph is a static illustration, not the data, so the
// room keeps the text lines for them (kind() === 'graph').
export function createWorldDisplay({ traceLabel = plainTraceLabel, screen = null } = {}) {
  let lines = [{ text: 'READY', selected: false }];
  let kind = 'home';
  const show = (name, payload) => { kind = name; if (screen && name !== 'graph') screen['render' + name[0].toUpperCase() + name.slice(1)](payload); };
  return {
    getLines: () => lines,
    kind: () => kind,
    renderHome(values) { show('home', values); lines = (values.length ? values : ['READY']).map(text => ({ text })); },
    renderMenu(menu) {
      show('menu', menu);
      const tabs = menu.tabs?.map(tab => tab === menu.activeTab ? '[' + tab + ']' : tab).join('  ');
      const first = Math.max(0, menu.cursorIndex - 6);
      lines = [{ text: tabs || menu.title || 'MENU' },
        ...menu.items.slice(first, first + 7).map((text, i) => ({ text, selected: first + i === menu.cursorIndex }))];
    },
    renderWizard(wizard) {
      show('wizard', wizard);
      const first = Math.max(0, wizard.cursorIndex - 5);
      lines = [{ text: wizard.title.replace(/-wizard$/, '').replaceAll('-', ' ') },
        ...wizard.fields.slice(first, first + 6).map((field, i) => ({
          text: field.label + (field.displayValue == null ? '' : ': ' + field.displayValue)
            + (field.cursorOption != null ? ' [' + field.cursorOption + ']' : ''),
          selected: first + i === wizard.cursorIndex,
        }))];
    },
    renderResult(result) { show('result', result); lines = result.lines.map(text => ({ text })); },
    renderEditor(editor) {
      show('editor', editor);
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
      show('graph', graph);
      lines = [{ text: graph?.title || 'GRAPH' }];
      if (graph?.type === 'ModBoxplot') {
        for (const key of ['minX', 'Q1', 'Med', 'Q3', 'maxX']) lines.push({ text: key + '=' + graph.stats[key] });
      } else for (const point of graph?.points?.slice(0, 6) || []) {
        // Histogram bins read like TRACE: lower boundary, exclusive upper boundary, count.
        lines.push({ text: point.upper !== undefined ? traceLabel(point) : 'x=' + point.x + ' y=' + Number(point.y.toPrecision(5)) });
      }
      if (graph?.traceInfo) lines.push({ text: 'TRACE ' + traceLabel(graph.traceInfo), selected: true });
    },
    clear() { kind = 'clear'; lines = []; if (screen) screen.clear(); },
  };
}
