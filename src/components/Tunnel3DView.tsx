import React, { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { SectionData, TunnelConfig } from '../types';
import { getDesignInvertBottom, getGantryShapes } from '../lib/tunnel-logic';

export const Tunnel3DView: React.FC<{ sections: SectionData[], config: TunnelConfig }> = ({ sections, config }) => {
  const [connectSurveyPoints, setConnectSurveyPoints] = useState(false);
  const [showDesignSurface, setShowDesignSurface] = useState(true);

  const plotData = useMemo(() => {
    if (sections.length === 0) return [];

    const surveyX: number[] = [];
    const surveyY: number[] = [];
    const surveyZ: number[] = [];
    
    const invertX: number[] = [];
    const invertY: number[] = [];
    const invertZ: number[] = [];

    const designLines: any[] = [];

    // Get the number of points in the profile from the first valid section
    let numProfilePoints = 0;
    for (const sec of sections) {
      const invBottom = getDesignInvertBottom(sec.chainage, config.slopeSegments, config.initialInvertLevel);
      if (invBottom !== null) {
        numProfilePoints = getGantryShapes(invBottom, config).pointsIn.length;
        break;
      }
    }

    const longLinesX: number[][] = Array.from({ length: numProfilePoints }, () => []);
    const longLinesY: number[][] = Array.from({ length: numProfilePoints }, () => []);
    const longLinesZ: number[][] = Array.from({ length: numProfilePoints }, () => []);

    const surfaceX: number[][] = [];
    const surfaceY: number[][] = [];
    const surfaceZ: number[][] = [];

    sections.forEach(sec => {
      // Survey points
      sec.points.forEach(p => {
        surveyX.push(p.easting);
        surveyY.push(sec.chainage);
        surveyZ.push(p.elevation);
      });
      // Close the loop for the excavated section and add null to break the line between sections
      if (sec.points.length > 0) {
        surveyX.push(sec.points[0].easting);
        surveyY.push(sec.chainage);
        surveyZ.push(sec.points[0].elevation);
      }
      surveyX.push(null as unknown as number);
      surveyY.push(null as unknown as number);
      surveyZ.push(null as unknown as number);

      // Design Invert
      const invertBottom = getDesignInvertBottom(sec.chainage, config.slopeSegments, config.initialInvertLevel);
      if (invertBottom !== null) {
        invertX.push(0);
        invertY.push(sec.chainage);
        invertZ.push(invertBottom);
        
        const { pointsIn } = getGantryShapes(invertBottom, config);
        
        if (pointsIn.length > 0) {
          // For Surface Plot
          // Close the loop for the surface
          const closedPoints = [...pointsIn, pointsIn[0]];
          surfaceX.push(closedPoints.map(p => p.x));
          surfaceY.push(closedPoints.map(() => sec.chainage));
          surfaceZ.push(closedPoints.map(p => p.y));

          // Transversal wireframe lines (cross-sections)
          if (!showDesignSurface) {
            designLines.push({
              type: 'scatter3d',
              mode: 'lines',
              x: closedPoints.map(p => p.x),
              y: closedPoints.map(() => sec.chainage),
              z: closedPoints.map(p => p.y),
              line: { color: 'rgba(16, 185, 129, 0.5)', width: 2 },
              showlegend: false,
              hoverinfo: 'none'
            });

            // Longitudinal lines
            pointsIn.forEach((p, idx) => {
              if (idx < numProfilePoints) {
                longLinesX[idx].push(p.x);
                longLinesY[idx].push(sec.chainage);
                longLinesZ[idx].push(p.y);
              }
            });
          }
        }
      }
    });

    if (!showDesignSurface) {
      // Add longitudinal lines
      longLinesX.forEach((_, idx) => {
        if (idx % 5 === 0 || idx === 0 || idx === numProfilePoints - 1) {
          designLines.push({
            type: 'scatter3d',
            mode: 'lines',
            x: longLinesX[idx],
            y: longLinesY[idx],
            z: longLinesZ[idx],
            line: { color: 'rgba(16, 185, 129, 0.4)', width: 1 },
            showlegend: false,
            hoverinfo: 'none'
          });
        }
      });
    }

    const traces: any[] = [
      {
        type: 'scatter3d',
        mode: connectSurveyPoints ? 'lines+markers' : 'markers',
        name: 'Excavated Survey',
        x: surveyX,
        y: surveyY,
        z: surveyZ,
        line: { color: 'rgba(59, 130, 246, 0.8)', width: 2 },
        marker: { size: connectSurveyPoints ? 2 : 3, color: '#3b82f6', opacity: 0.9 }
      },
      {
        type: 'scatter3d',
        mode: 'lines',
        name: 'Design Invert Center',
        x: invertX,
        y: invertY,
        z: invertZ,
        line: { color: '#10b981', width: 5 }
      }
    ];

    if (showDesignSurface && surfaceX.length > 0) {
      traces.push({
        type: 'surface',
        x: surfaceX,
        y: surfaceY,
        z: surfaceZ,
        name: 'Design Surface',
        opacity: 0.5,
        colorscale: [[0, 'rgba(16, 185, 129, 1)'], [1, 'rgba(16, 185, 129, 1)']],
        showscale: false,
        hoverinfo: 'none',
        contours: {
          x: { show: true, color: 'rgba(255, 255, 255, 0.2)', width: 1 },
          y: { show: true, color: 'rgba(255, 255, 255, 0.2)', width: 1 },
          z: { show: true, color: 'rgba(255, 255, 255, 0.2)', width: 1 }
        }
      });
    } else {
      traces.push(...designLines);
    }

    return traces;
  }, [sections, config, connectSurveyPoints, showDesignSurface]);

  if (sections.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        No sections to display in 3D.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <h3 className="font-bold text-slate-700 text-sm">3D Tunnel Analysis</h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
            <input 
              type="checkbox" 
              checked={connectSurveyPoints} 
              onChange={e => setConnectSurveyPoints(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            Connect Excavation Points
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showDesignSurface} 
              onChange={e => setShowDesignSurface(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
            />
            Solid Design Surface
          </label>
        </div>
      </div>
      <div className="flex-1 p-2">
        <Plot
          data={plotData}
          layout={{
            autosize: true,
            margin: { l: 0, r: 0, b: 0, t: 0 },
            showlegend: true,
            legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(255,255,255,0.8)', bordercolor: '#e2e8f0', borderwidth: 1 },
            scene: {
              xaxis: { title: { text: 'Easting' }, gridcolor: '#e2e8f0', zerolinecolor: '#cbd5e1' },
              yaxis: { title: { text: 'Chainage' }, gridcolor: '#e2e8f0', zerolinecolor: '#cbd5e1' },
              zaxis: { title: { text: 'Elevation' }, gridcolor: '#e2e8f0', zerolinecolor: '#cbd5e1' },
              aspectmode: 'data',
              camera: {
                eye: { x: 1.5, y: 1.5, z: 1.2 }
              }
            }
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '600px' }}
        />
      </div>
    </div>
  );
};
