import { describe, it, expect, beforeEach } from 'vitest';
import { applyModifications, summariseDrawing } from '../circuit-state.js';

const makeBase = () => ({
  title: 'Test Circuit',
  description: 'For testing',
  drawing: [
    { id: 'R1', type: 'resistor', value: '10k' },
    { id: 'C1', type: 'capacitor', value: '100n' },
  ],
});

describe('applyModifications', () => {
  it('replace changes the target element value', () => {
    const base = makeBase();
    const result = applyModifications(base, [
      { op: 'replace', id: 'R1', element: { id: 'R1', type: 'resistor', value: '22k' } },
    ]);
    expect(result.drawing[0].value).toBe('22k');
    expect(result.drawing).toHaveLength(2);
  });

  it('delete removes the specified element', () => {
    const base = makeBase();
    const result = applyModifications(base, [{ op: 'delete', id: 'C1' }]);
    expect(result.drawing).toHaveLength(1);
    expect(result.drawing[0].id).toBe('R1');
  });

  it('insert_after places element immediately after the target', () => {
    const base = makeBase();
    const result = applyModifications(base, [
      { op: 'insert_after', after_id: 'R1', element: { id: 'L1', type: 'inductor' } },
    ]);
    expect(result.drawing).toHaveLength(3);
    expect(result.drawing[1].id).toBe('L1');
    expect(result.drawing[2].id).toBe('C1');
  });

  it('prepend inserts element at index 0', () => {
    const base = makeBase();
    const result = applyModifications(base, [
      { op: 'prepend', element: { id: 'VCC1', type: 'vcc' } },
    ]);
    expect(result.drawing).toHaveLength(3);
    expect(result.drawing[0].id).toBe('VCC1');
  });

  it('replace throws for unknown id', () => {
    const base = makeBase();
    expect(() =>
      applyModifications(base, [
        { op: 'replace', id: 'NONEXISTENT', element: { type: 'resistor' } },
      ])
    ).toThrow('NONEXISTENT');
  });

  it('insert_after throws for unknown after_id', () => {
    const base = makeBase();
    expect(() =>
      applyModifications(base, [
        { op: 'insert_after', after_id: 'X99', element: { type: 'capacitor' } },
      ])
    ).toThrow('X99');
  });

  it('does not mutate the original drawing array', () => {
    const base = makeBase();
    const originalLength = base.drawing.length;
    applyModifications(base, [{ op: 'delete', id: 'C1' }]);
    expect(base.drawing).toHaveLength(originalLength);
  });
});

describe('summariseDrawing', () => {
  it('returns sentinel string for null input', () => {
    expect(summariseDrawing(null)).toBe('No circuit drawn yet.');
  });

  it('formats the circuit title and elements correctly', () => {
    const base = makeBase();
    const result = summariseDrawing(base);
    expect(result).toContain('Title: Test Circuit');
    expect(result).toContain('id=R1');
    expect(result).toContain('value=10k');
    expect(result).toContain('id=C1');
  });
});
