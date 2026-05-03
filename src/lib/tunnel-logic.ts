import { TunnelConfig, SectionData, SlopeSegment } from '../types';

export function getDesignInvertBottom(chainage: number, segments: SlopeSegment[], initialInvertLevel: number = 0): number | null {
  if (segments.length === 0) return null;

  let currentStartEl = segments[0].startElevation ?? initialInvertLevel;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (i > 0) {
      const prevSeg = segments[i - 1];
      const distPrev = prevSeg.endChainage - prevSeg.startChainage;
      currentStartEl = currentStartEl + (distPrev * prevSeg.slope);
    }

    if (chainage >= seg.startChainage && chainage <= seg.endChainage) {
      const dist = chainage - seg.startChainage;
      return currentStartEl + (dist * seg.slope);
    }
  }

  return null;
}

function generateArcPoints(p1: {x: number, y: number}, p2: {x: number, y: number}, radius: number, numPoints: number) {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (d === 0 || !radius || radius <= 0 || d > 2 * radius) {
    return [p1, p2]; // Fallback to straight line
  }
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const h = Math.sqrt(radius * radius - (d / 2) * (d / 2));
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + h * nx;
  const cy = my + h * ny;

  let startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  let endAngle = Math.atan2(p2.y - cy, p2.x - cx);
  
  // Force counter-clockwise minor arc
  if (endAngle < startAngle) endAngle += 2 * Math.PI;
  if (endAngle - startAngle > Math.PI) {
    // If it's a major arc, we need the other center
    const cx2 = mx - h * nx;
    const cy2 = my - h * ny;
    startAngle = Math.atan2(p1.y - cy2, p1.x - cx2);
    endAngle = Math.atan2(p2.y - cy2, p2.x - cx2);
    if (endAngle < startAngle) endAngle += 2 * Math.PI;
    const pts = [];
    for (let i = 0; i <= numPoints; i++) {
      const theta = startAngle + (i / numPoints) * (endAngle - startAngle);
      pts.push({ x: cx2 + radius * Math.cos(theta), y: cy2 + radius * Math.sin(theta) });
    }
    return pts;
  }

  const pts = [];
  for (let i = 0; i <= numPoints; i++) {
    const theta = startAngle + (i / numPoints) * (endAngle - startAngle);
    pts.push({ x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) });
  }
  return pts;
}

export function getGantryShapes(invertBottomElev: number, config: TunnelConfig) {
  const { shape, width, wallHeight, archRadius, liningThicknessOvert, liningThicknessInvert } = config;
  const invertTop = invertBottomElev + liningThicknessInvert;

  const pointsIn: { x: number; y: number }[] = [];
  const pointsOut: { x: number; y: number }[] = [];

  if (shape === 'inverted-d') {
    // Inner Shape
    const numArchPoints = 50;
    const rIn = archRadius;
    for (let i = 0; i <= numArchPoints; i++) {
      const theta = (i / numArchPoints) * Math.PI;
      const x = rIn * Math.cos(theta);
      const y = (invertTop + wallHeight) + rIn * Math.sin(theta);
      pointsIn.push({ x: -x, y });
    }
    // Add bottom corners
    pointsIn.push({ x: width / 2, y: invertTop });
    pointsIn.push({ x: -width / 2, y: invertTop });

    // Outer Shape
    const outerWidth = width + 2 * liningThicknessOvert;
    const rOut = archRadius + liningThicknessOvert;

    for (let i = 0; i <= numArchPoints; i++) {
      const theta = (i / numArchPoints) * Math.PI;
      const x = rOut * Math.cos(theta);
      const y = (invertTop + wallHeight) + rOut * Math.sin(theta);
      pointsOut.push({ x: -x, y });
    }
    pointsOut.push({ x: outerWidth / 2, y: invertBottomElev });
    pointsOut.push({ x: -outerWidth / 2, y: invertBottomElev });

  } else if (shape === 'circular') {
    // For circular: archRadius is the inner finished radius; center sits on invertTop
    const rIn = archRadius;
    const rOut = archRadius + liningThicknessOvert;
    const numPoints = 100;
    const centerY = invertTop + rIn; // bottom of circle rests on invert top
    for (let i = 0; i <= numPoints; i++) {
      const theta = (i / numPoints) * 2 * Math.PI;
      pointsIn.push({ x: rIn * Math.cos(theta), y: centerY + rIn * Math.sin(theta) });
      pointsOut.push({ x: rOut * Math.cos(theta), y: centerY + rOut * Math.sin(theta) });
    }
  } else if (shape === 'horse-shoe') {
    // True horseshoe: semicircular arch (archRadius) on top of INCLINED/CURVED walls
    // Spring-line width = 2 × archRadius (wider at top)
    // Invert width = width (narrower at bottom)
    const halfInvertW = width / 2;
    const rIn = archRadius;
    const springY = invertTop + wallHeight;
    const numPoints = 50;
    const wallRadius = config.wallRadius || 0;

    // Inner shape
    const rightInvert = { x: halfInvertW, y: invertTop };
    const rightSpring = { x: rIn, y: springY };
    const leftSpring = { x: -rIn, y: springY };
    const leftInvert = { x: -halfInvertW, y: invertTop };

    // Right wall
    const rightWallPts = generateArcPoints(rightInvert, rightSpring, wallRadius, numPoints);
    pointsIn.push(...rightWallPts);

    // Arch
    for (let i = 1; i <= numPoints; i++) {
      const theta = (i / numPoints) * Math.PI;
      pointsIn.push({ x: rIn * Math.cos(theta), y: springY + rIn * Math.sin(theta) });
    }

    // Left wall
    const leftWallPts = generateArcPoints(leftSpring, leftInvert, wallRadius, numPoints);
    // skip the first point of leftWallPts because it's exactly the last point of the arch
    pointsIn.push(...leftWallPts.slice(1));

    // Outer shape: expand walls outward by liningThicknessOvert
    const outerHalfInvertW = halfInvertW + liningThicknessOvert;
    const rOut = rIn + liningThicknessOvert;
    const outerSpringY = springY;
    const outerWallRadius = wallRadius > 0 ? wallRadius + liningThicknessOvert : 0;

    const outRightInvert = { x: outerHalfInvertW, y: invertBottomElev };
    const outRightSpring = { x: rOut, y: outerSpringY };
    const outLeftSpring = { x: -rOut, y: outerSpringY };
    const outLeftInvert = { x: -outerHalfInvertW, y: invertBottomElev };

    const outRightWallPts = generateArcPoints(outRightInvert, outRightSpring, outerWallRadius, numPoints);
    pointsOut.push(...outRightWallPts);

    for (let i = 1; i <= numPoints; i++) {
      const theta = (i / numPoints) * Math.PI;
      pointsOut.push({ x: rOut * Math.cos(theta), y: outerSpringY + rOut * Math.sin(theta) });
    }

    const outLeftWallPts = generateArcPoints(outLeftSpring, outLeftInvert, outerWallRadius, numPoints);
    pointsOut.push(...outLeftWallPts.slice(1));
  }

  return { pointsIn, pointsOut, invertTop };
}

export function calculateArea(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;

  // Sort points angularly around their centroid to ensure shoelace formula works
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  const sortedPoints = points.slice().sort((a, b) => {
    return Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX);
  });

  let area = 0;
  for (let i = 0; i < sortedPoints.length; i++) {
    const j = (i + 1) % sortedPoints.length;
    area += sortedPoints[i].x * sortedPoints[j].y;
    area -= sortedPoints[j].x * sortedPoints[i].y;
  }
  return Math.abs(area) / 2;
}

export function calculatePeriphery(points: { x: number; y: number }[]): number {
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

import { CalculationResults, UploadOptions } from '../types';

export function getCalculationResults(section: SectionData, config: TunnelConfig): CalculationResults | null {
  const invertBottom = getDesignInvertBottom(section.chainage, config.slopeSegments, config.initialInvertLevel);
  if (invertBottom === null) return null;

  const { pointsIn, pointsOut } = getGantryShapes(invertBottom, config);
  const rockPoints = section.points.map(p => ({ x: p.easting, y: p.elevation }));

  const areaRock = calculateArea(rockPoints);
  const areaInner = calculateArea(pointsIn);
  const areaOuter = calculateArea(pointsOut);

  return {
    areaRock,
    areaInner,
    areaOuter,
    areaConcreteActual: areaRock - areaInner,
    areaConcreteDesign: areaOuter - areaInner,
    peripheryRock: calculatePeriphery(rockPoints),
    peripheryInner: calculatePeriphery(pointsIn),
    peripheryOuter: calculatePeriphery(pointsOut),
  };
}

export function processSurveyData(data: any[][], options: UploadOptions): SectionData[] {
  const sectionsMap = new Map<string, {
    chainage: number;
    chainageLabel: string;
    points: { easting: number; northing: number; elevation: number; text: string; isGlobal: boolean }[]
  }>();

  const sectionKeysOrder: string[] = [];

  if (!data || data.length === 0) return [];

  let colEast = -1;
  let colNorth = -1;
  let colElev = -1;
  let colCode = -1;

  let startIndex = 0;
  
  // Check if first row is a header
  const firstRow = data[0];
  if (firstRow && firstRow.some((cell: any) => typeof cell === 'string' && cell.toLowerCase().includes('easting'))) {
    startIndex = 1;
    // We can still try to read the column indices from the header if they exist, but if order is explicitly set, we should probably prefer the order, or at least the headers if they are clear.
    // Given the user explicit selection, let's map strictly based on the order for the first 3 numeric columns.
  } else if (firstRow && firstRow.some((cell: any) => typeof cell === 'string' && /[a-z]/i.test(cell))) {
    // Has some string headers
    startIndex = 1;
  }

  // Find columns based on options
  if (options.order === 'EN') {
    // Find the first 4 columns that seem to have data
    colEast = 1; colNorth = 2; colElev = 3; colCode = 4;
  } else { // NE
    colEast = 2; colNorth = 1; colElev = 3; colCode = 4;
  }

  // Adjust if only 4 columns (no serial)
  const sampleRow = data[startIndex];
  if (sampleRow && sampleRow.length === 4) {
    if (options.order === 'EN') {
      colEast = 0; colNorth = 1; colElev = 2; colCode = 3;
    } else {
      colEast = 1; colNorth = 0; colElev = 2; colCode = 3;
    }
  }

  const isGlobalCoords = options.format === 'global';

  for (let i = startIndex; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 3) continue;

    const easting = parseFloat(row[colEast]);
    const northing = parseFloat(row[colNorth]);
    const elevation = parseFloat(row[colElev]);
    
    let textParts = [];
    const maxCoordCol = Math.max(colEast, colNorth, colElev);
    for (let c = maxCoordCol + 1; c < row.length; c++) {
      if (row[c] !== undefined && row[c] !== null) {
        textParts.push(String(row[c]));
      }
    }
    const text = textParts.join(' ').trim();

    if (isNaN(easting) || isNaN(elevation)) continue;

    let chainageLabel = text;
    let chainageNum: number | null = null;

    if (isGlobalCoords) {
      const match = text.match(/(?:CH[O0\.]?\s*)?(\d+)\+(\d+)[_\.](\d+)M?/i);
      if (match) {
        const km = parseFloat(match[1] || '0');
        const m = parseFloat(`${match[2]}.${match[3]}`);
        chainageNum = km * 1000 + m;
        chainageLabel = `CH ${chainageNum.toFixed(2)}`;
      } else {
        // Fallback: extract leading number, ignore trailing C/CL/CC/L/R suffixes
        const numMatch = text.match(/^([\d.]+)\s*(?:[CLR]+|CL|CC|C)?\s*$/i);
        if (numMatch) {
          chainageNum = parseFloat(numMatch[1]);
          chainageLabel = `CH ${chainageNum.toFixed(2)}`;
        } else {
          chainageNum = null; 
        }
      }
    } else {
      const pc = text.toUpperCase();
      if (pc === 'CL') {
        chainageNum = isNaN(northing) ? 0 : northing;
      } else {
        const parsed = parseFloat(pc);
        if (!isNaN(parsed)) chainageNum = parsed;
      }
      if (chainageNum === null) {
        chainageNum = isNaN(northing) ? 0 : northing;
      }
      chainageLabel = `CH ${chainageNum}`;
    }

    const key = (chainageNum !== null) ? `CH_${chainageNum}` : `LBL_${text}`;

    if (!sectionsMap.has(key)) {
      sectionsMap.set(key, {
        chainage: chainageNum !== null ? chainageNum : sectionsMap.size * -10000, 
        chainageLabel: chainageLabel,
        points: []
      });
      sectionKeysOrder.push(key);
    }

    sectionsMap.get(key)!.points.push({ easting, northing, elevation, text, isGlobal: isGlobalCoords });
  }

  const sections: SectionData[] = [];

  // Pre-calculate Center points for Auto-Azimuth
  const sectionCenters = new Map<string, { x: number, y: number }>();
  for (const key of sectionKeysOrder) {
    const group = sectionsMap.get(key)!;
    if (group.points.length === 0) continue;
    let centerPt = group.points.find(p => /\b(?:C|CC|CL)\b/i.test(p.text));
    if (!centerPt) {
      centerPt = group.points[Math.floor(group.points.length / 2)]; 
    }
    sectionCenters.set(key, { x: centerPt.easting, y: centerPt.northing });
  }

  for (let i = 0; i < sectionKeysOrder.length; i++) {
    const key = sectionKeysOrder[i];
    const group = sectionsMap.get(key)!;
    if (group.points.length === 0) continue;

    const isGlobal = group.points[0].isGlobal;
    
    let closestEasting = Infinity;
    let centerSurveyElev = 0;
    const finalPoints: { easting: number; elevation: number; type: 'survey' | 'inferred' | 'center' | 'manual' }[] = [];

    if (isGlobal) {
      let centerPt = group.points.find(p => /\b(?:C|CC|CL)\b/i.test(p.text));
      if (!centerPt) {
        centerPt = group.points[Math.floor(group.points.length / 2)]; 
      }

      // Calculate Heading Normal Vector (Nx, Ny)
      let Nx = 1; let Ny = 0; // Default if only 1 chainage
      if (sectionKeysOrder.length > 1) {
        let prevC = i > 0 ? sectionCenters.get(sectionKeysOrder[i - 1])! : null;
        let nextC = i < sectionKeysOrder.length - 1 ? sectionCenters.get(sectionKeysOrder[i + 1])! : null;
        
        let Tx = 0, Ty = 1;
        if (prevC && nextC) {
          Tx = nextC.x - prevC.x;
          Ty = nextC.y - prevC.y;
        } else if (prevC) {
          Tx = centerPt.easting - prevC.x;
          Ty = centerPt.northing - prevC.y;
        } else if (nextC) {
          Tx = nextC.x - centerPt.easting;
          Ty = nextC.y - centerPt.northing;
        }
        
        const len = Math.hypot(Tx, Ty);
        if (len > 0) {
          Tx /= len;
          Ty /= len;
          // Normal to the right of forward vector T
          Nx = Ty;
          Ny = -Tx;
        }
      }

      group.points.forEach(p => {
        let localEasting = 0;
        
        if (/\bL\b/i.test(p.text)) {
          localEasting = -Math.hypot(p.easting - centerPt!.easting, p.northing - centerPt!.northing);
        } else if (/\bR\b/i.test(p.text)) {
          localEasting = Math.hypot(p.easting - centerPt!.easting, p.northing - centerPt!.northing);
        } else if (/\b(?:C|CC|CL)\b/i.test(p.text) || p === centerPt) {
          localEasting = 0;
        } else {
          // Auto-calculate using dot product with Normal
          const dx = p.easting - centerPt!.easting;
          const dy = p.northing - centerPt!.northing;
          localEasting = dx * Nx + dy * Ny;
        }
        
        const eastingVal = options.flipSides ? -1 * localEasting : localEasting;

        if (Math.abs(eastingVal) < Math.abs(closestEasting)) {
          closestEasting = eastingVal;
          centerSurveyElev = p.elevation;
        }

        finalPoints.push({ easting: eastingVal, elevation: p.elevation, type: 'survey' });
      });

    } else {
      group.points.forEach(p => {
        const eastingVal = options.flipSides ? -1 * p.easting : p.easting;
        if (Math.abs(eastingVal) < Math.abs(closestEasting)) {
          closestEasting = eastingVal;
          centerSurveyElev = p.elevation;
        }
        finalPoints.push({ easting: eastingVal, elevation: p.elevation, type: 'survey' });
      });
    }

    if (finalPoints.length > 0) {
      const sec: SectionData = {
        chainage: group.chainage,
        chainageLabel: group.chainageLabel,
        centerSurveyElev: centerSurveyElev,
        closestEasting: closestEasting === Infinity ? 0 : closestEasting,
        points: finalPoints
      };

      const centerX = sec.points.reduce((sum, p) => sum + p.easting, 0) / sec.points.length;
      const centerY = sec.points.reduce((sum, p) => sum + p.elevation, 0) / sec.points.length;

      sec.points.sort((a, b) => {
        return Math.atan2(a.elevation - centerY, a.easting - centerX) - Math.atan2(b.elevation - centerY, b.easting - centerX);
      });

      sections.push(sec);
    }
  }

  return sections;
}
