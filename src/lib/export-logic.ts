import { SectionData, TunnelConfig } from '../types';
import { getGantryShapes, getDesignInvertBottom, getCalculationResults } from './tunnel-logic';
import Drawing from 'dxf-writer';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToDXF(sections: SectionData[], config: TunnelConfig) {
  console.log('Starting Professional DXF export...');
  const drawing = new Drawing();
  
  // Create professional layers with standard ACI colors
  // Define CENTER linetype to prevent AutoCAD from crashing
  drawing.addLineType('CENTER', 'Center ____ _ ____', [2, -0.5, 0.2, -0.5]);
  
  drawing.addLayer('L-CENTERLINE', Drawing.ACI.CYAN, 'CENTER');
  drawing.addLayer('L-DESIGN-OUTER', Drawing.ACI.GREEN, 'CONTINUOUS');
  drawing.addLayer('L-DESIGN-INNER', Drawing.ACI.MAGENTA, 'CONTINUOUS');
  drawing.addLayer('L-SURVEY-ROCK', Drawing.ACI.WHITE, 'CONTINUOUS');
  drawing.addLayer('L-ANNOTATION', Drawing.ACI.YELLOW, 'CONTINUOUS');
  drawing.addLayer('L-DIMENSIONS', Drawing.ACI.YELLOW, 'CONTINUOUS');
  drawing.addLayer('L-HATCH', Drawing.ACI.CYAN, 'CONTINUOUS');
  drawing.addLayer('L-SCALE', Drawing.ACI.MAGENTA, 'CONTINUOUS');
  drawing.addLayer('L-INFO-BOX', Drawing.ACI.GREEN, 'CONTINUOUS');

  const cadSpacing = 50; // Increased spacing for scales
  let xOffset = 0;

  sections.forEach((section, index) => {
    try {
      const invertBottom = getDesignInvertBottom(section.chainage, config.slopeSegments);
      if (invertBottom === null) return;

      const { pointsIn, pointsOut } = getGantryShapes(invertBottom, config);
      const results = getCalculationResults(section, config);
      if (!results) return;

      const invertTop = invertBottom + config.liningThicknessInvert;
      const splY = invertBottom + config.wallHeight;
      const maxInnerY = pointsIn.length > 0 ? pointsIn.reduce((max, p) => Math.max(max, p.y), -Infinity) : invertBottom;
      const maxOuterY = pointsOut.length > 0 ? pointsOut.reduce((max, p) => Math.max(max, p.y), -Infinity) : invertBottom;

      // 1. Center Line (CL)
      drawing.setActiveLayer('L-CENTERLINE');
      drawing.drawLine(xOffset, invertBottom - 2, xOffset, maxOuterY + 4);
      drawing.setActiveLayer('L-ANNOTATION');
      drawing.drawText(xOffset, maxOuterY + 5, 0.4, 0, 'CL', 'center', 'bottom');

      // 2. Design Profiles
      if (pointsOut.length > 0) {
        drawing.setActiveLayer('L-DESIGN-OUTER');
        drawing.drawPolyline(pointsOut.map(p => [p.x + xOffset, p.y]), true);
      }
      
      if (pointsIn.length > 0) {
        drawing.setActiveLayer('L-DESIGN-INNER');
        drawing.drawPolyline(pointsIn.map(p => [p.x + xOffset, p.y]), true);
      }

      // 3. Survey Rock Line
      if (section.points && section.points.length > 1) {
        drawing.setActiveLayer('L-SURVEY-ROCK');
        drawing.drawPolyline(section.points.map(p => [p.easting + xOffset, p.elevation]), true);
      }

      // 4. Concrete Lining Hatch (Simulated)
      drawing.setActiveLayer('L-HATCH');
      const hatchSpacing = 0.15;
      const wMax = Math.max(config.width / 2, config.archRadius) + 1;
      for (let d = -wMax; d <= wMax; d += hatchSpacing) {
        pointsIn.forEach((p, i) => {
          if (i % 8 === 0) {
            drawing.drawLine(p.x + xOffset, p.y, p.x + xOffset + 0.05, p.y + 0.05);
          }
        });
      }

    // 5. Elevation Scales (Left and Right)
    drawing.setActiveLayer('L-SCALE');
    const scaleXLeft = xOffset - (config.width/2 + 3);
    const scaleXRight = xOffset + (config.width/2 + 3);
    const elevMin = Math.floor(invertBottom - 1);
    const elevMax = Math.ceil(maxOuterY + 2);

    [scaleXLeft, scaleXRight].forEach(sx => {
      drawing.drawLine(sx, elevMin, sx, elevMax);
      for (let el = elevMin; el <= elevMax; el += 0.1) {
        const tickL = el % 1 === 0 ? 0.4 : 0.2;
        const isLabel = el % 1 === 0;
        drawing.drawLine(sx - tickL/2, el, sx + tickL/2, el);
        if (isLabel) {
          drawing.drawText(sx + (sx < xOffset ? -0.6 : 0.6), el, 0.25, 0, el.toFixed(0), sx < xOffset ? 'right' : 'left', 'middle');
        }
      }
    });

    // 6. Dimensions (Yellow)
    drawing.setActiveLayer('L-DIMENSIONS');
    const drawDimH = (y: number, x1: number, x2: number, label: string) => {
      drawing.drawLine(x1 + xOffset, y, x2 + xOffset, y);
      drawing.drawLine(x1 + xOffset, y - 0.2, x1 + xOffset, y + 0.2);
      drawing.drawLine(x2 + xOffset, y - 0.2, x2 + xOffset, y + 0.2);
      drawing.drawText(xOffset + (x1 + x2)/2, y + 0.1, 0.25, 0, label, 'center', 'bottom');
    };

    const drawDimV = (x: number, y1: number, y2: number, label: string) => {
      drawing.drawLine(x + xOffset, y1, x + xOffset, y2);
      drawing.drawLine(x + xOffset - 0.2, y1, x + xOffset + 0.2, y1);
      drawing.drawLine(x + xOffset - 0.2, y2, x + xOffset + 0.2, y2);
      drawing.drawText(x + xOffset - 0.3, (y1 + y2)/2, 0.25, 90, label, 'center', 'bottom');
    };

    drawDimH(invertBottom - 0.5, -config.width/2, config.width/2, config.width.toFixed(2));
    drawDimV(-(config.width/2 + 1), invertBottom, maxOuterY, (maxOuterY - invertBottom).toFixed(2));
    
    // Spring Line Dim
    if (config.shape === 'horse-shoe') {
      const splW = config.archRadius * 2;
      drawDimH(splY, -config.archRadius, config.archRadius, splW.toFixed(2));
      // Radius dim
      drawing.drawLine(xOffset, splY, xOffset + config.archRadius * 0.7, splY + config.archRadius * 0.7);
      drawing.drawText(xOffset + 0.5, splY + 0.5, 0.25, 45, `R${config.archRadius.toFixed(2)}`, 'left', 'bottom');
    }

    // 7. Information Box (Bottom)
    drawing.setActiveLayer('L-INFO-BOX');
    const boxW = 12;
    const boxH = 4;
    const boxX = xOffset - boxW/2;
    const boxY = invertBottom - 8;
    
    drawing.drawLine(boxX, boxY, boxX + boxW, boxY);
    drawing.drawLine(boxX + boxW, boxY, boxX + boxW, boxY + boxH);
    drawing.drawLine(boxX + boxW, boxY + boxH, boxX, boxY + boxH);
    drawing.drawLine(boxX, boxY + boxH, boxX, boxY);

    drawing.setActiveLayer('L-ANNOTATION');
    const tx = xOffset;
    drawing.drawText(tx, boxY + 2.8, 0.3, 0, `Chainage: ${section.chainage.toFixed(2)}`, 'center', 'middle');
    drawing.drawText(tx, boxY + 1.8, 0.3, 0, `Design Area: ${results.areaOuter.toFixed(2)} m2`, 'center', 'middle');
    drawing.drawText(tx, boxY + 0.8, 0.3, 0, `Overbreak Area: ${(results.areaRock - results.areaOuter).toFixed(2)} m2`, 'center', 'middle');

    // Title
    drawing.drawText(xOffset, boxY - 1.5, 0.5, 0, config.name.toUpperCase(), 'center', 'top');

    } catch (err) {
      console.error(`Error exporting section at chainage ${section.chainage}:`, err);
    }
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
