import React from 'react';
import { SectionData, TunnelConfig } from '../types';
import { getGantryShapes, getDesignInvertBottom, getCalculationResults } from '../lib/tunnel-logic';

interface CrossSectionViewProps {
  section: SectionData;
  config: TunnelConfig;
  onWheel?: (e: React.WheelEvent) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  onAddPoint?: (easting: number, elevation: number) => void;
  isAddingPoint?: boolean;
  onPointHover?: (index: number) => void;
}

export const CrossSectionView: React.FC<CrossSectionViewProps> = ({ section, config, onWheel, svgRef, onAddPoint, isAddingPoint, onPointHover }) => {
  const invertBottom = getDesignInvertBottom(section.chainage, config.slopeSegments, config.initialInvertLevel);
  if (invertBottom === null) return <div className="p-4 text-red-500">Chainage out of range</div>;

  const { pointsIn, pointsOut, invertTop } = getGantryShapes(invertBottom, config);
  const results = getCalculationResults(section, config);

  if (!results) return null;

  // Calculate bounds for SVG
  const allPoints = section.points.map(p => ({ x: p.easting, y: p.elevation }))
    .concat(pointsIn)
    .concat(pointsOut);

  if (allPoints.length === 0) return <div className="p-8 text-center text-slate-400">No points to display</div>;

  const minX = allPoints.reduce((min, p) => Math.min(min, p.x), allPoints[0].x) - 3; // Increased padding
  const maxX = allPoints.reduce((max, p) => Math.max(max, p.x), allPoints[0].x) + 3;
  const minY = allPoints.reduce((min, p) => Math.min(min, p.y), allPoints[0].y) - 3;
  const maxY = allPoints.reduce((max, p) => Math.max(max, p.y), allPoints[0].y) + 3;

  const width = 600;
  const height = 400;
  
  // Padding for labels
  const padLeft = 40;
  const padBottom = 30;
  const chartWidth = width - padLeft - 20;
  const chartHeight = height - padBottom - 20;

  // Ensure 0 is centered horizontally
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
  const newMinX = -maxAbsX;
  const newMaxX = maxAbsX;
  const rangeX = newMaxX - newMinX || 1;

  const rangeY = maxY - minY || 1;
  const scaleX = chartWidth / rangeX;
  const scaleY = chartHeight / rangeY;
  const scale = Math.min(scaleX, scaleY);

  // If we scaled down to match Y, we have extra horizontal space. Center it.
  const actualPlotWidth = rangeX * scale;
  const offsetX = (chartWidth - actualPlotWidth) / 2;

  const tx = (x: number) => padLeft + offsetX + (x - newMinX) * scale;
  const ty = (y: number) => height - padBottom - (y - minY) * scale;

  const pointsToPath = (pts: { x: number; y: number }[]) => 
    pts.length > 0 ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(p.x)} ${ty(p.y)}`).join(' ') + ' Z' : '';

  const maxInnerY = pointsIn.length > 0 ? pointsIn.reduce((max, p) => Math.max(max, p.y), -Infinity) : 0;
  const innerHeight = maxInnerY - invertTop;
  const splY = invertTop + config.wallHeight;

  const svgRefInternal = React.useRef<SVGSVGElement | null>(null);
  
  const setRefs = (el: SVGSVGElement | null) => {
    svgRefInternal.current = el;
    if (typeof svgRef === 'function') {
      svgRef(el);
    } else if (svgRef) {
      (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el;
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isAddingPoint || !onAddPoint || !svgRefInternal.current) return;
    const CTM = svgRefInternal.current.getScreenCTM();
    if (!CTM) return;
    const svgX = (e.clientX - CTM.e) / CTM.a;
    const svgY = (e.clientY - CTM.f) / CTM.d;
    
    // Reverse scale
    const easting = (svgX / scale) + minX;
    const elevation = minY + (height - svgY) / scale;
    onAddPoint(easting, elevation);
  };

  const [hoveredPoint, setHoveredPoint] = React.useState<{easting: number, elevation: number, x: number, y: number, type: string} | null>(null);

  const designPtInLeft = pointsIn.length > 0 ? pointsIn.reduce((max, p) => p.y - p.x > max.y - max.x ? p : max, pointsIn[0]) : null;
  const rockPtPos = section.points.length > 0 ? section.points.reduce((max, p) => p.elevation + p.easting > max.elevation + max.easting ? p : max, section.points[0]) : null;


  const drawDimY = (x: number, y1: number, y2: number, label: string) => (
    <g>
      <line x1={x} y1={ty(y1)} x2={x} y2={ty(y2)} stroke="#64748b" strokeWidth="1" markerEnd="url(#arrowDim)" markerStart="url(#arrowDimStart)" />
      <line x1={x-5} y1={ty(y1)} x2={x+5} y2={ty(y1)} stroke="#64748b" strokeWidth="1" />
      <line x1={x-5} y1={ty(y2)} x2={x+5} y2={ty(y2)} stroke="#64748b" strokeWidth="1" />
      <text x={x + 5} y={(ty(y1) + ty(y2))/2} dominantBaseline="middle" transform={`rotate(-90, ${x + 5}, ${(ty(y1) + ty(y2))/2})`} className="text-[10px] fill-slate-600 font-bold">{label}</text>
    </g>
  );

  const drawDimX = (y: number, x1: number, x2: number, label: string) => (
    <g>
      <line x1={tx(x1)} y1={y} x2={tx(x2)} y2={y} stroke="#64748b" strokeWidth="1" markerEnd="url(#arrowDim)" markerStart="url(#arrowDimStart)" />
      <line x1={tx(x1)} y1={y-5} x2={tx(x1)} y2={y+5} stroke="#64748b" strokeWidth="1" />
      <line x1={tx(x2)} y1={y-5} x2={tx(x2)} y2={y+5} stroke="#64748b" strokeWidth="1" />
      <text x={(tx(x1) + tx(x2))/2} y={y - 5} textAnchor="middle" className="text-[10px] fill-slate-600 font-bold">{label}</text>
    </g>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" onWheel={onWheel}>
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
        <span className="font-bold text-slate-700">Chainage: {section.chainage.toFixed(2)}</span>
        <div className="flex gap-4 text-xs text-slate-500">
          <span>Invert: {invertBottom.toFixed(3)}m</span>
          <span>Top: {invertTop.toFixed(3)}m</span>
        </div>
      </div>
      
      <div className={`p-6 flex justify-center bg-slate-100 ${isAddingPoint ? 'cursor-crosshair' : ''}`}>
        <svg ref={setRefs} width={width} height={height} className="bg-white shadow-inner rounded border border-slate-200" onClick={handleSvgClick}>
          <defs>
            <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0,0 6,3 0,6" fill="#64748b" />
            </marker>
            <marker id="arrowHeadDesignIn" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0,0 6,3 0,6" fill="#1e293b" />
            </marker>
            <marker id="arrowDim" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <polygon points="6,3 0,6 0,0" fill="#64748b" />
            </marker>
            <marker id="arrowDimStart" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
              <polygon points="0,3 6,6 6,0" fill="#64748b" />
            </marker>
          </defs>

          {/* Grid lines */}
          {Array.from({ length: 11 }).map((_, i) => (
            <React.Fragment key={i}>
              <line 
                x1={padLeft} y1={height - padBottom - i * (chartHeight / 10)} x2={padLeft + chartWidth} y2={height - padBottom - i * (chartHeight / 10)} 
                stroke="#f1f5f9" strokeWidth="1" 
              />
              <line 
                x1={padLeft + i * (chartWidth / 10)} y1={height - padBottom - chartHeight} x2={padLeft + i * (chartWidth / 10)} y2={height - padBottom} 
                stroke="#f1f5f9" strokeWidth="1" 
              />
            </React.Fragment>
          ))}

          {/* Axes lines */}
          <line x1={padLeft} y1={height - padBottom} x2={padLeft + chartWidth} y2={height - padBottom} stroke="#000" strokeWidth="2" />
          <line x1={padLeft} y1={height - padBottom - chartHeight} x2={padLeft} y2={height - padBottom} stroke="#000" strokeWidth="2" />

              {/* Axis Labels */}
              {Array.from({ length: 6 }).map((_, i) => (
                <text key={i} x={padLeft + i * (chartWidth / 5)} y={height - padBottom + 15} textAnchor="middle" className="text-[10px] fill-slate-500">
                  {(minX + i * (rangeX / 5)).toFixed(1)}
                </text>
              ))}
              {Array.from({ length: 6 }).map((_, i) => (
                <text key={i} x={padLeft - 5} y={height - padBottom - i * (chartHeight / 5)} textAnchor="end" dominantBaseline="middle" className="text-[10px] fill-slate-500">
                  {(minY + i * (rangeY / 5)).toFixed(1)}
                </text>
              ))}

          {/* Invert Level Indicator */}
          <line x1={padLeft} y1={ty(invertBottom)} x2={padLeft + chartWidth} y2={ty(invertBottom)} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" />
          <text x={padLeft + chartWidth - 5} y={ty(invertBottom) - 5} textAnchor="end" className="text-[10px] fill-red-500 font-bold">Invert: {invertBottom.toFixed(2)}</text>

          {/* Excavated Rock Profile */}
          <path 
            d={pointsToPath(section.points.map(p => ({ x: p.easting, y: p.elevation })))} 
            fill="#e2e8f0" 
            stroke="#94a3b8" 
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />

          {/* Design Outer Profile */}
          <path 
            d={pointsToPath(pointsOut)} 
            fill="none" 
            stroke="#ef4444" 
            strokeWidth="1.5" 
            strokeDasharray="5 5"
          />

          {/* Finish Inner Profile */}
          <path 
            d={pointsToPath(pointsIn)} 
            fill="white" 
            stroke="#1e293b" 
            strokeWidth="2.5" 
          />

          {/* Survey Points */}
          {section.points.map((p, i) => (
            <circle 
              key={i} 
              cx={tx(p.easting)} 
              cy={ty(p.elevation)} 
              r="3" 
              fill={p.isManual ? '#f59e0b' : p.isEdited ? '#ef4444' : p.type === 'survey' ? '#3b82f6' : '#94a3b8'} 
              className="cursor-pointer transition-all hover:r-4"
              onMouseEnter={() => setHoveredPoint({ easting: p.easting, elevation: p.elevation, x: tx(p.easting), y: ty(p.elevation), type: p.isManual ? 'Manual' : p.isEdited ? 'Edited' : p.type })}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}

          {/* Hover Tooltip */}
          {hoveredPoint && (
            <g>
              <rect x={hoveredPoint.x + 8} y={hoveredPoint.y - 35} width="110" height="30" rx="4" fill="#1e293b" opacity="0.9" />
              <text x={hoveredPoint.x + 15} y={hoveredPoint.y - 22} className="text-[10px] fill-white font-mono">
                E: {hoveredPoint.easting.toFixed(3)}
              </text>
              <text x={hoveredPoint.x + 15} y={hoveredPoint.y - 10} className="text-[10px] fill-white font-mono">
                El: {hoveredPoint.elevation.toFixed(3)} ({hoveredPoint.type})
              </text>
            </g>
          )}

          {/* Center Lines */}
          <line x1={tx(0)} y1={20} x2={tx(0)} y2={height - 20} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="15 5 5 5" />
          {/* SPL horizontal line — only for shapes with straight walls */}
          {config.shape !== 'circular' && (
            <>
              <line x1={20} y1={ty(splY)} x2={width - 20} y2={ty(splY)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="15 5 5 5" />
              <text x={width - 25} y={ty(splY) - 5} className="text-[10px] fill-slate-400 font-bold">SPL</text>
            </>
          )}
          <text x={tx(0) + 5} y={15} className="text-[10px] fill-slate-400 font-bold">CL</text>

          {/* Dimensions — shape-aware */}
          {config.shape === 'circular'
            ? drawDimX(ty(invertTop - config.archRadius) + 15, -config.archRadius, config.archRadius,
                `${(config.archRadius * 2).toFixed(2)}m Diameter`)
            : drawDimX(ty(invertTop) + 15, -config.width / 2, config.width / 2,
                `${config.width.toFixed(2)}m Width`)
          }
          {config.shape !== 'circular' && config.wallHeight > 0 &&
            drawDimY(tx(Math.max(config.width / 2, config.archRadius)) + 20, invertTop, invertTop + config.wallHeight,
              `${config.wallHeight.toFixed(2)}m to SPL`)}
          {drawDimY(tx(config.shape === 'circular' ? config.archRadius : Math.max(config.width / 2, config.archRadius)) + 40,
            invertTop, maxInnerY, `${(maxInnerY - invertTop).toFixed(2)}m to Crown`)}
          
          {/* Total Height Dimensions (from bottom of excavation) */}
          {drawDimY(tx(-Math.max(config.width / 2, config.archRadius)) - 40,
            invertBottom, maxInnerY, `${(maxInnerY - invertBottom).toFixed(2)}m (Finished)`)}
          {drawDimY(tx(-Math.max(config.width / 2, config.archRadius)) - 60,
            invertBottom, pointsOut.reduce((max, p) => Math.max(max, p.y), -Infinity), 
            `${(pointsOut.reduce((max, p) => Math.max(max, p.y), -Infinity) - invertBottom).toFixed(2)}m (Excavation)`)}

          {/* Callout Arrows */}
          {designPtInLeft && (
            <g>
              <line x1={tx(designPtInLeft.x) - 40} y1={ty(designPtInLeft.y) - 30} x2={tx(designPtInLeft.x)} y2={ty(designPtInLeft.y)} stroke="#1e293b" strokeWidth="1" markerEnd="url(#arrowHeadDesignIn)" />
              <text x={tx(designPtInLeft.x) - 45} y={ty(designPtInLeft.y) - 35} textAnchor="end" className="text-[10px] fill-slate-700 font-bold">Design Line</text>
            </g>
          )}

          {rockPtPos && (
            <g>
              <line x1={tx(rockPtPos.easting) + 40} y1={ty(rockPtPos.elevation) - 30} x2={tx(rockPtPos.easting)} y2={ty(rockPtPos.elevation)} stroke="#64748b" strokeWidth="1" markerEnd="url(#arrowHead)" />
              <text x={tx(rockPtPos.easting) + 45} y={ty(rockPtPos.elevation) - 35} textAnchor="start" className="text-[10px] fill-slate-500 font-bold">Rock Line</text>
            </g>
          )}

        </svg>
      </div>

      <div className="px-6 py-6 grid grid-cols-3 gap-x-8 gap-y-6 border-t border-slate-100 bg-white">
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Areas (m²)</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Excavated (Rock)</span>
              <span className="text-sm font-bold text-slate-700">{results.areaRock.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Lining (Actual)</span>
              <span className="text-sm font-bold text-emerald-600">{results.areaConcreteActual.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Lining (Design)</span>
              <span className="text-sm font-bold text-slate-700">{results.areaConcreteDesign.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Peripheries (m)</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Rock Line</span>
              <span className="text-sm font-bold text-slate-700">{results.peripheryRock.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Inner Lining</span>
              <span className="text-sm font-bold text-slate-700">{results.peripheryInner.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Outer Lining</span>
              <span className="text-sm font-bold text-slate-700">{results.peripheryOuter.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Summary</h4>
          <div className="bg-slate-50 p-3 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Overbreak Area</span>
              <span className="text-sm font-bold text-orange-600">{(results.areaRock - results.areaOuter).toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500">Overbreak %</span>
              <span className="text-sm font-bold text-slate-700">{((results.areaRock / results.areaOuter - 1) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
