import React, { useState, useEffect } from 'react';
import { TunnelConfig, TunnelShape, SlopeSegment, SectionData, TunnelProfile } from '../types';
import { Plus, Trash2, Save, FolderOpen, Loader2, ChevronDown, ChevronUp, Mountain, Layers } from 'lucide-react';
import { db } from '../firebase';
import { collection, doc, setDoc, onSnapshot, query, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { SHAPE_META, applyShapeTemplate, createDefaultConfig } from '../lib/templates';
import { generateDesignSection } from '../lib/tunnel-logic';

interface SidebarProps {
  config: TunnelConfig;
  setConfig: (config: TunnelConfig) => void;
  sections: SectionData[];
  setSections: (sections: SectionData[]) => void;
  user: FirebaseUser | null;
}

const SHAPE_ICONS: Record<TunnelShape, React.ReactNode> = {
  'inverted-d': (
    <svg viewBox="-3 -1 6 5" className="w-10 h-8" fill="none" stroke="currentColor" strokeWidth="0.4">
      <path d="M-2,3 L-2,1 A2,2 0 0,1 2,1 L2,3 Z" />
    </svg>
  ),
  'circular': (
    <svg viewBox="-3 -3 6 6" className="w-10 h-8" fill="none" stroke="currentColor" strokeWidth="0.4">
      <circle cx="0" cy="0" r="2" />
    </svg>
  ),
  'horse-shoe': (
    <svg viewBox="-3 -1 6 5" className="w-10 h-8" fill="none" stroke="currentColor" strokeWidth="0.4">
      <path d="M-2,3 L-2,1 A2,2 0 0,1 2,1 L2,3" />
    </svg>
  ),
};

const SHAPE_ACCENT_CLASSES: Record<TunnelShape, { card: string; badge: string; border: string }> = {
  'inverted-d': {
    card: 'hover:bg-emerald-600 hover:border-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300',
    border: 'border-emerald-500',
  },
  'circular': {
    card: 'hover:bg-violet-600 hover:border-violet-400',
    badge: 'bg-violet-500/20 text-violet-300',
    border: 'border-violet-500',
  },
  'horse-shoe': {
    card: 'hover:bg-emerald-600 hover:border-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300',
    border: 'border-emerald-500',
  },
};

enum OperationType { WRITE = 'write', LIST = 'list', DELETE = 'delete' }

function handleFirestoreError(error: unknown, op: OperationType, path: string | null) {
  console.error('Firestore Error:', { error: error instanceof Error ? error.message : String(error), op, path });
  throw new Error(String(error));
}

// ─── Label component ───────────────────────────────────────────────────────
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{children}</span>
);

const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}> = ({ label, value, onChange, step = 0.01 }) => (
  <label className="block space-y-1">
    <FieldLabel>{label}</FieldLabel>
    <input
      type="number"
      step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
    />
  </label>
);

// ─── Main Sidebar ───────────────────────────────────────────────────────────
export const Sidebar: React.FC<SidebarProps> = ({ config, setConfig, sections, setSections, user }) => {
  const [savedProfiles, setSavedProfiles] = useState<TunnelProfile[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [slopeOpen, setSlopeOpen] = useState(true);

  // ── Firestore sync ──
  useEffect(() => {
    if (!user) { setSavedProfiles([]); return; }
    const path = `users/${user.uid}/profiles`;
    const unsubscribe = onSnapshot(query(collection(db, path)), snap => {
      setSavedProfiles(snap.docs.map(d => d.data() as TunnelProfile));
    }, err => handleFirestoreError(err, OperationType.LIST, path));
    return () => unsubscribe();
  }, [user]);

  // ── Auto-save ──
  useEffect(() => {
    if (!user || (!sections.length && config.id === 'default')) return;
    const t = setTimeout(() => saveProfile(), 1500);
    return () => clearTimeout(t);
  }, [config, sections, user]);

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    const profileId = config.id === 'default' ? Math.random().toString(36).substr(2, 9) : config.id;
    const path = `users/${user.uid}/profiles`;
    try {
      await setDoc(doc(db, path, profileId), {
        id: profileId,
        userId: user.uid,
        config: { ...config, id: profileId },
        sections: sections || [],
        updatedAt: serverTimestamp(),
      } as TunnelProfile, { merge: true });
      if (config.id === 'default') setConfig({ ...config, id: profileId });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `${path}/${profileId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || id === 'default') return;
    const path = `users/${user.uid}/profiles`;
    try { await deleteDoc(doc(db, path, id)); }
    catch (e) { handleFirestoreError(e, OperationType.DELETE, `${path}/${id}`); }
  };

  const loadProfile = (id: string) => {
    const p = savedProfiles.find(p => p.id === id);
    if (p) { setConfig(p.config); setSections(p.sections || []); }
  };

  // ── Config helpers ──
  const updateConfig = (updates: Partial<TunnelConfig>) => setConfig({ ...config, ...updates });

  const handleShapeChange = (shape: TunnelShape) => {
    // Apply template geometry for new shape, keep user's elevation/slope data
    setConfig(applyShapeTemplate(config, shape));
  };

  const handleInitInvertChange = (val: number) => {
    updateConfig({
      initialInvertLevel: val,
      slopeSegments: config.slopeSegments.map((s, i) => i === 0 ? { ...s, startElevation: val } : s),
    });
  };

  // ── Slope segment helpers ──
  const addSlopeSegment = () => {
    const last = config.slopeSegments[config.slopeSegments.length - 1];
    const newSeg: SlopeSegment = {
      id: Math.random().toString(36).substr(2, 9),
      startChainage: last ? last.endChainage : 0,
      endChainage: last ? last.endChainage + 1000 : 1000,
      startElevation: null,
      slope: 0,
    };
    updateConfig({ slopeSegments: [...config.slopeSegments, newSeg] });
  };

  const removeSlopeSegment = (id: string) =>
    updateConfig({ slopeSegments: config.slopeSegments.filter(s => s.id !== id) });

  const updateSlopeSegment = (id: string, updates: Partial<SlopeSegment>) =>
    updateConfig({ slopeSegments: config.slopeSegments.map(s => s.id === id ? { ...s, ...updates } : s) });

  const shapes: TunnelShape[] = ['inverted-d', 'circular', 'horse-shoe'];
  const isCircular = config.shape === 'circular';
  const isHorseshoe = config.shape === 'horse-shoe';

  return (
    <aside className="w-72 bg-slate-900 text-white h-screen overflow-y-auto flex flex-col flex-shrink-0">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-slate-700/60 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configuration</p>
          <h2 className="font-bold text-base text-white leading-tight mt-0.5">Tunnel Setup</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (user && window.confirm('Save current profile before creating a new one?')) {
                saveProfile();
              }
              setConfig(createDefaultConfig('inverted-d'));
              setSections([]);
            }}
            title="New Profile"
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
          {user && (
            <button
              onClick={saveProfile}
              disabled={isSaving}
              title="Save to cloud"
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          )}
        </div>
      </div>

      {/* ── Profile Name ── */}
      <div className="px-5 py-4 border-b border-slate-700/60">
        <FieldLabel>Profile Name</FieldLabel>
        <input
          type="text"
          value={config.name}
          onChange={e => updateConfig({ name: e.target.value })}
          placeholder="e.g. North Tunnel Phase 1"
          className="mt-1.5 w-full bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
        />
      </div>

      {/* ── Templates ── */}
      <div className="px-5 py-4 border-b border-slate-700/60">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <FieldLabel>New from Template</FieldLabel>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {shapes.map(shape => {
            const meta = SHAPE_META[shape];
            const acc = SHAPE_ACCENT_CLASSES[shape];
            const isActive = config.shape === shape;
            return (
              <button
                key={shape}
                onClick={() => handleShapeChange(shape)}
                title={meta.description}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all text-center ${isActive
                    ? `${acc.border} bg-slate-700 text-white border-2`
                    : `border-slate-700 bg-slate-800 text-slate-300 border ${acc.card}`
                  }`}
              >
                <div className={isActive ? 'text-white' : 'text-slate-400'}>
                  {SHAPE_ICONS[shape]}
                </div>
                <span className="text-[9px] font-bold leading-tight">{meta.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[10px] text-slate-500 leading-relaxed">
          {SHAPE_META[config.shape].description}
        </p>
      </div>

      {/* ── Saved Profiles ── */}
      {user && savedProfiles.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <FieldLabel>Saved Profiles</FieldLabel>
          </div>
          <div className="space-y-1.5">
            {savedProfiles.map(p => {
              const acc = SHAPE_ACCENT_CLASSES[p.config.shape as TunnelShape] ?? SHAPE_ACCENT_CLASSES['inverted-d'];
              const isActive = config.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => loadProfile(p.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-slate-600 border border-slate-500' : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{p.config.name}</p>
                    <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${acc.badge}`}>
                      {SHAPE_META[p.config.shape as TunnelShape]?.label ?? p.config.shape}
                    </span>
                  </div>
                  <button
                    onClick={e => deleteProfile(p.id, e)}
                    className="ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!user && (
        <div className="mx-5 my-3 p-3 bg-slate-800 rounded-xl border border-slate-700 text-[10px] text-slate-400 leading-relaxed">
          Sign in to save profiles and sync across devices.
        </div>
      )}

      {/* ── Geometry ── */}
      <div className="px-5 py-4 border-b border-slate-700/60 space-y-3">
        <FieldLabel>Geometry</FieldLabel>

        {/* Width — all shapes except circular (which uses archRadius as radius) */}
        {!isCircular && (
          <NumberInput
            label={isHorseshoe ? "Invert Width (m)" : "Width (m)"}
            value={config.width}
            onChange={v => updateConfig({ width: v })}
          />
        )}

        {/* Arch Radius — all shapes */}
        <NumberInput
          label={isCircular ? 'Inner Radius (m)' : 'Arch Radius (m)'}
          value={config.archRadius}
          onChange={v => updateConfig(isCircular ? { archRadius: v, width: v * 2 } : { archRadius: v })}
        />

        {/* Wall Height — inverted-d and horse-shoe only */}
        {!isCircular && (
          <NumberInput
            label="Wall Height (m)"
            value={config.wallHeight}
            onChange={v => updateConfig({ wallHeight: v })}
          />
        )}

        {/* Wall Radius — horse-shoe only */}
        {isHorseshoe && (
          <NumberInput
            label="Wall Radius (m)"
            value={config.wallRadius || 0}
            onChange={v => updateConfig({ wallRadius: v })}
          />
        )}

        {/* Init Invert — all shapes */}
        <NumberInput
          label="Init Invert (m)"
          value={config.initialInvertLevel}
          onChange={handleInitInvertChange}
          step={0.01}
        />

        {/* Lining thicknesses — all shapes */}
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="Lining Overt (m)"
            value={config.liningThicknessOvert}
            onChange={v => updateConfig({ liningThicknessOvert: v })}
          />
          <NumberInput
            label="Lining Invert (m)"
            value={config.liningThicknessInvert}
            onChange={v => updateConfig({ liningThicknessInvert: v })}
          />
        </div>

        {/* Derived info for shapes */}
        {isHorseshoe && (
          <p className="text-[9px] text-slate-500">
            Spring-line width = 2 × Arch Radius = <span className="text-slate-300 font-bold">{(config.archRadius * 2).toFixed(2)} m</span>
          </p>
        )}
        {isCircular && (
          <p className="text-[9px] text-slate-500">
            Bore diameter = 2 × radius = <span className="text-slate-300 font-bold">{(config.archRadius * 2).toFixed(2)} m</span>
          </p>
        )}

        {/* ── Excavation Reference ── */}
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <Mountain className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Excavation Refs</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <p className="text-[8px] text-slate-500 uppercase font-bold">Wall (Bot to SPL)</p>
              <p className="text-xs font-bold text-white">
                {(config.wallHeight + config.liningThicknessInvert).toFixed(2)} m
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[8px] text-slate-500 uppercase font-bold">Total (Excavation)</p>
              <p className="text-xs font-bold text-blue-400">
                {(config.wallHeight + config.liningThicknessInvert + config.archRadius + config.liningThicknessOvert).toFixed(2)} m
              </p>
            </div>
          </div>
          <p className="text-[8px] text-slate-500 leading-tight italic">
            *Reference for digging phase (from excavation bottom)
          </p>
        </div>

        <button
          onClick={() => setSections([generateDesignSection(config)])}
          className="w-full mt-4 flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 py-2 rounded-lg text-xs font-bold transition-all"
        >
          <Layers className="w-3.5 h-3.5" />
          Generate Design Profile
        </button>
      </div>

      {/* ── Slope Segments ── */}
      <div className="px-5 py-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setSlopeOpen(o => !o)}
            className="flex items-center gap-2 group"
          >
            <Mountain className="w-3.5 h-3.5 text-slate-400" />
            <FieldLabel>Slope Segments</FieldLabel>
            {slopeOpen ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
          </button>
          <button
            onClick={addSlopeSegment}
            className="p-1 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {slopeOpen && (
          <div className="space-y-3">
            {config.slopeSegments.map((seg, index) => (
              <div key={seg.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-2 relative group">
                {config.slopeSegments.length > 1 && (
                  <button
                    onClick={() => removeSlopeSegment(seg.id)}
                    className="absolute -top-2 -right-2 p-1 bg-red-900 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Segment {index + 1}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <FieldLabel>Start Ch</FieldLabel>
                    <input
                      type="number"
                      value={seg.startChainage}
                      onChange={e => updateSlopeSegment(seg.id, { startChainage: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <FieldLabel>End Ch</FieldLabel>
                    <input
                      type="number"
                      value={seg.endChainage}
                      onChange={e => updateSlopeSegment(seg.id, { endChainage: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <FieldLabel>Slope (1:X)</FieldLabel>
                    <input
                      type="number"
                      value={seg.slope !== 0 ? parseFloat((1 / Math.abs(seg.slope)).toFixed(4)) : 0}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        const sign = seg.slope >= 0 ? 1 : -1;
                        updateSlopeSegment(seg.id, { slope: v !== 0 ? sign * (1 / v) : 0 });
                      }}
                      className="w-full bg-slate-700 border border-slate-600 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <FieldLabel>Type</FieldLabel>
                    <div className="flex bg-slate-700 rounded-lg p-0.5 border border-slate-600">
                      <button 
                        onClick={() => updateSlopeSegment(seg.id, { slope: -Math.abs(seg.slope) })}
                        className={`flex-1 text-[8px] font-bold py-1 rounded-md transition-colors ${seg.slope <= 0 ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Down
                      </button>
                      <button 
                        onClick={() => updateSlopeSegment(seg.id, { slope: Math.abs(seg.slope) })}
                        className={`flex-1 text-[8px] font-bold py-1 rounded-md transition-colors ${seg.slope > 0 ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        Up
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {index === 0 && (
                    <label className="block space-y-1">
                      <FieldLabel>Start Elev</FieldLabel>
                      <input
                        type="number"
                        value={seg.startElevation ?? config.initialInvertLevel}
                        onChange={e => updateSlopeSegment(seg.id, { startElevation: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 text-white text-xs px-2 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </label>
                  )}
                  <button
                    onClick={() => updateSlopeSegment(seg.id, { startChainage: seg.endChainage, endChainage: seg.startChainage })}
                    className="mt-4 flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-[9px] font-bold text-slate-300 py-1.5 rounded-lg border border-slate-600 transition-colors"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Swap Direction
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
