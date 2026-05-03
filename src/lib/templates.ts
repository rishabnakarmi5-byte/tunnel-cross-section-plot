import { TunnelConfig, TunnelShape } from '../types';

export interface ShapeTemplate {
  label: string;
  description: string;
  accent: string;         // tailwind color token for UI
  accentHex: string;      // hex for SVG/canvas use
}

export const SHAPE_META: Record<TunnelShape, ShapeTemplate> = {
  'inverted-d': {
    label: 'Inverted D',
    description: 'Semicircular arch on vertical walls. Standard for hydropower tunnels.',
    accent: 'blue',
    accentHex: '#3b82f6',
  },
  'circular': {
    label: 'Circular',
    description: 'Full circular bore. Used for pressure tunnels and shafts.',
    accent: 'violet',
    accentHex: '#8b5cf6',
  },
  'horse-shoe': {
    label: 'Horse Shoe',
    description: 'Semicircular arch with inclined walls narrowing to invert. Arch radius is independent of width.',
    accent: 'emerald',
    accentHex: '#10b981',
  },
};

/** Geometry-only defaults per shape (no elevation/slope — those are site-specific). */
const SHAPE_GEOMETRY: Record<TunnelShape, Omit<TunnelConfig, 'id' | 'name' | 'initialInvertLevel' | 'slopeSegments'>> = {
  'inverted-d': {
    shape: 'inverted-d',
    width: 4.60,
    wallHeight: 2.30,
    archRadius: 2.30,
    liningThicknessOvert: 0.25,
    liningThicknessInvert: 0.25,
  },
  'circular': {
    shape: 'circular',
    width: 4.00,       // kept for bounds calc; visual uses archRadius
    wallHeight: 0,
    archRadius: 2.00,
    liningThicknessOvert: 0.25,
    liningThicknessInvert: 0.25,
  },
  'horse-shoe': {
    shape: 'horse-shoe',
    width: 4.83,              // invert (bottom) width
    wallHeight: 2.71,         // invert top to spring line
    archRadius: 3.05,         // independent; spring-line width = 2 × R = 6.10
    liningThicknessOvert: 0.05,
    liningThicknessInvert: 0.25,
    wallRadius: 6.25,         // independent; curves the walls below SPL
  },
};

/**
 * Create a full TunnelConfig from a shape template.
 * initialInvertLevel defaults to 1271 m — users should update it to their site elevation.
 */
export function createDefaultConfig(
  shape: TunnelShape = 'inverted-d',
  initialInvertLevel = 1271.00,
  id = 'default',
  name?: string,
): TunnelConfig {
  const geo = SHAPE_GEOMETRY[shape];
  const profileName = name ?? `${SHAPE_META[shape].label} Profile`;
  return {
    id,
    name: profileName,
    ...geo,
    initialInvertLevel,
    slopeSegments: [
      {
        id: 'seg-1',
        startChainage: 0,
        endChainage: 9999,
        startElevation: initialInvertLevel,
        slope: 0,
      },
    ],
  };
}

/** Returns only the geometry fields for a shape, preserving current elevation/slope data. */
export function applyShapeTemplate(current: TunnelConfig, shape: TunnelShape): TunnelConfig {
  const geo = SHAPE_GEOMETRY[shape];
  return {
    ...current,
    ...geo,
    // keep user's elevation and slope segments
    initialInvertLevel: current.initialInvertLevel,
    slopeSegments: current.slopeSegments,
  };
}
