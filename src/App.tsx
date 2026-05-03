import React, { useState, useCallback, useEffect, useRef } from 'react';

import { Sidebar } from './components/Sidebar';
import { CrossSectionView } from './components/CrossSectionView';
import { PointsPanel } from './components/PointsPanel';
import { TunnelConfig, SectionData, UploadOptions } from './types';
import { processSurveyData } from './lib/tunnel-logic';
import { exportToDXF, exportToPDF } from './lib/export-logic';
import { createDefaultConfig } from './lib/templates';
import { Tunnel3DView } from './components/Tunnel3DView';
import { Upload, FileText, Download, ChevronLeft, ChevronRight, HardHat, RefreshCw, FileDown, LogIn, LogOut, User } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { auth, signIn, logOut } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

const DEFAULT_CONFIG: TunnelConfig = createDefaultConfig('inverted-d');

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [config, setConfig] = useState<TunnelConfig>(DEFAULT_CONFIG);
  const [sections, setSections] = useState<SectionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(true);
  const [isAddingPoint, setIsAddingPoint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfScale, setPdfScale] = useState<string>('Fit to Page');
  const [activeTab, setActiveTab] = useState<'2d' | '3d'>('2d');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({
    format: 'local',
    order: 'EN',
    flipSides: true
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    console.log('Processing file:', file.name);
    const reader = new FileReader();
    
    reader.onerror = () => {
      console.error('FileReader error');
      setUploadError('Error reading file from disk.');
    };

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) throw new Error('No data read from file');

        console.log('File data read successfully');

        if (file.name.toLowerCase().endsWith('.csv')) {
          console.log('Parsing CSV...');
          Papa.parse(data as string, {
            header: false,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
              try {
                console.log('CSV parsed, rows:', results.data.length);
                const processed = processSurveyData(results.data, { ...uploadOptions, flipSides: isFlipped });
                console.log('Survey data processed, sections:', processed.length);
                
                if (processed.length === 0) {
                  setUploadError('No valid survey sections found. Please ensure your file has Easting, Northing, and Elevation columns.');
                  return;
                }
                setSections(processed);
                setCurrentIndex(0);
                console.log('State updated successfully');
              } catch (err) {
                console.error('Error processing survey data:', err);
                setUploadError('Error processing survey data. Please check the file format.');
              }
            },
            error: (err) => {
              console.error('PapaParse error:', err);
              setUploadError('Error parsing CSV file.');
            }
          });
        } else {
          console.log('Parsing Excel...');
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          console.log('Excel parsed, rows:', jsonData.length);
          const processed = processSurveyData(jsonData as any[][], { ...uploadOptions, flipSides: isFlipped });
          console.log('Survey data processed, sections:', processed.length);
          
          if (processed.length === 0) {
            setUploadError('No valid survey sections found. Please ensure your file has Easting, Northing, and Elevation columns.');
            return;
          }
          setSections(processed);
          setCurrentIndex(0);
          console.log('State updated successfully');
        }
      } catch (err) {
        console.error('File upload error:', err);
        setUploadError('Error reading or processing file.');
      }
    };

    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
    
    // Reset input value so the same file can be uploaded again
    e.target.value = '';
  };

  const handleExportDXF = () => {
    if (sections.length === 0) return;
    const dxfString = exportToDXF(sections, config);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tunnel_Export_${new Date().toISOString().split('T')[0]}.dxf`;
    link.click();
  };

  const handleExportPDF = async () => {
    if (sections.length === 0) return;
    
    // Generate PDF with internal Native Canvas method
    const pdfBlob = await exportToPDF(sections, config, pdfScale);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tunnel_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    link.click();
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (sections.length === 0) return;
    if (e.shiftKey) {
      e.stopPropagation();
      e.preventDefault();
      if (e.deltaY > 0) {
        setCurrentIndex(prev => Math.min(sections.length - 1, prev + 1));
      } else if (e.deltaY < 0) {
        setCurrentIndex(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleEditChainageLabel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setSections(prevs => prevs.map((sec, i) => {
      if (i !== currentIndex) return sec;
      return { ...sec, chainageLabel: newVal };
    }));
  };

  const handleAddPoint = (easting: number, elevation: number) => {
    setSections(prevs => prevs.map((sec, i) => {
      if (i !== currentIndex) return sec;
      const newPoint = { easting, elevation, type: 'manual' as const, isManual: true };
      
      const centerX = sec.points.reduce((sum, p) => sum + p.easting, 0) / sec.points.length;
      const centerY = sec.points.reduce((sum, p) => sum + p.elevation, 0) / sec.points.length;
      
      const newPoints = [...sec.points, newPoint].sort((a, b) => {
        return Math.atan2(a.elevation - centerY, a.easting - centerX) - Math.atan2(b.elevation - centerY, b.easting - centerX);
      });

      return { ...sec, points: newPoints };
    }));
    setIsAddingPoint(false);
  };

  const handleEditPoint = (pointIndex: number, easting: number, elevation: number) => {
    setSections(prevs => prevs.map((sec, i) => {
      if (i !== currentIndex) return sec;
      const newPoints = [...sec.points];
      newPoints[pointIndex] = { ...newPoints[pointIndex], easting, elevation, isEdited: true };
      return { ...sec, points: newPoints };
    }));
  };

  const handleDeletePoint = (pointIndex: number) => {
    setSections(prevs => prevs.map((sec, i) => {
      if (i !== currentIndex) return sec;
      return { ...sec, points: sec.points.filter((_, idx) => idx !== pointIndex) };
    }));
  };

  const currentSection = sections[currentIndex];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900">
      <Sidebar config={config} setConfig={setConfig} sections={sections} setSections={setSections} user={user} />
      
      <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <HardHat className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">Tunnel Engineering Pro</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Cross-Section Analysis & Reporting</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <div className="flex items-center gap-2 mr-4 border-r border-slate-200 pr-4">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-slate-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="hidden lg:block">
                      <p className="text-xs font-bold text-slate-700 leading-none">{user.displayName}</p>
                      <button onClick={logOut} className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-wider">Sign Out</button>
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsUploadModalOpen(true)}
                    className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-600">Upload Survey</span>
                  </button>

                  <button 
                    onClick={() => setIsFlipped(!isFlipped)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors text-sm font-medium ${
                      isFlipped ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                    title="Flip Left/Right Easting"
                  >
                    <RefreshCw className={`w-4 h-4 ${isFlipped ? 'rotate-180' : ''} transition-transform`} />
                    <span>{isFlipped ? 'Flipped' : 'Normal'}</span>
                  </button>

                  <div className="flex items-center bg-slate-100 rounded-md p-0.5 border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 px-2 uppercase">Scale</span>
                    <select 
                      value={pdfScale}
                      onChange={(e) => setPdfScale(e.target.value)}
                      className="bg-white border text-sm font-medium border-slate-200 rounded-md px-2 py-1 outline-none focus:border-blue-500"
                    >
                      <option value="Fit to Page">Fit to Page</option>
                      <option value="1:50">1:50</option>
                      <option value="1:100">1:100</option>
                      <option value="1:200">1:200</option>
                    </select>
                  </div>
                  
                  <button 
                    onClick={handleExportPDF}
                    disabled={sections.length === 0}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Export PDF</span>
                  </button>
                  
                  <button 
                    onClick={handleExportDXF}
                    disabled={sections.length === 0}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export DXF</span>
                  </button>
                </>
              ) : (
                <button 
                  onClick={signIn}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-md transition-all font-bold"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In with Google</span>
                </button>
              )}
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-8">
            {!user ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-6">
                <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-xl flex flex-col items-center gap-6 max-w-md text-center">
                  <div className="bg-blue-50 p-6 rounded-full">
                    <HardHat className="w-16 h-16 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-slate-800 font-bold text-2xl mb-2">Welcome to Tunnel Pro</h2>
                    <p className="text-slate-500">Sign in to securely manage your tunnel configurations and analyze survey cross-sections.</p>
                  </div>
                  <button 
                    onClick={signIn}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl shadow-lg transition-all font-bold flex items-center justify-center gap-3"
                  >
                    <LogIn className="w-5 h-5" />
                    <span>Get Started</span>
                  </button>
                </div>
              </div>
            ) : sections.length > 0 ? (
            <div className="max-w-4xl mx-auto space-y-8">
              {/* Tabs */}
              <div className="flex items-center gap-4 border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('2d')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === '2d' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  2D Cross-Section
                </button>
                <button
                  onClick={() => setActiveTab('3d')}
                  className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === '3d' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  3D Tunnel View
                </button>
              </div>

              {activeTab === '2d' ? (
                <>
                  {/* Navigation */}
                  <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <button 
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-2 hover:bg-slate-50 rounded-full disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                
                <div className="flex-1 flex flex-col items-center gap-2">
                  <div 
                    className="flex flex-col items-center cursor-ns-resize border-2 border-dashed border-blue-300 bg-blue-50/50 rounded-lg p-2 w-56 hover:bg-blue-100 transition-colors select-none"
                    onWheel={handleWheel}
                    title="Scroll here to navigate sections. You can edit the chainage label."
                  >
                    <span className="text-xs font-bold text-blue-600 uppercase">Scroll Area</span>
                    <span className="text-xs font-bold text-slate-500 uppercase mb-1">Section {currentIndex + 1} of {sections.length}</span>
                    <input 
                      type="text" 
                      value={sections[currentIndex]?.chainageLabel || `CH ${sections[currentIndex]?.chainage.toFixed(2)}`} 
                      onChange={handleEditChainageLabel}
                      className="text-lg font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-0.5 text-center w-full focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={sections.length - 1}
                    value={currentIndex}
                    onChange={(e) => setCurrentIndex(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                
                <button 
                  onClick={() => setCurrentIndex(prev => Math.min(sections.length - 1, prev + 1))}
                  disabled={currentIndex === sections.length - 1}
                  className="p-2 hover:bg-slate-50 rounded-full disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              {/* Viewer */}
              {sections[currentIndex] ? (
                <CrossSectionView 
                  key={sections[currentIndex].chainage}
                  section={sections[currentIndex]} 
                  config={config} 
                  onWheel={handleWheel}
                  isAddingPoint={isAddingPoint}
                  onAddPoint={handleAddPoint}
                />
              ) : (
                <div className="p-12 bg-white rounded-xl border border-slate-200 text-center text-slate-400">
                  Select a section to view
                </div>
              )}

              {/* Data Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="font-bold text-slate-700">Survey Points</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                      <tr>
                        <th className="px-6 py-3">Point</th>
                        <th className="px-6 py-3">Easting (Offset)</th>
                        <th className="px-6 py-3">Elevation</th>
                        <th className="px-6 py-3">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sections[currentIndex].points.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-6 py-3 font-medium">{p.easting.toFixed(3)}</td>
                          <td className="px-6 py-3 font-medium">{p.elevation.toFixed(3)}</td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              p.type === 'survey' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {p.type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                </>
              ) : (
                <Tunnel3DView sections={sections} config={config} />
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
              <div className="bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-4 max-w-md text-center">
                <div className="bg-slate-50 p-4 rounded-full">
                  <Upload className="w-12 h-12 text-slate-300" />
                </div>
                <div>
                  <h3 className="text-slate-600 font-bold text-lg">No Survey Data</h3>
                  <p className="text-sm">Upload a CSV or Excel file containing Easting, Northing, and Elevation columns to begin analysis.</p>
                </div>
                <button 
                  onClick={() => setIsUploadModalOpen(true)}
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-md transition-all font-bold"
                >
                  Select File
                </button>
                {uploadError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs max-w-xs">
                    {uploadError}
                  </div>
                )}
              </div>
            </div>
          )}
          <input 
            ref={fileInputRef}
            type="file" 
            className="hidden" 
            onChange={handleFileUpload} 
            accept=".csv,.xlsx,.xls" 
          />
        </div>
      </main>
      <PointsPanel 
        section={currentSection} 
        isAddingPoint={isAddingPoint} 
        setIsAddingPoint={setIsAddingPoint}
        onEditPoint={handleEditPoint}
        onDeletePoint={handleDeletePoint}
      />
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Upload Survey Data</h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Data Format</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="format" checked={uploadOptions.format === 'local'} onChange={() => setUploadOptions(prev => ({...prev, format: 'local'}))} />
                    <span className="text-sm">Local Coordinates (Offset)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="format" checked={uploadOptions.format === 'global'} onChange={() => setUploadOptions(prev => ({...prev, format: 'global'}))} />
                    <span className="text-sm">Global Coordinates (X, Y)</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Column Order</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="order" checked={uploadOptions.order === 'EN'} onChange={() => setUploadOptions(prev => ({...prev, order: 'EN'}))} />
                    <span className="text-sm">Easting, Northing</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="order" checked={uploadOptions.order === 'NE'} onChange={() => setUploadOptions(prev => ({...prev, order: 'NE'}))} />
                    <span className="text-sm">Northing, Easting</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setIsUploadModalOpen(false);
                  fileInputRef.current?.click();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold"
              >
                Select File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
