import { SectionData, TunnelConfig } from '../types';
import { getGantryShapes, getDesignInvertBottom, getCalculationResults } from './tunnel-logic';
import Drawing from 'dxf-writer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToDXF(sections: SectionData[], config: TunnelConfig) {
  console.log('Starting DXF export...');
  const drawing = new Drawing();
  
  // Create layers
  drawing.addLineType('CENTER', 'Center ____ _ ____', [2, -0.5, 0.2, -0.5]);
  drawing.addLayer('SURVEY', Drawing.ACI.CYAN, 'CONTINUOUS');
  drawing.addLayer('DESIGN_OUTER', Drawing.ACI.RED, 'CONTINUOUS');
  drawing.addLayer('FINISH_INNER', Drawing.ACI.GREEN, 'CONTINUOUS');
  drawing.addLayer('CENTER_LINES', Drawing.ACI.YELLOW, 'CENTER');
  drawing.addLayer('DIMENSIONS', Drawing.ACI.WHITE, 'CONTINUOUS');
  drawing.addLayer('BORDER', Drawing.ACI.WHITE, 'CONTINUOUS');
  drawing.addLayer('TEXT', Drawing.ACI.WHITE, 'CONTINUOUS');
  
  const cadSpacing = 30; // m
  let xOffset = 0;

  sections.forEach((section, index) => {
    console.log(`Processing section ${index} at chainage ${section.chainage}`);
    const invertBottom = getDesignInvertBottom(section.chainage, config.slopeSegments);
    if (invertBottom === null) return;

    const { pointsIn, pointsOut } = getGantryShapes(invertBottom, config);
    const results = getCalculationResults(section, config);
    if (!results) return;

    // Survey Profile
    const surveyPoints: [number, number][] = section.points.map(p => [p.easting + xOffset, p.elevation]);
    try {
      drawing.setActiveLayer('SURVEY');
      drawing.drawPolyline(surveyPoints, true);
    } catch (e) {
      console.error('Error drawing survey polyline:', e);
    }

    // Design Outer
    const outerPoints: [number, number][] = pointsOut.map(p => [p.x + xOffset, p.y]);
    drawing.setActiveLayer('DESIGN_OUTER');
    drawing.drawPolyline(outerPoints, true);

    // Finish Inner
    const innerPoints: [number, number][] = pointsIn.map(p => [p.x + xOffset, p.y]);
    drawing.setActiveLayer('FINISH_INNER');
    drawing.drawPolyline(innerPoints, true);

    // Center Lines
    const invertTop = invertBottom + config.liningThicknessInvert;
    const splY = invertTop + config.wallHeight;
    const maxInnerY = pointsIn.length > 0 ? pointsIn.reduce((max, p) => Math.max(max, p.y), -Infinity) : 0;
    
    drawing.setActiveLayer('CENTER_LINES');
    // Vertical center line
    drawing.drawLine(xOffset, invertBottom - 2, xOffset, maxInnerY + 2);
    // Horizontal center line at Spring Level (SPL)
    if (config.wallHeight > 0) {
      // Extent driven by design outer shape geometry, not hardcoded
      const maxOuterX = pointsOut.reduce((max, p) => Math.max(max, Math.abs(p.x)), 0);
      const extH = maxOuterX + 1;
      drawing.drawLine(xOffset - extH, splY, xOffset + extH, splY);
    }
    
    drawing.setActiveLayer('TEXT');
    drawing.drawText(xOffset + 0.2, invertBottom - 2, 0.08, 0, 'CL', 'left', 'bottom');

    // Dimensions
    drawing.setActiveLayer('DIMENSIONS');
    const wHalf = config.shape === 'circular' ? config.archRadius : Math.max(config.width / 2, config.archRadius);
    
    // Height to SPL
    const dimX = xOffset + wHalf + 1.5;
    if (config.wallHeight > 0) {
      drawing.drawLine(dimX, invertTop, dimX, splY);
      drawing.drawLine(dimX - 0.2, invertTop, dimX + 0.2, invertTop);
      drawing.drawLine(dimX - 0.2, splY, dimX + 0.2, splY);
      drawing.drawText(dimX + 0.2, (invertTop + splY) / 2, 0.08, 90, `${config.wallHeight.toFixed(2)}m`, 'center', 'bottom');
    }
    
    // Height to Crown
    const dimX2 = xOffset + wHalf + 2.5;
    drawing.drawLine(dimX2, invertTop, dimX2, maxInnerY);
    drawing.drawLine(dimX2 - 0.2, invertTop, dimX2 + 0.2, invertTop);
    drawing.drawLine(dimX2 - 0.2, maxInnerY, dimX2 + 0.2, maxInnerY);
    drawing.drawText(dimX2 + 0.2, (invertTop + maxInnerY) / 2, 0.08, 90, `${(maxInnerY - invertTop).toFixed(2)}m`, 'center', 'bottom');

    // Callout Arrows
    // Design Line
    const designPtInLeft = pointsIn.length > 0 ? pointsIn.reduce((max, p) => p.y - p.x > max.y - max.x ? p : max, pointsIn[0]) : null;
    if (designPtInLeft) {
      const px = designPtInLeft.x + xOffset;
      const py = designPtInLeft.y;
      drawing.setActiveLayer('TEXT');
      drawing.drawLine(px - 1.5, py + 1.5, px, py);
      // Arrowhead manually
      const angle = Math.atan2(py - (py + 1.5), px - (px - 1.5));
      const arrL = 0.3;
      drawing.drawLine(px, py, px - arrL * Math.cos(angle - Math.PI/6), py - arrL * Math.sin(angle - Math.PI/6));
      drawing.drawLine(px, py, px - arrL * Math.cos(angle + Math.PI/6), py - arrL * Math.sin(angle + Math.PI/6));
      drawing.drawText(px - 1.6, py + 1.5, 0.08, 0, 'Design Line', 'right', 'middle');
    }

    // Rock Line
    const rockPtPos = section.points.length > 0 ? section.points.reduce((max, p) => p.elevation + p.easting > max.elevation + max.easting ? p : max, section.points[0]) : null;
    if (rockPtPos) {
      const px = rockPtPos.easting + xOffset;
      const py = rockPtPos.elevation;
      drawing.setActiveLayer('TEXT');
      drawing.drawLine(px + 1.5, py + 1.5, px, py);
      // Arrowhead manually
      const angle = Math.atan2(py - (py + 1.5), px - (px + 1.5));
      const arrL = 0.3;
      drawing.drawLine(px, py, px - arrL * Math.cos(angle - Math.PI/6), py - arrL * Math.sin(angle - Math.PI/6));
      drawing.drawLine(px, py, px - arrL * Math.cos(angle + Math.PI/6), py - arrL * Math.sin(angle + Math.PI/6));
      drawing.drawText(px + 1.6, py + 1.5, 0.08, 0, 'Rock Line', 'left', 'middle');
    }

    // Data Block
    drawing.setActiveLayer('TEXT');
    const textX = xOffset - 5;
    const textY = invertBottom - 5;
    const lineHeight = 1.2;

    const dataLines = [
      `CHAINAGE: ${section.chainage.toFixed(2)}`,
      `INVERT EL: ${invertBottom.toFixed(3)}`,
      `--------------------------`,
      `AREAS (sq.m):`,
      `  EXCAVATED: ${results.areaRock.toFixed(2)}`,
      `  LINING (ACTUAL): ${results.areaConcreteActual.toFixed(2)}`,
      `  LINING (DESIGN): ${results.areaConcreteDesign.toFixed(2)}`,
      `--------------------------`,
      `PERIPHERIES (m):`,
      `  ROCK LINE: ${results.peripheryRock.toFixed(2)}`,
      `  INNER LINING: ${results.peripheryInner.toFixed(2)}`,
      `  OUTER LINING: ${results.peripheryOuter.toFixed(2)}`,
      `--------------------------`,
      `OVERBREAK: ${(results.areaRock - results.areaOuter).toFixed(2)} sq.m`
    ];

    dataLines.forEach((line, i) => {
      drawing.drawText(textX, textY - (i * lineHeight), 0.08, 0, line);
    });

    // Border
    const borderPoints: [number, number][] = [
      [xOffset - 10, invertBottom - 25],
      [xOffset + 10, invertBottom - 25],
      [xOffset + 10, invertBottom + 15],
      [xOffset - 10, invertBottom + 15]
    ];
    drawing.setActiveLayer('BORDER');
    drawing.drawPolyline(borderPoints, true);

    xOffset += cadSpacing;
  });

  return drawing.toDxfString();
}

function renderSectionToImage(section: SectionData, config: TunnelConfig, _globalBounds?: {minX: number, maxX: number, minY: number, maxY: number}): { dataUrl: string, width: number, height: number, actW: number, rangeX: number } | null {
  const invertBottom = getDesignInvertBottom(section.chainage, config.slopeSegments);
  if (invertBottom === null) return null;

  const { pointsIn, pointsOut } = getGantryShapes(invertBottom, config);
  const results = getCalculationResults(section, config);
  if (!results) return null;

  const allPoints = section.points.map(p => ({ x: p.easting, y: p.elevation }))
    .concat(pointsIn).concat(pointsOut);
  if (allPoints.length === 0) return null;

  const invertTop = invertBottom + config.liningThicknessInvert;
  const maxInnerY = pointsIn.length > 0 ? pointsIn.reduce((max, p) => Math.max(max, p.y), -Infinity) : invertTop;
  const splY = invertTop + config.wallHeight;

  // --- Compute nice axis bounds ---
  let dataMinX = allPoints.reduce((m, p) => Math.min(m, p.x), Infinity);
  let dataMaxX = allPoints.reduce((m, p) => Math.max(m, p.x), -Infinity);
  let dataMinY = allPoints.reduce((m, p) => Math.min(m, p.y), Infinity);
  let dataMaxY = allPoints.reduce((m, p) => Math.max(m, p.y), -Infinity);

  // Symmetric X around 0
  const maxAbsX = Math.max(Math.abs(dataMinX), Math.abs(dataMaxX));

  const niceStep = (range: number, targetTicks: number) => {
    const rough = range / targetTicks;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const frac = rough / pow;
    let nice: number;
    if (frac <= 1.5) nice = 1;
    else if (frac <= 3) nice = 2;
    else if (frac <= 7) nice = 5;
    else nice = 10;
    return nice * pow;
  };

  const stepX = niceStep(maxAbsX * 2 + 1, 6);
  const stepY = niceStep(dataMaxY - dataMinY + 1, 6);

  const minX = -Math.ceil((maxAbsX + 0.3) / stepX) * stepX;
  const maxX = Math.ceil((maxAbsX + 0.3) / stepX) * stepX;
  const minY = Math.floor((dataMinY - 0.3) / stepY) * stepY;
  const maxY = Math.ceil((dataMaxY + 0.3) / stepY) * stepY;

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // --- Canvas setup ---
  const canvasW = 4000;
  const canvasH = 3000;
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // --- Layout: plot on left, info box on the right margin ---
  const mLeft = 350, mRight = 900, mTop = 160, mBottom = 250;
  const ENG = 'Arial, sans-serif';
  const plotW = canvasW - mLeft - mRight;
  const plotH = canvasH - mTop - mBottom;

  // Fit with aspect ratio
  const scX = plotW / rangeX, scY = plotH / rangeY;
  const scale = Math.min(scX, scY);
  const actW = rangeX * scale;
  const actH = rangeY * scale;
  const pL = mLeft + (plotW - actW) / 2;
  const pT = mTop + (plotH - actH) / 2;

  const tx = (x: number) => pL + (x - minX) * scale;
  const ty = (y: number) => pT + actH - (y - minY) * scale;

  // --- Grid ---
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  for (let x = minX; x <= maxX; x += stepX) {
    ctx.beginPath(); ctx.moveTo(tx(x), ty(minY)); ctx.lineTo(tx(x), ty(maxY)); ctx.stroke();
  }
  for (let y = minY; y <= maxY; y += stepY) {
    ctx.beginPath(); ctx.moveTo(tx(minX), ty(y)); ctx.lineTo(tx(maxX), ty(y)); ctx.stroke();
  }

  // --- Plot border ---
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(tx(minX), ty(maxY), actW, actH);

  // --- Axis tick labels ---
  ctx.fillStyle = '#000000';
  ctx.font = `52px ${ENG}`;
  ctx.textBaseline = 'top';
  for (let x = minX; x <= maxX + 0.001; x += stepX) {
    ctx.textAlign = 'center';
    ctx.fillText(x.toFixed(0), tx(x), ty(minY) + 22);
  }
  ctx.textBaseline = 'middle';
  for (let y = minY; y <= maxY + 0.001; y += stepY) {
    ctx.textAlign = 'right';
    ctx.fillText(y.toFixed(0), tx(minX) - 22, ty(y));
  }

  // --- Axis titles ---
  ctx.font = `bold 56px ${ENG}`;
  ctx.textAlign = 'center';
  ctx.fillText('Offset (m)', tx(minX) + actW / 2, ty(minY) + 110);
  ctx.save();
  ctx.translate(tx(minX) - 170, ty(minY) - actH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Elevation (m)', 0, 0);
  ctx.restore();

  // --- Title ---
  ctx.font = `bold 64px ${ENG}`;
  ctx.textAlign = 'center';
  ctx.fillText(`Tunnel Cross Section: Ch ${section.chainage.toFixed(1)}`, pL + actW / 2, mTop / 2 - 10);

  // --- Drawing helpers ---
  const drawPath = (pts: {x: number, y: number}[], stroke: string, lw: number, dash: number[] = [], fill?: string) => {
    if (pts.length === 0) return;
    ctx.beginPath();
    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(tx(p.x), ty(p.y)); else ctx.lineTo(tx(p.x), ty(p.y)); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  };

  // --- Light fill inside rock profile (overbreak zone) ---
  if (section.points.length > 0) {
    ctx.beginPath();
    section.points.forEach((p, i) => { if (i === 0) ctx.moveTo(tx(p.easting), ty(p.elevation)); else ctx.lineTo(tx(p.easting), ty(p.elevation)); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(200, 210, 230, 0.25)';
    ctx.fill();
  }

  // --- Concrete lining: hatched area between finished inner and rock profile ---
  // Build clipping region = rock polygon MINUS finished inner polygon, then draw hatching
  if (pointsIn.length > 0 && section.points.length > 0) {
    ctx.save();
    // Clip to the ring between rock and inner
    ctx.beginPath();
    // Outer boundary: rock points
    section.points.forEach((p, i) => { if (i === 0) ctx.moveTo(tx(p.easting), ty(p.elevation)); else ctx.lineTo(tx(p.easting), ty(p.elevation)); });
    ctx.closePath();
    // Inner boundary (hole): finished inner — reverse winding
    ctx.moveTo(tx(pointsIn[pointsIn.length - 1].x), ty(pointsIn[pointsIn.length - 1].y));
    for (let i = pointsIn.length - 2; i >= 0; i--) ctx.lineTo(tx(pointsIn[i].x), ty(pointsIn[i].y));
    ctx.closePath();
    ctx.clip('evenodd');

    // Draw diagonal hatch lines across the entire plot area
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    const hatchSpacing = 24;
    const hLeft = tx(minX) - actH; // start far enough left
    const hRight = tx(maxX);
    const hTop = ty(maxY);
    const hBottom = ty(minY);
    for (let d = hLeft; d <= hRight + actH; d += hatchSpacing) {
      ctx.beginPath();
      ctx.moveTo(d, hBottom);
      ctx.lineTo(d + (hBottom - hTop), hTop);
      ctx.stroke();
    }
    ctx.restore();

    // Solid gray fill behind hatching for readability
    ctx.save();
    ctx.beginPath();
    section.points.forEach((p, i) => { if (i === 0) ctx.moveTo(tx(p.easting), ty(p.elevation)); else ctx.lineTo(tx(p.easting), ty(p.elevation)); });
    ctx.closePath();
    ctx.moveTo(tx(pointsIn[pointsIn.length - 1].x), ty(pointsIn[pointsIn.length - 1].y));
    for (let i = pointsIn.length - 2; i >= 0; i--) ctx.lineTo(tx(pointsIn[i].x), ty(pointsIn[i].y));
    ctx.closePath();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#374151';
    ctx.fill('evenodd');
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  // --- Rock profile (blue line) ---
  drawPath(section.points.map(p => ({ x: p.easting, y: p.elevation })), '#0000ff', 3);

  // --- Center line ---
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2.5; ctx.setLineDash([24, 12]);
  ctx.beginPath(); ctx.moveTo(tx(0), ty(minY)); ctx.lineTo(tx(0), ty(maxY)); ctx.stroke();
  ctx.setLineDash([]);

  // --- Design outer (red dashed) ---
  drawPath(pointsOut, '#ff0000', 3.5, [18, 10]);

  // --- Finish inner (dark maroon solid) ---
  drawPath(pointsIn, '#500000', 6);

  // --- Survey points ---
  section.points.forEach(p => {
    ctx.beginPath();
    ctx.arc(tx(p.easting), ty(p.elevation), 8, 0, Math.PI * 2);
    ctx.fillStyle = p.isManual ? '#f59e0b' : '#0000ff';
    ctx.fill();
  });

  // --- Invert Top marker (label to the right to avoid dim overlap) ---
  ctx.fillStyle = '#cc0000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx(0), ty(invertTop));
  ctx.lineTo(tx(0) - 16, ty(invertTop) - 28);
  ctx.lineTo(tx(0) + 16, ty(invertTop) - 28);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Leader line to the right
  ctx.strokeStyle = '#cc0000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tx(0), ty(invertTop) - 28); ctx.lineTo(tx(0) + 120, ty(invertTop) - 80); ctx.stroke();
  ctx.fillStyle = '#cc0000'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('Invert Top', tx(0) + 125, ty(invertTop) - 85);
  ctx.font = '40px sans-serif';
  ctx.fillText(invertTop.toFixed(3), tx(0) + 125, ty(invertTop) - 42);

  // ========== DIMENSION LINES ==========
  const dimColor = '#334155';
  const dimFont = `bold 40px ${ENG}`;

  const drawDimH = (yData: number, x1: number, x2: number, label: string, yOffPx: number) => {
    const py = ty(yData) + yOffPx;
    ctx.strokeStyle = dimColor; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(tx(x1), py); ctx.lineTo(tx(x2), py); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx(x1), py - 12); ctx.lineTo(tx(x1), py + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx(x2), py - 12); ctx.lineTo(tx(x2), py + 12); ctx.stroke();
    // Small arrows
    ctx.fillStyle = dimColor;
    ctx.beginPath(); ctx.moveTo(tx(x1),py); ctx.lineTo(tx(x1)+14,py-7); ctx.lineTo(tx(x1)+14,py+7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx(x2),py); ctx.lineTo(tx(x2)-14,py-7); ctx.lineTo(tx(x2)-14,py+7); ctx.closePath(); ctx.fill();
    // Label: white bg box above line, clearly separated
    const midX = (tx(x1) + tx(x2)) / 2;
    ctx.font = dimFont; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(midX - tw/2 - 10, py - 64, tw + 20, 52);
    ctx.fillStyle = dimColor; ctx.fillText(label, midX, py - 14);
  };

  const drawDimV = (xData: number, y1: number, y2: number, label: string, xOffPx: number) => {
    const px = tx(xData) + xOffPx;
    ctx.strokeStyle = dimColor; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(px, ty(y1)); ctx.lineTo(px, ty(y2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 12, ty(y1)); ctx.lineTo(px + 12, ty(y1)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 12, ty(y2)); ctx.lineTo(px + 12, ty(y2)); ctx.stroke();
    // Small arrows
    ctx.fillStyle = dimColor;
    ctx.beginPath(); ctx.moveTo(px,ty(y1)); ctx.lineTo(px-7,ty(y1)-14); ctx.lineTo(px+7,ty(y1)-14); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px,ty(y2)); ctx.lineTo(px-7,ty(y2)+14); ctx.lineTo(px+7,ty(y2)+14); ctx.closePath(); ctx.fill();
    // Label: rotated, placed 80px to the right of the line with white bg
    ctx.save();
    ctx.translate(px + 80, (ty(y1) + ty(y2)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = dimFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-tw/2 - 10, -24, tw + 20, 48);
    ctx.fillStyle = dimColor; ctx.fillText(label, 0, 0);
    ctx.restore();
  };

  const wHalf = config.width / 2;
  // Horizontal dim: lowered more (80px below invertTop)
  drawDimH(invertTop, -wHalf, wHalf, `${config.width.toFixed(2)} m`, 80);
  // Vertical dims: moved to LEFT side (negative offset) to avoid overlap with info box
  const wMax = config.shape === 'circular' ? config.archRadius : Math.max(config.width / 2, config.archRadius);
  if (config.wallHeight > 0) {
    drawDimV(-wMax, invertTop, splY, `${config.wallHeight.toFixed(2)} m (Wall)`, -135);
  }
  drawDimV(-wMax, invertTop, maxInnerY, `${(maxInnerY - invertTop).toFixed(2)} m (Crown)`, config.wallHeight > 0 ? -245 : -135);

  // ========== INFO BOX — outside plot on the right ==========
  ctx.setLineDash([]);
  const ibW = 780, ibPad = 26;
  const ibLH = 56, ibGap = 14;
  const ibF  = `46px ${ENG}`;
  const ibFB = `bold 48px ${ENG}`;
  const ibFS = `40px ${ENG}`;
  const ibX = tx(maxX) + 60; // Placed to the right of the plot border
  const ibY = ty(maxY);      // Aligned with the top of the plot

  // Estimate height
  const ibH = ibPad*2 + 64+58 + (ibGap+18+56 + ibLH*3)*3 + ibGap;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(ibX, ibY, ibW, ibH);
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
  ctx.strokeRect(ibX, ibY, ibW, ibH);

  let iy = ibY + ibPad;

  ctx.font = `bold 58px ${ENG}`; ctx.fillStyle = '#0f172a'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`CH: ${section.chainage.toFixed(1)}`, ibX + ibW/2, iy); iy += 68;
  ctx.font = `bold 48px ${ENG}`; ctx.fillStyle = '#cc0000'; ctx.textAlign = 'center';
  ctx.fillText(`Inv Top: ${invertTop.toFixed(3)}`, ibX + ibW/2, iy); iy += 62;

  const ibSep = () => {
    iy += ibGap;
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ibX+10, iy); ctx.lineTo(ibX+ibW-10, iy); ctx.stroke();
    iy += ibGap;
  };
  const ibHdr = (t: string) => {
    ctx.font = `bold 40px ${ENG}`; ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(t, ibX+ibPad, iy); iy += 56;
  };
  const ibRow = (lbl: string, val: string, vc = '#0f172a', bold = false) => {
    ctx.font = ibFS; ctx.fillStyle = '#475569'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(lbl, ibX+ibPad, iy);
    ctx.font = bold ? ibFB : ibF; ctx.fillStyle = vc; ctx.textAlign = 'right';
    ctx.fillText(val, ibX+ibW-ibPad, iy);
    iy += ibLH;
  };

  ibSep();
  ibHdr('AREAS (m²)');
  ibRow('Excavated (Rock)', `${results.areaRock.toFixed(2)}`);
  ibRow('Lining (Actual)',  `${results.areaConcreteActual.toFixed(2)}`, '#1d4ed8', true);
  ibRow('Lining (Design)',  `${results.areaConcreteDesign.toFixed(2)}`);

  ibSep();
  ibHdr('PERIPHERIES (m)');
  ibRow('Rock Line',    `${results.peripheryRock.toFixed(2)}`);
  ibRow('Inner Lining', `${results.peripheryInner.toFixed(2)}`);
  ibRow('Outer Lining', `${results.peripheryOuter.toFixed(2)}`);

  ibSep();
  ibHdr('SUMMARY');
  const ovArea = (results.areaRock - results.areaOuter).toFixed(2);
  const ovPct  = ((results.areaRock / results.areaOuter - 1) * 100).toFixed(1);
  ibRow('Overbreak Area', `${ovArea} m²`, '#ea580c', true);
  ibRow('Overbreak %',    `${ovPct}%`);

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvasW, height: canvasH, actW, rangeX };
}

export async function exportToPDF(sections: SectionData[], config: TunnelConfig, pdfScale: string = 'Fit to Page') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  doc.setFontSize(18);
  doc.text('Tunnel Cross-Section Analysis Report', 14, 20);
  
  doc.setFontSize(12);
  doc.text(`Project: ${config.name}`, 14, 30);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 37);

  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    doc.addPage();

    const imageData = renderSectionToImage(section, config);
    if (imageData) {
      const { dataUrl, width, height, actW, rangeX } = imageData;
      
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 8; // minimal margins for max space
      const pdfWidth = pageW - 2 * margin;
      const pdfHeight = pageH - 2 * margin;
      
      let imgW = pdfWidth;
      let imgH = imgW * (height / width);
      
      if (pdfScale !== 'Fit to Page') {
         let mmPerMeter = 10;
         if (pdfScale === '1:50') mmPerMeter = 20;
         else if (pdfScale === '1:100') mmPerMeter = 10;
         else if (pdfScale === '1:200') mmPerMeter = 5;
         
         const pixelsPerMeter = actW / rangeX;
         imgW = (width / pixelsPerMeter) * mmPerMeter;
         imgH = imgW * (height / width);
      } else {
        if (imgH > pdfHeight) {
          imgH = pdfHeight;
          imgW = imgH * (width / height);
        }
      }
      
      // Center the image on the page
      const xMargin = (pageW - imgW) / 2;
      const yMargin = (pageH - imgH) / 2;

      doc.addImage(dataUrl, 'JPEG', xMargin, yMargin, imgW, imgH);
    }
  }

  // Table
  doc.addPage();
  const tableData = sections.map((section) => {
    const results = getCalculationResults(section, config);
    if (!results) return null;
    return [
      section.chainage.toFixed(2),
      results.areaRock.toFixed(2),
      results.areaConcreteActual.toFixed(2),
      results.areaConcreteDesign.toFixed(2),
      results.peripheryRock.toFixed(2),
      results.peripheryInner.toFixed(2),
      (results.areaRock - results.areaOuter).toFixed(2)
    ];
  }).filter(Boolean);

  autoTable(doc, {
    startY: 45,
    head: [['Chainage', 'Area Rock', 'Conc. Actual', 'Conc. Design', 'Periph. Rock', 'Periph. Inner', 'Overbreak']],
    body: tableData as any[][],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] }
  });

  return doc.output('blob');
}
