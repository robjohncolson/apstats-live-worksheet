// Consume the trainer's render payloads without constructing a green LCD canvas.
export function createWorldDisplay() {
  let lines = [{ text: 'READY', selected: false }];
  return {
    getLines: () => lines,
    renderHome(values) { lines = (values.length ? values : ['READY']).map(text => ({ text })); },
    renderMenu(menu) {
      const tabs = menu.tabs?.map(tab => tab === menu.activeTab ? '[' + tab + ']' : tab).join('  ');
      lines = [{ text: tabs || menu.title || 'MENU' },
        ...menu.items.slice(0, 7).map((text, i) => ({ text, selected: i === menu.cursorIndex }))];
    },
    renderWizard(wizard) {
      lines = [{ text: wizard.title.replace(/-wizard$/, '').replaceAll('-', ' ') },
        ...wizard.fields.map((field, i) => ({
          text: field.label + (field.displayValue == null ? '' : ': ' + field.displayValue),
          selected: i === wizard.cursorIndex,
        }))];
    },
    renderResult(result) { lines = result.lines.map(text => ({ text })); },
    renderEditor() { lines = [{ text: 'LIST EDITOR' }]; },
    renderGraph() { lines = [{ text: 'GRAPH' }]; },
    clear() { lines = []; },
  };
}
