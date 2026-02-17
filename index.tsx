import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Upload, Play, Pause, SkipBack, SkipForward, 
  CheckCircle, Box as BoxIcon, FileJson, Video as VideoIcon, 
  ChevronRight, Save, MousePointer2, Trash2, ArrowLeft,
  Clock, AlertTriangle, Info, Crosshair, Plus, Minus
} from 'lucide-react';

// --- DENM Data Model ---
const DENM_MAPPING: any = {
  categories: {
    "a": { name: "Temporary slippery road", causeCodes: [6, 9] },
    "b": { name: "Animal / people / obstacles / debris on the road", causeCodes: [10, 11, 12, 94] },
    "c": { name: "Unprotected accident area", causeCodes: [2] },
    "d": { name: "Short term road works", causeCodes: [3, 15] },
    "e": { name: "Reduced visibility", causeCodes: [18] },
    "f": { name: "Wrong-way driver", causeCodes: [14] },
    "h": { name: "Exceptional weather conditions", causeCodes: [17, 19] }
  },
  causeCodes: {
    "2": { name: "accident", subCauseCodes: { "7": "unsecured accident" } },
    "3": { name: "roadworks", subCauseCodes: { "2": "road marking work", "3": "slow moving road maintenance", "4": "short-term stationary roadworks" } },
    "6": { name: "adverseWeatherCondition-adhesion", subCauseCodes: { "0": "slippery road (generic)", "2": "fuel on road", "3": "mud on road", "5": "ice on road", "6": "black ice on road", "7": "oil on road", "8": "loose chippings" } },
    "9": { name: "hazardousLocation-surfaceCondition", subCauseCodes: { "0": "flooding", "5": "snow drifts" } },
    "10": { name: "hazardousLocation-obstacleOnTheRoad", subCauseCodes: { "0": "objects on the road", "1": "shed load", "4": "large objects", "5": "fallen trees" } },
    "11": { name: "hazardousLocation-animalOnTheRoad", subCauseCodes: { "0": "animals on roadway", "2": "herd of animals", "4": "large animals" } },
    "12": { name: "humanPresenceOnTheRoad", subCauseCodes: { "0": "people on roadway", "1": "children on roadway", "2": "cyclists on roadway" } },
    "14": { name: "wrongWayDriving", subCauseCodes: { "0": "wrong way driving" } },
    "15": { name: "rescueAndRecoveryWorkInProgress", subCauseCodes: { "0": "rescue and recovery work in progress" } },
    "17": { name: "adverseWeatherCondition-ExtremeWeather", subCauseCodes: { "1": "strong winds" } },
    "18": { name: "adverseWeatherCondition-Visibility", subCauseCodes: { "0": "visibility reduced (generic)", "1": "visibility reduced due to fog", "2": "visibility reduced due to smoke", "3": "visibility reduced due to heavy snowfall", "6": "visibility reduced due to low sun glare" } },
    "19": { name: "adverseWeatherCondition-Precipitation", subCauseCodes: { "1": "heavy rain", "2": "heavy snowfall" } },
    "94": { name: "vehicleBreakdown", subCauseCodes: { "2": "broken down vehicle" } }
  }
};

// --- Types ---

// [t, ymin, xmin, ymax, xmax] - Normalized t 0-1, coords 0-1000
type IncidentBox = [number, number, number, number, number];

interface IncidentData {
  incident: number; // 0 or 1
  message_type: "DENM" | "none";
  cause_code: number | null;
  sub_cause_code: number | null;
  cause_text: string | null;
  sub_cause_text: string | null;
  box_2d: IncidentBox[]; // Array of exactly 2 arrays if incident=1
  description: string;
}

interface DatasetItem {
  id: number;
  video: string;
  conversations: { from: string; value: string }[];
  _parsed?: IncidentData; // Internal field for editing
  [key: string]: any;
}

// --- Helper Functions ---

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, title = '' }: any) => {
  const base = "px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 select-none";
  const variants: any = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-800 disabled:opacity-50",
    secondary: "bg-gray-700 hover:bg-gray-600 text-gray-100 disabled:opacity-50",
    danger: "bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-800",
    ghost: "hover:bg-gray-800 text-gray-300",
    outline: "border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50"
  };
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`} disabled={disabled} title={title}>
      {children}
    </button>
  );
};

interface CoordControlProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

const CoordControl: React.FC<CoordControlProps> = ({ label, value, onChange }) => {
    // Value is passed as number, we display rounded
    const displayValue = Math.round(value);
    
    return (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase font-bold text-gray-500">{label}</span>
            <div className="flex items-center bg-gray-900 rounded border border-gray-700 overflow-hidden">
                <button 
                    className="w-6 h-6 flex items-center justify-center hover:bg-gray-800 text-gray-400 hover:text-white transition-colors border-r border-gray-700 active:bg-gray-700"
                    onClick={() => onChange(value - 20)}
                    title="-20"
                ><Minus className="w-3 h-3" /></button>
                <input 
                    key={value /* Key ensures input re-renders if value changes externally */}
                    type="number" 
                    className="w-12 bg-transparent text-xs text-center outline-none font-mono py-1 appearance-none text-gray-200"
                    value={displayValue}
                    onChange={(e) => onChange(Number(e.target.value))}
                />
                <button 
                    className="w-6 h-6 flex items-center justify-center hover:bg-gray-800 text-gray-400 hover:text-white transition-colors border-l border-gray-700 active:bg-gray-700"
                    onClick={() => onChange(value + 20)}
                    title="+20"
                ><Plus className="w-3 h-3" /></button>
            </div>
        </div>
    )
}

// --- Main App Component ---

const App = () => {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonData, setJsonData] = useState<DatasetItem[]>([]);
  const [videoFiles, setVideoFiles] = useState<Map<string, string>>(new Map());
  const [isWorkspaceActive, setIsWorkspaceActive] = useState(false);
  const [isDragging, setIsDragging] = useState<'json' | 'video' | null>(null);

  // Selection
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1);
  const [activeKeyframe, setActiveKeyframe] = useState<0 | 1>(0); // 0 = Start Frame, 1 = End Frame

  // Player
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(30);
  
  // Video Reference State (Robust handling of refs)
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // --- Parsing Logic ---

  const processJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const arr = Array.isArray(raw) ? raw : [raw];
        
        // Parse the inner JSON strings immediately
        const processed = arr.map((item: DatasetItem) => {
            const assistant = item.conversations?.find(c => c.from === 'assistant');
            if (assistant && assistant.value) {
                try {
                    item._parsed = JSON.parse(assistant.value);
                } catch (e) {
                    console.error("Inner JSON parse error", e);
                    // Fallback default
                    item._parsed = {
                        incident: 0, message_type: 'none', 
                        cause_code: null, sub_cause_code: null, 
                        cause_text: null, sub_cause_text: null, 
                        box_2d: [], description: ""
                    };
                }
            }
            return item;
        });

        setJsonData(processed);
        setJsonFile(file);
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const processVideoFiles = (files: FileList | File[]) => {
    const newMap = new Map(videoFiles);
    Array.from(files).forEach((file) => {
       if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i)) {
           newMap.set(file.name, URL.createObjectURL(file));
       }
    });
    setVideoFiles(newMap);
  };

  // --- Actions ---

  const handleDrag = (e: React.DragEvent, type: any) => {
      e.preventDefault(); e.stopPropagation();
      if (e.type === 'drop') {
          setIsDragging(null);
          if (type === 'json' && e.dataTransfer.files[0]) processJsonFile(e.dataTransfer.files[0]);
          if (type === 'video' && e.dataTransfer.files) processVideoFiles(e.dataTransfer.files);
      } else {
          setIsDragging(type);
      }
  };

  const updateField = (key: keyof IncidentData, value: any) => {
      setJsonData(prev => {
          if (selectedItemIndex === -1) return prev;
          const newData = [...prev];
          
          // Immutable update: shallow copy item and parsed object
          const item = { ...newData[selectedItemIndex] };
          if (!item._parsed) return prev;
          const parsed = { ...item._parsed };
          
          if (parsed.box_2d) parsed.box_2d = [...parsed.box_2d];

          (parsed as any)[key] = value;

          // Auto-logic for DENM compliance
          if (key === 'incident') {
              if (value === 1) {
                  parsed.message_type = "DENM";
                  // Initialize box if empty
                  if (!parsed.box_2d || parsed.box_2d.length !== 2) {
                      // Default: Start at 0, End at 1. Box 0-0-0-0
                      parsed.box_2d = [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0]]; 
                  }
              } else {
                  parsed.message_type = "none";
                  parsed.cause_code = null;
                  parsed.sub_cause_code = null;
                  parsed.cause_text = null;
                  parsed.sub_cause_text = null;
                  parsed.box_2d = [];
              }
          }

          if (key === 'cause_code') {
               // Handle clearing selection
               if (value === null || value === 0) {
                   parsed.cause_code = null;
                   parsed.cause_text = null;
               } else {
                   const info = DENM_MAPPING.causeCodes[String(value)];
                   parsed.cause_text = info ? info.name : null;
               }
               parsed.sub_cause_code = null; // Reset sub cause
               parsed.sub_cause_text = null;
          }

          if (key === 'sub_cause_code') {
               if (value === null || value === 0) {
                   parsed.sub_cause_code = null;
                   parsed.sub_cause_text = null;
               } else {
                   const cc = parsed.cause_code;
                   const info = DENM_MAPPING.causeCodes[String(cc)];
                   if (info && info.subCauseCodes) {
                       parsed.sub_cause_text = info.subCauseCodes[String(value)] || null;
                   }
               }
          }

          item._parsed = parsed;
          newData[selectedItemIndex] = item;
          return newData;
      });
  };

  const updateBox = (idx: 0 | 1, newBox: IncidentBox) => {
      setJsonData(prev => {
          if (selectedItemIndex === -1) return prev;
          const newData = [...prev];
          const item = { ...newData[selectedItemIndex] };
          if (!item._parsed) return prev;

          const parsed = { ...item._parsed };
          // Deep copy the box_2d array to avoid mutation
          parsed.box_2d = parsed.box_2d.map(box => [...box]) as IncidentBox[];
          
          if (parsed.incident === 1 && parsed.box_2d.length === 2) {
               // Clamp AND Round values for schema compliance (integers 0-1000)
              const clamped: IncidentBox = [
                 newBox[0], // time stays float
                 Math.round(Math.max(0, Math.min(1000, newBox[1]))),
                 Math.round(Math.max(0, Math.min(1000, newBox[2]))),
                 Math.round(Math.max(0, Math.min(1000, newBox[3]))),
                 Math.round(Math.max(0, Math.min(1000, newBox[4])))
              ];
              parsed.box_2d[idx] = clamped;
              item._parsed = parsed;
              newData[selectedItemIndex] = item;
              return newData;
          }
          return prev;
      });
  };

  const downloadJson = () => {
      // Serialize back to string
      const exportData = jsonData.map(item => {
          const newItem = { ...item };
          if (newItem._parsed && newItem.conversations) {
              const assistantIdx = newItem.conversations.findIndex(c => c.from === 'assistant');
              if (assistantIdx !== -1) {
                  // Reconstruct object to enforce schema and clean any extra properties
                  const { 
                      incident, message_type, cause_code, sub_cause_code, 
                      cause_text, sub_cause_text, box_2d, description 
                  } = newItem._parsed;
                  
                  const cleanParsed: IncidentData = {
                      incident, message_type, cause_code, sub_cause_code,
                      cause_text, sub_cause_text, box_2d, description
                  };

                  newItem.conversations = [...newItem.conversations];
                  newItem.conversations[assistantIdx] = {
                      ...newItem.conversations[assistantIdx],
                      value: JSON.stringify(cleanParsed)
                  };
              }
          }
          // Remove internal working field before export
          if ('_parsed' in newItem) {
              delete newItem._parsed;
          }
          return newItem;
      });

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = jsonFile ? `annotated_${jsonFile.name}` : 'annotated_dataset.json';
      a.click();
  };

  // --- Video Logic ---

  useEffect(() => {
    // Only bind if videoNode is available
    if (!videoNode) return;
    
    const ut = () => setCurrentTime(videoNode.currentTime);
    const ud = () => setDuration(videoNode.duration);
    
    videoNode.addEventListener('timeupdate', ut);
    videoNode.addEventListener('loadedmetadata', ud);
    
    // Initial sync
    setCurrentTime(videoNode.currentTime);
    if (!isNaN(videoNode.duration)) setDuration(videoNode.duration);

    return () => { 
        videoNode.removeEventListener('timeupdate', ut); 
        videoNode.removeEventListener('loadedmetadata', ud); 
    };
  }, [selectedItemIndex, videoNode]); // Depend on videoNode

  const seekTo = (t: number) => {
      if (videoNode) videoNode.currentTime = t;
  };

  // --- Render ---

  if (!isWorkspaceActive) {
      return (
          <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-8 font-sans">
              <div className="max-w-2xl w-full bg-gray-900 rounded-xl border border-gray-800 p-8 shadow-2xl">
                  <div className="text-center mb-10">
                      <div className="bg-blue-600/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Info className="w-8 h-8 text-blue-500" />
                      </div>
                      <h1 className="text-3xl font-bold mb-2">DENM Annotator</h1>
                      <p className="text-gray-400">Strict schema validation for Incident Datasets</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                      <div 
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging === 'json' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'}`}
                        onDragOver={e => handleDrag(e, 'json')} onDragLeave={e => handleDrag(e, null)} onDrop={e => handleDrag(e, 'json')}
                      >
                          <input type="file" accept=".json" className="hidden" id="json-up" onChange={e => e.target.files?.[0] && processJsonFile(e.target.files[0])} />
                          <label htmlFor="json-up" className="cursor-pointer block h-full">
                              <FileJson className="w-10 h-10 mx-auto mb-3 text-gray-500" />
                              <div className="text-sm font-medium">{jsonFile ? jsonFile.name : "Upload JSON"}</div>
                          </label>
                      </div>
                      <div 
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging === 'video' ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 hover:border-gray-500'}`}
                        onDragOver={e => handleDrag(e, 'video')} onDragLeave={e => handleDrag(e, null)} onDrop={e => handleDrag(e, 'video')}
                      >
                          <input type="file" accept="video/*" multiple className="hidden" id="vid-up" onChange={e => e.target.files && processVideoFiles(e.target.files)} />
                          <label htmlFor="vid-up" className="cursor-pointer block h-full">
                              <VideoIcon className="w-10 h-10 mx-auto mb-3 text-gray-500" />
                              <div className="text-sm font-medium">{videoFiles.size > 0 ? `${videoFiles.size} Videos` : "Upload Videos"}</div>
                          </label>
                      </div>
                  </div>
                  <div className="mt-8 flex justify-end">
                      <Button onClick={() => { setSelectedItemIndex(0); setIsWorkspaceActive(true); }} disabled={!jsonFile}>
                          Start Annotating <ChevronRight className="w-4 h-4" />
                      </Button>
                  </div>
              </div>
          </div>
      )
  }

  const item = jsonData[selectedItemIndex];
  const parsed = item?._parsed;
  
  // Video Matcher
  let videoUrl = undefined;
  if (item) {
      const candidates = [item.video, item.video_filename];
      const match = candidates.find(c => videoFiles.has(c)) || candidates.find(c => videoFiles.has(c?.split('/').pop()));
      if (match) videoUrl = videoFiles.get(match) || videoFiles.get(match.split('/').pop()!);
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-200 overflow-hidden">
      {/* Header */}
      <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsWorkspaceActive(false)}>
              <ArrowLeft className="w-4 h-4" />
              <span className="font-bold text-sm">DENM Studio</span>
              <span className="text-xs text-gray-500">{jsonFile?.name}</span>
          </div>
          <Button onClick={downloadJson} variant="primary" className="h-8">
              <Save className="w-4 h-4" /> Export
          </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {jsonData.map((it, i) => (
                      <div key={it.id || i} 
                           onClick={() => setSelectedItemIndex(i)}
                           className={`px-4 py-3 border-b border-gray-800 cursor-pointer flex justify-between items-center ${selectedItemIndex === i ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : ''}`}>
                          <div className="truncate text-xs font-mono text-gray-400">{it.video}</div>
                          {it._parsed?.incident === 1 && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                      </div>
                  ))}
              </div>
          </aside>

          {/* Main */}
          <main className="flex-1 bg-black flex flex-col relative">
               {/* Player */}
               <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                   {videoUrl ? (
                       <div className="relative group max-h-full max-w-full">
                           <video 
                              ref={(el) => {
                                  videoRef.current = el;
                                  // Update state only if changed to avoid loops, though strict equality handles this.
                                  if (el !== videoNode) setVideoNode(el);
                              }}
                              src={videoUrl} 
                              className="max-h-[calc(100vh-250px)] max-w-full shadow-lg"
                              onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}
                              onPlay={() => setIsPlaying(true)}
                              onPause={() => setIsPlaying(false)}
                           />
                           {/* Ensure BoxOverlay only renders when videoNode is ready */}
                           {parsed && parsed.incident === 1 && parsed.box_2d.length === 2 && videoNode && (
                               <BoxOverlay 
                                  activeKeyframe={activeKeyframe}
                                  boxData={parsed.box_2d}
                                  onUpdate={updateBox}
                               />
                           )}
                       </div>
                   ) : (
                       <div className="text-gray-600">No Video</div>
                   )}
               </div>

               {/* Toolbar */}
               <div className="h-40 bg-gray-900 border-t border-gray-800 shrink-0 p-4">
                  {/* Play Controls */}
                  <div className="flex items-center gap-4 mb-4">
                      <Button variant="secondary" onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}>
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <div className="text-sm font-mono text-gray-400">
                          {formatTime(currentTime)} / {formatTime(duration)}
                      </div>
                      <input 
                          type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
                          onChange={e => seekTo(Number(e.target.value))}
                          className="flex-1 accent-blue-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                  </div>
                  
                  {/* Spatiotemporal Editor */}
                  {parsed && parsed.incident === 1 && parsed.box_2d.length === 2 ? (
                      <div className="flex items-center gap-4 bg-gray-800 p-2 rounded-lg border border-gray-700">
                          <span className="text-xs font-bold text-gray-500 uppercase px-2">Keyframe Editor</span>
                          
                          {[0, 1].map((idx) => {
                              const t = parsed.box_2d[idx][0];
                              const isActive = activeKeyframe === idx;
                              return (
                                  <div key={idx} 
                                       className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer border ${isActive ? 'bg-blue-900/30 border-blue-500 text-blue-200' : 'bg-gray-700/30 border-transparent hover:bg-gray-700'}`}
                                       onClick={() => { setActiveKeyframe(idx as 0|1); seekTo(t * duration); }}
                                  >
                                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-400' : 'bg-gray-500'}`} />
                                      <span className="text-xs font-bold">{idx === 0 ? 'Start' : 'End'}</span>
                                      <code className="text-xs font-mono opacity-70">t={t.toFixed(4)}</code>
                                  </div>
                              )
                          })}

                          {/* Manual Time Input */}
                          <div className="flex flex-col ml-2">
                             <label className="text-[10px] uppercase font-bold text-gray-500 mb-1">Time (s)</label>
                             <div className="flex items-center bg-gray-900 rounded border border-gray-700 overflow-hidden w-24">
                                <input 
                                    type="number"
                                    step={0.01}
                                    min={0}
                                    max={duration}
                                    className="w-full bg-transparent text-xs font-mono text-white p-1 outline-none text-right"
                                    value={(parsed.box_2d[activeKeyframe][0] * duration).toFixed(2)}
                                    onChange={(e) => {
                                        const s = parseFloat(e.target.value);
                                        if(!isNaN(s) && duration > 0) {
                                             // Pass a complete new box tuple
                                             const old = parsed.box_2d[activeKeyframe];
                                             const newBox: IncidentBox = [s / duration, old[1], old[2], old[3], old[4]];
                                             updateBox(activeKeyframe, newBox);
                                        }
                                    }}
                                />
                                <div className="pr-2 pl-1 text-gray-500 text-[10px]">s</div>
                             </div>
                          </div>

                          <div className="h-6 w-px bg-gray-700 mx-2" />

                          {/* Coordinate Controls */}
                          <div className="flex items-center gap-2">
                             {[1, 2, 3, 4].map(idx => {
                                 const labels = ["Y-Min", "X-Min", "Y-Max", "X-Max"];
                                 return (
                                     <CoordControl 
                                        key={idx}
                                        label={labels[idx-1]}
                                        value={parsed.box_2d[activeKeyframe][idx] as number}
                                        onChange={(v) => {
                                            const newBox = [...parsed.box_2d[activeKeyframe]] as IncidentBox;
                                            newBox[idx] = v;
                                            updateBox(activeKeyframe, newBox);
                                        }}
                                     />
                                 )
                             })}
                          </div>

                          <div className="h-6 w-px bg-gray-700 mx-2" />

                          <Button variant="outline" className="text-xs h-7" 
                            onClick={() => {
                                // Sync time
                                const newT = duration > 0 ? currentTime / duration : 0;
                                const currentBox = parsed.box_2d[activeKeyframe];
                                // Update t in the tuple [t, ymin, xmin, ymax, xmax]
                                updateBox(activeKeyframe, [newT, currentBox[1], currentBox[2], currentBox[3], currentBox[4]]);
                            }}>
                              <Clock className="w-3 h-3" /> Sync Time
                          </Button>
                      </div>
                  ) : (
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                          <Info className="w-4 h-4" /> Enable "Incident" to edit bounding boxes.
                      </div>
                  )}
               </div>
          </main>

          {/* Inspector */}
          <aside className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto">
              {parsed ? (
                  <div className="p-4 space-y-6">
                      
                      {/* Incident Toggle */}
                      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
                          <span className="text-sm font-bold text-gray-200">Traffic Incident?</span>
                          <div className="flex bg-gray-900 rounded p-1">
                              <button 
                                onClick={() => updateField('incident', 0)}
                                className={`px-3 py-1 text-xs font-bold rounded ${parsed.incident === 0 ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                                NO
                              </button>
                              <button 
                                onClick={() => updateField('incident', 1)}
                                className={`px-3 py-1 text-xs font-bold rounded ${parsed.incident === 1 ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                                YES
                              </button>
                          </div>
                      </div>

                      {parsed.incident === 1 && (
                          <>
                              {/* Cause Code */}
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Cause Code</label>
                                  <select 
                                      className="w-full bg-gray-800 border border-gray-700 text-sm text-white rounded p-2 focus:border-blue-500 outline-none"
                                      value={parsed.cause_code || ""}
                                      onChange={e => {
                                          const v = e.target.value;
                                          updateField('cause_code', v === "" ? null : Number(v));
                                      }}
                                  >
                                      <option value="">Select Cause...</option>
                                      {Object.entries(DENM_MAPPING.causeCodes).map(([code, info]: any) => (
                                          <option key={code} value={code}>{code} - {info.name}</option>
                                      ))}
                                  </select>
                                  <div className="text-xs text-gray-500 font-mono bg-black/20 p-1 rounded">
                                      Text: {parsed.cause_text || "null"}
                                  </div>
                              </div>

                              {/* Sub Cause Code */}
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Sub Cause Code</label>
                                  <select 
                                      className="w-full bg-gray-800 border border-gray-700 text-sm text-white rounded p-2 focus:border-blue-500 outline-none"
                                      value={parsed.sub_cause_code || ""}
                                      onChange={e => {
                                          const v = e.target.value;
                                          updateField('sub_cause_code', v === "" ? null : Number(v));
                                      }}
                                      disabled={!parsed.cause_code}
                                  >
                                      <option value="">Select Sub Cause...</option>
                                      {parsed.cause_code && DENM_MAPPING.causeCodes[String(parsed.cause_code)]?.subCauseCodes && 
                                          Object.entries(DENM_MAPPING.causeCodes[String(parsed.cause_code)].subCauseCodes).map(([code, text]: any) => (
                                              <option key={code} value={code}>{code} - {text}</option>
                                          ))
                                      }
                                  </select>
                                  <div className="text-xs text-gray-500 font-mono bg-black/20 p-1 rounded">
                                      Text: {parsed.sub_cause_text || "null"}
                                  </div>
                              </div>
                          </>
                      )}

                      {/* Description */}
                      <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                          <textarea 
                              className="w-full bg-gray-800 border border-gray-700 text-sm text-white rounded p-2 h-32 focus:border-blue-500 outline-none resize-none"
                              value={parsed.description || ""}
                              onChange={e => updateField('description', e.target.value)}
                              placeholder="Describe the scene and hazard..."
                          />
                      </div>

                      <div className="pt-4 border-t border-gray-800">
                           <div className="text-xs text-gray-600 font-mono">
                               Type: {parsed.message_type}
                           </div>
                      </div>

                  </div>
              ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                      Select an item
                  </div>
              )}
          </aside>
      </div>
    </div>
  );
};

// --- Overlay ---

const BoxOverlay = ({ activeKeyframe, boxData, onUpdate }: any) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<{
        mode: 'move' | 'nw' | 'ne' | 'sw' | 'se';
        startX: number;
        startY: number;
        startBox: IncidentBox; // [t, ymin, xmin, ymax, xmax]
    } | null>(null);

    useEffect(() => {
        if (!dragState) return;

        const handleMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const dxPx = e.clientX - dragState.startX;
            const dyPx = e.clientY - dragState.startY;

            const dx = (dxPx / rect.width) * 1000;
            const dy = (dyPx / rect.height) * 1000;

            const [t, sYmin, sXmin, sYmax, sXmax] = dragState.startBox;
            let nYmin = sYmin, nXmin = sXmin, nYmax = sYmax, nXmax = sXmax;

            // Logic matching the mode
            if (dragState.mode === 'move') {
                nXmin += dx; nXmax += dx; nYmin += dy; nYmax += dy;
            } else if (dragState.mode === 'nw') {
                nXmin += dx; nYmin += dy;
            } else if (dragState.mode === 'ne') {
                nXmax += dx; nYmin += dy;
            } else if (dragState.mode === 'sw') {
                nXmin += dx; nYmax += dy;
            } else if (dragState.mode === 'se') {
                nXmax += dx; nYmax += dy;
            }

            // Normalization & Clamping
            const finalXmin = Math.min(nXmin, nXmax);
            const finalXmax = Math.max(nXmin, nXmax);
            const finalYmin = Math.min(nYmin, nYmax);
            const finalYmax = Math.max(nYmin, nYmax);

            const clampedBox: IncidentBox = [
                t,
                Math.max(0, Math.min(1000, finalYmin)),
                Math.max(0, Math.min(1000, finalXmin)),
                Math.max(0, Math.min(1000, finalYmax)),
                Math.max(0, Math.min(1000, finalXmax))
            ];
            
            onUpdate(activeKeyframe, clampedBox);
        };

        const handleUp = () => setDragState(null);

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState, activeKeyframe, onUpdate]);

    if (!boxData || !boxData[activeKeyframe]) return null;

    const [t, ymin, xmin, ymax, xmax] = boxData[activeKeyframe];
    
    // Convert 0-1000 to percentages
    const style = {
        top: `${ymin / 10}%`,
        left: `${xmin / 10}%`,
        width: `${(xmax - xmin) / 10}%`,
        height: `${(ymax - ymin) / 10}%`
    };

    const color = activeKeyframe === 0 ? 'rgb(59, 130, 246)' : 'rgb(168, 85, 247)';
    const bg = activeKeyframe === 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)';

    return (
        <div ref={containerRef} className="absolute inset-0 z-20 pointer-events-none">
             {/* Only the box interacts, background passes through */}
             <div 
                className="absolute border-2 pointer-events-auto cursor-move group touch-none"
                style={{ ...style, borderColor: color, backgroundColor: bg }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    setDragState({ mode: 'move', startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox });
                }}
             >
                {/* Label */}
                <div 
                    className="absolute -top-6 left-0 px-1.5 py-0.5 text-[10px] font-bold text-white rounded shadow-sm whitespace-nowrap"
                    style={{ backgroundColor: color }}
                >
                    {activeKeyframe === 0 ? "START" : "END"}
                </div>

                {/* Handles */}
                {/* NW */}
                <div 
                    className="absolute -top-2 -left-2 w-5 h-5 bg-white border-2 rounded-full cursor-nw-resize shadow-sm hover:scale-110 transition-transform"
                    style={{ borderColor: color }}
                    onMouseDown={(e) => {
                         e.stopPropagation();
                         setDragState({ mode: 'nw', startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox });
                    }}
                />
                {/* NE */}
                <div 
                    className="absolute -top-2 -right-2 w-5 h-5 bg-white border-2 rounded-full cursor-ne-resize shadow-sm hover:scale-110 transition-transform"
                    style={{ borderColor: color }}
                    onMouseDown={(e) => {
                         e.stopPropagation();
                         setDragState({ mode: 'ne', startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox });
                    }}
                />
                {/* SW */}
                <div 
                    className="absolute -bottom-2 -left-2 w-5 h-5 bg-white border-2 rounded-full cursor-sw-resize shadow-sm hover:scale-110 transition-transform"
                    style={{ borderColor: color }}
                    onMouseDown={(e) => {
                         e.stopPropagation();
                         setDragState({ mode: 'sw', startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox });
                    }}
                />
                {/* SE */}
                <div 
                    className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-2 rounded-full cursor-se-resize shadow-sm hover:scale-110 transition-transform"
                    style={{ borderColor: color }}
                    onMouseDown={(e) => {
                         e.stopPropagation();
                         setDragState({ mode: 'se', startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox });
                    }}
                />
             </div>
        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);