import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ComponentTypeEnum,
  DrawingElement,
  CircuitDrawing,
  ModifyOperation,
  CircuitModify,
} from '../circuit-schema.js';

describe('ComponentTypeEnum', () => {
  it('accepts a valid component type', () => {
    expect(ComponentTypeEnum.parse('resistor')).toBe('resistor');
    expect(ComponentTypeEnum.parse('opamp')).toBe('opamp');
    expect(ComponentTypeEnum.parse('dot')).toBe('dot');
  });

  it('rejects an unknown component type', () => {
    expect(() => ComponentTypeEnum.parse('transformer')).toThrow(z.ZodError);
    expect(() => ComponentTypeEnum.parse('')).toThrow(z.ZodError);
  });
});

describe('DrawingElement', () => {
  it('parses a minimal element (type only)', () => {
    const result = DrawingElement.parse({ type: 'ground' });
    expect(result.type).toBe('ground');
  });

  it('parses a fully-specified element', () => {
    const input = {
      type: 'resistor',
      id: 'R1',
      direction: 'right',
      length: 2.0,
      value: '10k',
      label: 'R1',
      at: 'V1.end',
      flip: false,
      reverse: false,
    };
    expect(DrawingElement.parse(input)).toEqual(input);
  });

  it('rejects a negative length', () => {
    expect(() => DrawingElement.parse({ type: 'capacitor', length: -1 })).toThrow(z.ZodError);
  });

  it('rejects zero length', () => {
    expect(() => DrawingElement.parse({ type: 'inductor', length: 0 })).toThrow(z.ZodError);
  });
});

describe('CircuitDrawing', () => {
  it('rejects an empty drawing array', () => {
    expect(() =>
      CircuitDrawing.parse({ title: 'T', description: 'D', drawing: [] })
    ).toThrow(z.ZodError);
  });

  it('accepts a valid drawing with one element', () => {
    const result = CircuitDrawing.parse({
      title: 'RC Filter',
      description: 'A simple RC filter',
      drawing: [{ type: 'resistor', id: 'R1', value: '10k' }],
    });
    expect(result.drawing).toHaveLength(1);
  });
});

describe('ModifyOperation', () => {
  it('parses a valid delete operation', () => {
    const result = ModifyOperation.parse({ op: 'delete', id: 'R1' });
    expect(result.op).toBe('delete');
    expect(result.id).toBe('R1');
  });

  it('rejects a delete operation missing id', () => {
    expect(() => ModifyOperation.parse({ op: 'delete' })).toThrow(z.ZodError);
  });

  it('parses a valid prepend operation', () => {
    const result = ModifyOperation.parse({
      op: 'prepend',
      element: { type: 'vcc' },
    });
    expect(result.op).toBe('prepend');
  });
});

describe('CircuitModify', () => {
  it('rejects an empty operations array', () => {
    expect(() =>
      CircuitModify.parse({ operations: [], description: 'nothing' })
    ).toThrow(z.ZodError);
  });
});
