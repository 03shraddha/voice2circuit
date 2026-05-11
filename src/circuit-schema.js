import { z } from 'zod';

export const ComponentTypeEnum = z.enum([
  'resistor', 'capacitor', 'inductor',
  'npn_bjt', 'pnp_bjt',
  'nmos', 'pmos',
  'diode', 'led', 'zener',
  'opamp',
  'voltage_source', 'current_source', 'battery',
  'ground', 'vcc',
  'wire', 'line', 'dot',
]);

export const DirectionEnum = z.enum(['right', 'left', 'up', 'down']);

export const DrawingElement = z.object({
  id:        z.string().optional(),
  type:      ComponentTypeEnum,
  direction: DirectionEnum.optional(),
  length:    z.number().positive().optional(),
  value:     z.string().optional(),
  label:     z.string().optional(),
  at:        z.string().optional(),
  flip:      z.boolean().optional(),
  reverse:   z.boolean().optional(),
});

export const CircuitDrawing = z.object({
  title:       z.string(),
  description: z.string(),
  drawing:     z.array(DrawingElement).min(1),
});

export const ModifyOperation = z.discriminatedUnion('op', [
  z.object({ op: z.literal('insert_after'), after_id: z.string(), element: DrawingElement }),
  z.object({ op: z.literal('prepend'),                             element: DrawingElement }),
  z.object({ op: z.literal('replace'),      id:       z.string(), element: DrawingElement }),
  z.object({ op: z.literal('delete'),       id:       z.string() }),
]);

export const CircuitModify = z.object({
  operations:  z.array(ModifyOperation).min(1),
  description: z.string(),
});
