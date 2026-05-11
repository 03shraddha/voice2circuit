export function applyModifications(currentDrawing, operations) {
  let elements = [...currentDrawing.drawing];

  for (const op of operations) {
    switch (op.op) {
      case 'insert_after': {
        const idx = elements.findIndex(e => e.id === op.after_id);
        if (idx === -1) throw new Error(`Element id "${op.after_id}" not found`);
        elements.splice(idx + 1, 0, op.element);
        break;
      }
      case 'prepend':
        elements.unshift(op.element);
        break;
      case 'replace': {
        const idx = elements.findIndex(e => e.id === op.id);
        if (idx === -1) throw new Error(`Element id "${op.id}" not found`);
        elements[idx] = op.element;
        break;
      }
      case 'delete': {
        const idx = elements.findIndex(e => e.id === op.id);
        if (idx === -1) throw new Error(`Element id "${op.id}" not found`);
        elements.splice(idx, 1);
        break;
      }
    }
  }

  return { ...currentDrawing, drawing: elements };
}

export function summariseDrawing(drawing) {
  if (!drawing) return 'No circuit drawn yet.';
  const lines = drawing.drawing.map(el => {
    const parts = [el.type];
    if (el.id)    parts.push(`id=${el.id}`);
    if (el.value) parts.push(`value=${el.value}`);
    if (el.at)    parts.push(`at=${el.at}`);
    return parts.join(' ');
  });
  return `Title: ${drawing.title}\nElements:\n${lines.map(l => '  ' + l).join('\n')}`;
}
