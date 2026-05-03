export type TunnelShape = 'inverted-d' | 'circular' | 'horse-shoe';

export interface SlopeSegment {
  id: string;
  startChainage: number;
  endChainage: number;
  startElevation: number | null;
  slope: number;
}

export interface TunnelConfig {
  id: string;
  name: string;
  shape: TunnelShape;
  width: number;
  wallHeight: number;
  archRadius: number;
  liningThicknessOvert: number;
  liningThicknessInvert: number;
  initialInvertLevel: number;
  wallRadius?: number;
  slopeSegments: SlopeSegment[];
}

export interface SurveyPoint {
  easting: number;
  northing: number;
  elevation: number;
  pointCode?: string;
}

export interface SectionData {
  chainage: number;
  chainageLabel?: string;
  centerSurveyElev: number;
  closestEasting: number;
  points: { easting: number; elevation: number; type: 'survey' | 'inferred' | 'center' | 'manual'; isManual?: boolean; isEdited?: boolean }[];
}

export interface TunnelProfile {
  id: string; // Same as config id
  userId: string;
  config: TunnelConfig;
  sections: SectionData[];
  createdAt?: any;
  updatedAt?: any;
}

export interface CalculationResults {
  areaRock: number;
  areaInner: number;
  areaOuter: number;
  areaConcreteActual: number;
  areaConcreteDesign: number;
  peripheryRock: number;
  peripheryInner: number;
  peripheryOuter: number;
}

export interface UploadOptions {
  format: 'local' | 'global';
  order: 'EN' | 'NE';
  flipSides: boolean;
}

