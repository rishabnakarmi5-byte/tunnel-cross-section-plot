import React from 'react';
import { SectionData } from '../types';
import { MousePointer2, Trash2, Edit2 } from 'lucide-react';

interface PointsPanelProps {
  section: SectionData | undefined;
  isAddingPoint: boolean;
  setIsAddingPoint: (val: boolean) => void;
  onDeletePoint: (index: number) => void;
  onEditPoint: (index: number, e: number, el: number) => void;
}

export const PointsPanel: React.FC<PointsPanelProps> = ({ section, isAddingPoint, setIsAddingPoint, onDeletePoint, onEditPoint }) => {
  if (!section) return <div className="w-80 bg-slate-50 border-l border-slate-200"></div>;

  return (
    <div className="w-80 bg-slate-50 border-l border-slate-200 h-screen overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-slate-200 sticky top-0 bg-slate-50 z-10 flex justify-between items-center">
        <h2 className="font-bold text-slate-700">Section Points</h2>
        <button
          onClick={() => setIsAddingPoint(!isAddingPoint)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            isAddingPoint 
            ? 'bg-amber-100 text-amber-700 border border-amber-300' 
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
          {isAddingPoint ? 'Cancel Edit' : 'Add Point'}
        </button>
      </div>

      <div className="flex-1 p-4 space-y-2">
        {section.points.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No points</p>
        ) : (
          section.points.map((p, i) => (
            <div key={i} className={`flex items-center justify-between p-2 rounded border text-xs ${p.isManual ? 'bg-amber-50 border-amber-200' : p.isEdited ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[9px] uppercase text-slate-400 font-bold block">Easting</span>
                  <input 
                    type="number" 
                    value={p.easting.toFixed(3)} 
                    onChange={e => onEditPoint(i, parseFloat(e.target.value), p.elevation)}
                    className="w-full bg-transparent outline-none font-mono text-slate-700" 
                    step="0.01"
                  />
                </div>
                <div>
                  <span className="text-[9px] uppercase text-slate-400 font-bold block">Elevation</span>
                  <input 
                    type="number" 
                    value={p.elevation.toFixed(3)} 
                    onChange={e => onEditPoint(i, p.easting, parseFloat(e.target.value))}
                    className="w-full bg-transparent outline-none font-mono text-slate-700"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="flex items-center ml-2 border-l border-slate-200 pl-2">
                <button onClick={() => onDeletePoint(i)} className="text-slate-400 hover:text-red-500 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
