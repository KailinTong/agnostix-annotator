import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Upload, Play, Pause, SkipBack, SkipForward, 
  CheckCircle, Box as BoxIcon, FileJson, Video as VideoIcon, 
  ChevronRight, Save, MousePointer2, Trash2, ArrowLeft,
  Clock, AlertTriangle, Info, Crosshair, Plus, Minus,
  HardDrive, RefreshCw, Folder, AlertCircle, Check, X, FilePlus,
  Maximize, Minimize, Tag, Edit3, Settings
} from 'lucide-react';

// --- DENM Data Model (Strictly based on QA_type_denm.json provided) ---
const DENM_MAPPING: any = {
  causeCodes: {
    "2": {
      "name": "accident",
      "subCauseCodes": {
        "7": "unsecured accident"
      }
    },
    "3": {
      "name": "roadworks",
      "subCauseCodes": {
        "2": "road marking work",
        "3": "slow moving road maintenance",
        "4": "short-term stationary roadworks"
      }
    },
    "6": {
      "name": "adverseWeatherCondition-adhesion",
      "subCauseCodes": {
        "0": "slippery road (generic)",
        "2": "fuel on road",
        "3": "mud on road",
        "5": "ice on road",
        "6": "black ice on road",
        "7": "oil on road",
        "8": "loose chippings"
      }
    },
    "9": {
      "name": "hazardousLocation-surfaceCondition",
      "subCauseCodes": {
        "0": "flooding",
        "5": "snow drifts"
      }
    },
    "10": {
      "name": "hazardousLocation-obstacleOnTheRoad",
      "subCauseCodes": {
        "0": "objects on the road",
        "1": "shed load",
        "4": "large objects",
        "5": "fallen trees"
      }
    },
    "11": {
      "name": "hazardousLocation-animalOnTheRoad",
      "subCauseCodes": {
        "0": "animals on roadway",
        "2": "herd of animals",
        "4": "large animals"
      }
    },
    "12": {
      "name": "humanPresenceOnTheRoad",
      "subCauseCodes": {
        "0": "people on roadway",
        "1": "children on roadway",
        "2": "cyclists on roadway"
      }
    },
    "14": {
      "name": "wrongWayDriving",
      "subCauseCodes": {
        "0": "wrong way driving"
      }
    },
    "15": {
      "name": "rescueAndRecoveryWorkInProgress",
      "subCauseCodes": {
        "0": "rescue and recovery work in progress"
      }
    },
    "17": {
      "name": "adverseWeatherCondition-ExtremeWeather",
      "subCauseCodes": {
        "1": "strong winds"
      }
    },
    "18": {
      "name": "adverseWeatherCondition-Visibility",
      "subCauseCodes": {
        "0": "visibility reduced (generic)",
        "1": "visibility reduced due to fog",
        "2": "visibility reduced due to smoke",
        "3": "visibility reduced due to heavy snowfall",
        "6": "visibility reduced due to low sun glare"
      }
    },
    "19": {
      "name": "adverseWeatherCondition-Precipitation",
      "subCauseCodes": {
        "1": "heavy rain",
        "2": "heavy snowfall"
      }
    },
    "94": {
      "name": "vehicleBreakdown",
      "subCauseCodes": {
        "2": "broken down vehicle"
      }
    }
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
    primary: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed",
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
            <div className="flex items-center bg-gray-900 rounded-lg border border-gray-700 overflow-hidden shadow-sm">
                <button 
                    className="w-6 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border-r border-gray-700 active:bg-gray-600"
                    onClick={() => onChange(value - 20)}
                    title="-20"
                ><Minus className="w-3 h-3" /></button>
                <input 
                    type="number" 
                    className="w-14 bg-gray-950 text-xs text-center outline-none font-mono py-1 appearance-none text-blue-200"
                    value={displayValue}
                    onChange={(e) => onChange(Number(e.target.value))}
                />
                <button 
                    className="w-6 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border-l border-gray-700 active:bg-gray-600"
                    onClick={() => onChange(value + 20)}
                    title="+20"
                ><Plus className="w-3 h-3" /></button>
            </div>
        </div>
    )
}

const TimeInput = ({ value, duration, onChange }: { value: number, duration: number, onChange: (v: number) => void }) => {
    const [inputValue, setInputValue] = useState(value.toFixed(2));

    useEffect(() => {
        setInputValue(value.toFixed(2));
    }, [value]);

    return (
        <input 
            type="number"
            step={0.01}
            min={0}
            max={duration}
            className="w-full bg-transparent text-xs font-mono text-blue-200 p-1 text-center outline-none"
            value={inputValue}
            onChange={(e) => {
                setInputValue(e.target.value);
                const s = parseFloat(e.target.value);
                if(!isNaN(s) && duration > 0) {
                    onChange(s);
                }
            }}
            onBlur={() => setInputValue(value.toFixed(2))}
        />
    );
}

// --- Main App Component ---

const App = () => {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonData, setJsonData] = useState<DatasetItem[]>([]);
  // videoFiles maps filename -> URL
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
  
    const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Persistence Key
    const STORAGE_KEY = 'denm_project_v1';

  // --- Persistence Logic ---

  // Load on Mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    
    if (savedData) {
        try {
            const { jsonData: savedJson, videoMap: savedMap } = JSON.parse(savedData);
            setJsonData(savedJson);
            // Restore persistent remote URLs (Drive links or generic URLs), but local blob URLs are invalid
            const newMap = new Map<string, string>();
            if (savedMap) {
                Object.entries(savedMap).forEach(([k, v]) => {
                    if (typeof v === 'string' && v.startsWith('http')) {
                        newMap.set(k, v as string);
                    }
                });
            }
            setVideoFiles(newMap);
        } catch (e) {
            console.error("Failed to restore session", e);
        }
    }
  }, []);

  // Save on Change
  useEffect(() => {
    if (jsonData.length === 0) return;
    
    const timeout = setTimeout(() => {
        // We only persist remote URLs, not blobs
        const persistentMap: Record<string, string> = {};
        videoFiles.forEach((v, k) => {
            if (v.startsWith('http')) persistentMap[k] = v;
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            jsonData: jsonData.map(item => {
                const { ...rest } = item;
                // Ensure we don't accidentally persist any DOM nodes or circular refs
                // that might have leaked into the object via [key: string]: any
                return Object.fromEntries(
                    Object.entries(rest).filter(([k, v]) => 
                        k !== 'videoNode' && 
                        typeof v !== 'function' && 
                        !(v instanceof HTMLElement)
                    )
                );
            }),
            videoMap: persistentMap
        }));
    }, 1000); // Debounce 1s

    return () => clearTimeout(timeout);
  }, [jsonData, videoFiles]);

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
            } else {
                 item._parsed = {
                        incident: 0, message_type: 'none', 
                        cause_code: null, sub_cause_code: null, 
                        cause_text: null, sub_cause_text: null, 
                        box_2d: [], description: ""
                    };
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

  const startWorkspace = () => {
      if (jsonData.length === 0 && videoFiles.size > 0) {
          // Auto-generate from videos
          const generated: DatasetItem[] = Array.from(videoFiles.keys()).map((fname, i) => ({
              id: i,
              video: fname as string,
              conversations: [
                  { from: "human", value: `<video>\nAnalyze the traffic situation.` },
                  { from: "assistant", value: "" } // Will be filled on export
              ],
              _parsed: {
                  incident: 0, 
                  message_type: "none", 
                  cause_code: null, 
                  sub_cause_code: null, 
                  cause_text: null, 
                  sub_cause_text: null, 
                  box_2d: [], 
                  description: ""
              }
          }));
          setJsonData(generated);
      }
      setSelectedItemIndex(0);
      setIsWorkspaceActive(true);
  };

  const updateMeta = (key: string, value: any) => {
      setJsonData(prev => {
          if (selectedItemIndex === -1) return prev;
          const newData = [...prev];
          // Use spread to create a new object reference
          newData[selectedItemIndex] = { ...newData[selectedItemIndex], [key]: value };
          return newData;
      });
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

  const updateBox = useCallback((idx: 0 | 1, newBox: IncidentBox) => {
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
  }, [selectedItemIndex]);

  const downloadJson = () => {
      // Serialize back to string
      const exportData = jsonData.map(item => {
          const newItem = { ...item };
          
          const { 
              incident, message_type, cause_code, sub_cause_code, 
              cause_text, sub_cause_text, box_2d, description 
          } = newItem._parsed || {};
          
          // Ensure correct schema typing for NULLs
          const cleanParsed: IncidentData = {
              incident: incident || 0, 
              message_type: incident === 1 ? "DENM" : "none", 
              cause_code: incident === 1 ? (cause_code || null) : null, 
              sub_cause_code: incident === 1 ? (sub_cause_code || null) : null,
              cause_text: incident === 1 ? (cause_text || null) : null, 
              sub_cause_text: incident === 1 ? (sub_cause_text || null) : null, 
              box_2d: incident === 1 ? (box_2d || []) : [], 
              description: description || ""
          };

          const jsonStr = JSON.stringify(cleanParsed);

          // Update/Create Assistant Message
          if (!newItem.conversations || newItem.conversations.length === 0) {
              newItem.conversations = [
                  { from: "human", value: `<video>\nAnalyze the road scene frame(s) from the given traffic video and output a STRICT JSON object with ONLY these keys:\n- "incident": 1 if a real traffic incident/hazard is visible in the video, else 0.\n- "message_type": "DENM" if incident=1, else "none".\n- "cause_code": integer if incident=1, else null.\n- "sub_cause_code": integer if incident=1, else null.\n- "cause_text": string if incident=1, else null.\n- "sub_cause_text": string if incident=1, else null.\n- "box_2d": if incident=1, provide TWO spatiotemporal boxes for the main hazardous object:\n    [t_0, ymin_0, xmin_0, ymax_0, xmax_0],\n    [t_1, ymin_1, xmin_1, ymax_1, xmax_1]\n  where t is normalized 0–1 and coordinates are normalized to 0–1000 with (0,0) at top-left.\n  If incident=0, box_2d must be [].\n- "description": short factual description of the scene and the hazard (if any).\n\nRules:\n- Output JSON only (no extra text, no extra keys).\n- If incident=1 → message_type MUST be "DENM", box_2d MUST contain exactly 2 entries, and the code/text MUST match the snippet above exactly.\n- If incident=0 → message_type MUST be "none\", all code/text fields MUST be null, and box_2d MUST be [].\n` },
                  { from: "assistant", value: jsonStr }
              ];
          } else {
              const assistantIdx = newItem.conversations.findIndex(c => c.from === 'assistant');
              if (assistantIdx !== -1) {
                  newItem.conversations = [...newItem.conversations];
                  newItem.conversations[assistantIdx] = {
                      ...newItem.conversations[assistantIdx],
                      value: jsonStr
                  };
              } else {
                  newItem.conversations = [...newItem.conversations, { from: "assistant", value: jsonStr }];
              }
          }
          
          // Update root 'type' field based on cause text
          if (cleanParsed.incident === 1 && cleanParsed.cause_text) {
              // Format: "accident - unsecured accident" (lowercase preferred based on examples)
              const cText = cleanParsed.cause_text.toLowerCase();
              const sText = cleanParsed.sub_cause_text ? cleanParsed.sub_cause_text.toLowerCase() : "";
              newItem.type = sText ? `${cText} - ${sText}` : cText;
          } else {
              newItem.type = "none";
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

  const clearSession = () => {
      if(confirm("Are you sure? This will delete saved progress.")) {
          localStorage.removeItem(STORAGE_KEY);
          setJsonData([]);
          setVideoFiles(new Map());
      }
  }

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
      const canStart = jsonData.length > 0 || videoFiles.size > 0;

      return (
          <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-8 font-sans">
              <div className="max-w-3xl w-full bg-gray-900 rounded-xl border border-gray-800 p-8 shadow-2xl">
                  
                  {/* Header */}
                  <div className="flex items-start justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            <span className="bg-blue-600/20 p-2 rounded-lg"><Info className="w-6 h-6 text-blue-500" /></span>
                            DENM Annotator
                        </h1>
                        <p className="text-gray-400">Strict schema validation & Autosave support</p>
                    </div>
                    {jsonData.length > 0 && (
                        <div className="flex items-center gap-4 bg-gray-800 p-2 rounded-lg border border-gray-700">
                             <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                                 <RefreshCw className="w-3 h-3" /> Session Restored
                             </span>
                             <div className="h-4 w-px bg-gray-700" />
                             <button onClick={clearSession} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                        </div>
                    )}
                  </div>

                  {/* Input Grid */}
                  <div className="space-y-6">
                      
                      {/* JSON Input */}
                      <label 
                        htmlFor="json-up"
                        className={`block border-2 border-dashed rounded-xl p-6 transition-colors relative cursor-pointer group ${isDragging === 'json' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-blue-500 hover:bg-gray-800/50'}`}
                        onDragOver={e => handleDrag(e, 'json')} onDragLeave={e => handleDrag(e, null)} onDrop={e => handleDrag(e, 'json')}
                      >
                          <input type="file" accept=".json" id="json-up" className="hidden" onChange={e => e.target.files?.[0] && processJsonFile(e.target.files[0])} />
                          
                          <div className="flex items-center gap-4 pointer-events-none">
                              <div className="bg-blue-500/10 p-3 rounded-full group-hover:bg-blue-500/20 transition-colors">
                                  <FileJson className="w-6 h-6 text-blue-500" />
                              </div>
                              <div className="flex-1">
                                  <h3 className="font-bold text-gray-200 group-hover:text-blue-200 transition-colors">1. Dataset JSON</h3>
                                  <p className="text-sm text-gray-500 group-hover:text-gray-400">
                                      {jsonFile ? jsonFile.name : (jsonData.length > 0 ? `${jsonData.length} items loaded from session` : "Drop .json file here (optional)")}
                                  </p>
                              </div>
                              <div className="bg-gray-700 text-gray-100 px-3 py-1.5 rounded text-sm font-medium transition-colors group-hover:bg-blue-600 group-hover:text-white">
                                  Select File
                              </div>
                          </div>
                      </label>

                      {/* Video Input */}
                      <div 
                        className={`border-2 border-dashed rounded-xl p-6 transition-colors cursor-pointer relative ${isDragging === 'video' ? 'border-purple-500 bg-purple-500/10' : 'border-gray-700 hover:border-purple-500 hover:bg-gray-800/50'}`}
                        onDragOver={e => handleDrag(e, 'video')} onDragLeave={e => handleDrag(e, null)} onDrop={e => handleDrag(e, 'video')}
                      >
                            <input type="file" accept="video/*" multiple className="hidden" id="vid-up" onChange={e => e.target.files && processVideoFiles(e.target.files)} />
                            <input 
                                type="file" 
                                // @ts-ignore
                                webkitdirectory=""
                                directory=""
                                className="hidden" 
                                id="dir-up" 
                                onChange={e => e.target.files && processVideoFiles(e.target.files)} 
                            />

                            <div className="flex items-center gap-4">
                                <div className="bg-purple-500/10 p-3 rounded-full">
                                    <VideoIcon className="w-6 h-6 text-purple-500" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-200">2. Video Files</h3>
                                    <p className="text-sm text-gray-500">
                                        {videoFiles.size > 0 ? `${videoFiles.size} videos ready` : "Drop videos or folder here"}
                                    </p>
                                    {jsonData.length > 0 && videoFiles.size === 0 && (
                                        <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> Please re-upload videos to resume
                                        </p>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <label htmlFor="dir-up" className="bg-gray-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer flex items-center gap-2">
                                        <Folder className="w-4 h-4" /> Folder
                                    </label>
                                    <div className="w-px h-6 bg-gray-600"></div>
                                    <label htmlFor="vid-up" className="bg-gray-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer flex items-center gap-2">
                                        <VideoIcon className="w-4 h-4" /> Files
                                    </label>
                                </div>
                            </div>
                       </div>

                  </div>
                  
                  <div className="mt-8 flex justify-end">
                      <Button onClick={startWorkspace} disabled={!canStart}>
                          {jsonData.length === 0 ? "Create New Dataset" : "Start Verifying"} <ChevronRight className="w-4 h-4" />
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

  // Compute Type Display
  let typeDisplay = "none";
  if (parsed?.incident === 1 && parsed.cause_text) {
      typeDisplay = parsed.cause_text;
      if (parsed.sub_cause_text) typeDisplay += ` - ${parsed.sub_cause_text}`;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-200 overflow-hidden font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0 z-20">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsWorkspaceActive(false)}>
              <ArrowLeft className="w-4 h-4" />
              <span className="font-bold text-sm">DENM Studio</span>
              <span className="text-xs text-gray-500">{jsonFile ? jsonFile.name : (jsonData.length > 0 ? "Existing Dataset" : "New Dataset")}</span>
              <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                  {videoUrl ? (videoUrl.startsWith('http') ? 'Remote' : 'Local') : 'No Video'}
              </span>
          </div>
          <Button onClick={downloadJson} variant="primary" className="h-8">
              <Save className="w-4 h-4" /> Export
          </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 z-10">
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {jsonData.map((it, i) => (
                      <div key={it.id || i} 
                           onClick={() => setSelectedItemIndex(i)}
                           className={`px-4 py-3 border-b border-gray-800 cursor-pointer flex justify-between items-center transition-colors ${selectedItemIndex === i ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-gray-800'}`}>
                          <div className="truncate text-xs font-mono text-gray-400">{it.video}</div>
                          {it._parsed?.incident === 1 && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                      </div>
                  ))}
              </div>
          </aside>

          {/* Main */}
          <main className="flex-1 bg-black flex flex-col relative">
               {/* Player */}
               <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black/50">
                   {videoUrl ? (
                       <div className="relative group max-h-full max-w-full flex items-center justify-center h-full">
                           <div className="relative">
                               <video 
                                  ref={(el) => {
                                      videoRef.current = el;
                                      // Update state only if changed to avoid loops, though strict equality handles this.
                                      if (el !== videoNode) setVideoNode(el);
                                  }}
                                  src={videoUrl} 
                                  // Drive videos might need controls to be manually forced if headers are strict
                                  crossOrigin={videoUrl.startsWith('http') ? "anonymous" : undefined}
                                  className="max-h-[calc(100vh-200px)] max-w-full shadow-lg block"
                                  onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}
                                  onPlay={() => setIsPlaying(true)}
                                  onPause={() => setIsPlaying(false)}
                                  // Handle errors for remote videos
                                  onError={(e) => console.log("Video Load Error", e)}
                               />

                               {/* Ensure BoxOverlay only renders when videoNode is ready */}
                               {parsed && parsed.incident === 1 && parsed.box_2d.length === 2 && videoNode && (
                                   <BoxOverlay 
                                      activeKeyframe={activeKeyframe}
                                      boxData={parsed.box_2d}
                                      onUpdate={updateBox}
                                      onTogglePlay={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}
                                   />
                               )}
                           </div>
                       </div>
                   ) : (
                       <div className="text-gray-600 flex flex-col items-center">
                           <VideoIcon className="w-12 h-12 mb-2 opacity-50" />
                           <p>No Video Source</p>
                           <p className="text-xs text-gray-500 mt-2">Upload files/folder to resume</p>
                       </div>
                   )}
               </div>

               {/* Toolbar */}
               <div className="bg-gray-900 border-t border-gray-800 shrink-0 flex flex-col z-20 shadow-[-5px_0_15px_rgba(0,0,0,0.5)]">
                  {/* Play Controls Row */}
                  <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800">
                      <Button variant="ghost" onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}>
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <div className="text-xs font-mono text-gray-400 min-w-[100px]">
                          {formatTime(currentTime)} / {formatTime(duration)}
                      </div>
                      <input 
                          type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
                          onChange={e => seekTo(Number(e.target.value))}
                          className="flex-1 accent-blue-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer hover:h-1.5 transition-all"
                      />
                  </div>
                  
                  {/* Spatiotemporal Editor Row */}
                  {parsed && parsed.incident === 1 && parsed.box_2d.length === 2 ? (
                      <div className="flex items-center gap-6 px-4 py-3 overflow-x-auto">
                          <div className="flex flex-col gap-0.5 min-w-max">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-none">Keyframe</span>
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-none">Editor</span>
                          </div>
                          
                          <div className="flex bg-gray-800 rounded-lg p-1 gap-1 border border-gray-700">
                              {[0, 1].map((idx) => {
                                  const t = parsed.box_2d[idx][0];
                                  const isActive = activeKeyframe === idx;
                                  return (
                                      <button key={idx} 
                                           className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors text-xs font-medium ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-700 text-gray-400'}`}
                                           onClick={() => { setActiveKeyframe(idx as 0|1); seekTo(t * duration); }}
                                      >
                                          <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-gray-500'}`} />
                                          <span className="whitespace-nowrap">{idx === 0 ? 'Start' : 'End'} <span className="opacity-60 font-mono font-normal">t={t.toFixed(4)}</span></span>
                                      </button>
                                  )
                              })}
                          </div>

                          <div className="h-8 w-px bg-gray-800" />

                          {/* Manual Time Input */}
                          <div className="flex flex-col gap-1 items-center">
                             <label className="text-[10px] uppercase font-bold text-gray-500">Time (s)</label>
                             <div className="flex items-center bg-gray-950 rounded-lg border border-gray-700 overflow-hidden w-20 shadow-sm">
                                <input 
                                    type="number"
                                    step={0.01}
                                    min={0}
                                    max={duration}
                                    className="w-full bg-transparent text-xs font-mono text-blue-200 p-1 text-center outline-none"
                                    value={(parsed.box_2d[activeKeyframe][0] * duration).toFixed(2)}
                                    onChange={(e) => {
                                        const s = parseFloat(e.target.value);
                                        if(!isNaN(s) && duration > 0) {
                                             const old = parsed.box_2d[activeKeyframe];
                                             const newBox: IncidentBox = [s / duration, old[1], old[2], old[3], old[4]];
                                             updateBox(activeKeyframe, newBox);
                                        }
                                    }}
                                />
                             </div>
                          </div>

                          <div className="h-8 w-px bg-gray-800" />

                          {/* Coordinate Controls */}
                          <div className="flex items-center gap-3">
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

                          <div className="flex-1" />

                          <Button variant="outline" className="text-xs h-8 whitespace-nowrap" 
                            onClick={() => {
                                // Sync time
                                const newT = duration > 0 ? currentTime / duration : 0;
                                const currentBox = parsed.box_2d[activeKeyframe];
                                updateBox(activeKeyframe, [newT, currentBox[1], currentBox[2], currentBox[3], currentBox[4]]);
                            }}>
                              <Clock className="w-3 h-3" /> Sync Time
                          </Button>
                      </div>
                  ) : (
                      <div className="flex items-center justify-center p-4 text-xs text-gray-500 gap-2 h-[88px]">
                          <Info className="w-4 h-4" /> Enable "Incident" in the sidebar to access the Spatiotemporal Editor.
                      </div>
                  )}
               </div>
          </main>

          {/* Inspector */}
          <aside className="w-96 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto shrink-0 z-10 shadow-[-5px_0_20px_rgba(0,0,0,0.2)]">
              {parsed ? (
                  <div className="p-6 space-y-6">

                      {/* Metadata Section */}
                      <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-800">
                              <Tag className="w-4 h-4 text-blue-500" />
                              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Metadata</h3>
                          </div>
                          
                          <div className="grid grid-cols-[1fr_2fr] gap-4">
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-gray-500 uppercase">ID</label>
                                 <input 
                                     type="number"
                                     className="w-full bg-gray-950 border border-gray-700 text-sm text-gray-200 rounded-md px-3 py-2 focus:border-blue-500 outline-none font-mono transition-colors"
                                     value={item.id}
                                     onChange={(e) => updateMeta('id', parseInt(e.target.value) || 0)}
                                 />
                             </div>
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-gray-500 uppercase">Sample ID</label>
                                 <input 
                                     type="text"
                                     className="w-full bg-gray-950 border border-gray-700 text-sm text-gray-200 rounded-md px-3 py-2 focus:border-blue-500 outline-none font-mono transition-colors"
                                     value={item.sample_id || ""}
                                     onChange={(e) => updateMeta('sample_id', e.target.value)}
                                     title={item.sample_id}
                                 />
                             </div>
                          </div>

                          <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-500 uppercase">Video Filename</label>
                               <input 
                                   type="text"
                                   className="w-full bg-gray-950 border border-gray-700 text-sm text-gray-300 rounded-md px-3 py-2 focus:border-blue-500 outline-none font-mono truncate transition-colors"
                                   value={item.video || ""}
                                   onChange={(e) => updateMeta('video', e.target.value)}
                                   title={item.video}
                               />
                          </div>

                          <div className="space-y-1">
                               <label className="text-[10px] font-bold text-gray-500 uppercase">Computed Type</label>
                               <input 
                                   disabled
                                   className="w-full bg-gray-800 border border-gray-700 text-sm text-gray-400 rounded-md px-3 py-2 font-mono"
                                   value={typeDisplay}
                               />
                          </div>
                      </div>
                      
                      <div className="h-px bg-gray-800" />
                      
                      {/* Incident Toggle */}
                      <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                          <span className="text-sm font-bold text-gray-200">Traffic Incident?</span>
                          <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800">
                              <button 
                                onClick={() => updateField('incident', 0)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${parsed.incident === 0 ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                NO
                              </button>
                              <button 
                                onClick={() => updateField('incident', 1)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${parsed.incident === 1 ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                YES
                              </button>
                          </div>
                      </div>

                      {/* Message Type Display */}
                      <div className="space-y-1">
                           <label className="text-[10px] font-bold text-gray-500 uppercase">Message Type</label>
                           <input 
                               disabled
                               className={`w-full text-sm font-bold font-mono py-2 px-3 rounded-md border ${parsed.message_type === 'DENM' ? 'bg-blue-900/10 border-blue-500/50 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                               value={parsed.message_type}
                           />
                      </div>

                      {parsed.incident === 1 && (
                          <>
                              {/* Cause Code */}
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Cause Code</label>
                                  <select 
                                      className="w-full bg-gray-950 border border-gray-700 text-sm text-white rounded-md p-2.5 focus:border-blue-500 outline-none"
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
                              </div>

                              {/* Sub Cause Code */}
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Sub Cause Code</label>
                                  <select 
                                      className="w-full bg-gray-950 border border-gray-700 text-sm text-white rounded-md p-2.5 focus:border-blue-500 outline-none"
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
                              </div>
                          </>
                      )}

                      {/* Description */}
                      <div className="space-y-2 flex-1 flex flex-col">
                          <label className="text-xs font-bold text-gray-500 uppercase">Description</label>
                          <textarea 
                              className="w-full flex-1 bg-gray-800/50 border border-gray-700 text-sm text-white rounded-md p-3 focus:border-blue-500 outline-none resize-none min-h-[120px]"
                              value={parsed.description || ""}
                              onChange={e => updateField('description', e.target.value)}
                              placeholder="Describe the scene and hazard..."
                          />
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

const BoxOverlay = ({ activeKeyframe, boxData, onUpdate, onTogglePlay }: any) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<{
        mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'draw';
        startX: number;
        startY: number;
        startBox: IncidentBox; // [t, ymin, xmin, ymax, xmax]
        rect: DOMRect;
    } | null>(null);

    useEffect(() => {
        if (!dragState) return;

        const handleMove = (e: MouseEvent) => {
            const rect = dragState.rect;
            if (rect.width === 0 || rect.height === 0) return;

            // Common normalization logic
            const normalize = (val: number, dim: number) => (val / dim) * 1000;
            
            if (dragState.mode === 'draw') {
                const dx = e.clientX - dragState.startX;
                const dy = e.clientY - dragState.startY;
                // Higher threshold to prevent accidental drawing when trying to click handles
                if (Math.sqrt(dx*dx + dy*dy) < 15) return;

                const startXRel = normalize(dragState.startX - rect.left, rect.width);
                const startYRel = normalize(dragState.startY - rect.top, rect.height);
                const currXRel = normalize(e.clientX - rect.left, rect.width);
                const currYRel = normalize(e.clientY - rect.top, rect.height);

                const nXmin = Math.min(startXRel, currXRel);
                const nXmax = Math.max(startXRel, currXRel);
                const nYmin = Math.min(startYRel, currYRel);
                const nYmax = Math.max(startYRel, currYRel);

                const clampedBox: IncidentBox = [
                    dragState.startBox[0], // Keep time
                    Math.max(0, Math.min(1000, nYmin)),
                    Math.max(0, Math.min(1000, nXmin)),
                    Math.max(0, Math.min(1000, nYmax)),
                    Math.max(0, Math.min(1000, nXmax))
                ];
                onUpdate(activeKeyframe, clampedBox);
                return;
            }

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
            } else if (dragState.mode === 'n') {
                nYmin += dy;
            } else if (dragState.mode === 's') {
                nYmax += dy;
            } else if (dragState.mode === 'w') {
                nXmin += dx;
            } else if (dragState.mode === 'e') {
                nXmax += dx;
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

        const handleUp = (e: MouseEvent) => {
            if (dragState.mode === 'draw') {
                const dist = Math.sqrt(
                    Math.pow(e.clientX - dragState.startX, 2) + 
                    Math.pow(e.clientY - dragState.startY, 2)
                );
                // If moved less than 5px, treat as click
                if (dist < 5 && onTogglePlay) {
                    onTogglePlay();
                }
            }
            setDragState(null);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState, activeKeyframe, onUpdate, onTogglePlay]);

    if (!boxData || !boxData[activeKeyframe]) return null;

    const [t, ymin, xmin, ymax, xmax] = boxData[activeKeyframe];
    
    // Convert 0-1000 to percentages
    const style = {
        top: `${ymin / 10}%`,
        left: `${xmin / 10}%`,
        width: `${(xmax - xmin) / 10}%`,
        height: `${(ymax - ymin) / 10}%`
    };

    const color = activeKeyframe === 0 ? 'rgb(37, 99, 235)' : 'rgb(37, 99, 235)'; // Both blue in screenshot for loop
    const bg = 'rgba(37, 99, 235, 0.2)';

    const Handle = ({ mode, cursor, className }: { mode: any, cursor: string, className: string }) => (
        <div 
            className={`absolute w-12 h-12 flex items-center justify-center z-30 pointer-events-auto group/handle ${className}`}
            style={{ cursor }}
            onMouseDown={(e) => {
                e.stopPropagation();
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                setDragState({ mode, startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox, rect });
            }}
        >
            {/* Visual hit area indicator on hover */}
            <div className="absolute inset-0 rounded-full group-hover/handle:bg-blue-500/10 transition-colors pointer-events-none" />
            <div 
                className="w-3.5 h-3.5 bg-white border-2 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.3)] group-hover/handle:scale-125 group-hover/handle:border-blue-400 transition-all duration-150 z-10 relative"
                style={{ borderColor: color }}
            />
        </div>
    );

    return (
        <div 
            ref={containerRef} 
            className="absolute inset-0 z-20 cursor-crosshair"
            onMouseDown={(e) => {
                // Start drawing
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                setDragState({ 
                    mode: 'draw', 
                    startX: e.clientX, 
                    startY: e.clientY, 
                    startBox: [...boxData[activeKeyframe]] as IncidentBox,
                    rect
                });
            }}
        >
             {/* Only the box interacts, background passes through */}
             <div 
                className="absolute border-2 pointer-events-auto cursor-move group touch-none shadow-[0_0_15px_rgba(37,99,235,0.5)] will-change-[top,left,width,height]"
                style={{ ...style, borderColor: color, backgroundColor: bg }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    if (!containerRef.current) return;
                    const rect = containerRef.current.getBoundingClientRect();
                    setDragState({ mode: 'move', startX: e.clientX, startY: e.clientY, startBox: [...boxData[activeKeyframe]] as IncidentBox, rect });
                }}
             >
                {/* Label */}
                <div 
                    className="absolute -top-6 left-0 px-1.5 py-0.5 text-[10px] font-bold text-white rounded shadow-sm whitespace-nowrap pointer-events-none"
                    style={{ backgroundColor: color }}
                >
                    {activeKeyframe === 0 ? "START" : "END"}
                </div>

                {/* Corner Handles */}
                <Handle mode="nw" cursor="nw-resize" className="-top-6 -left-6" />
                <Handle mode="ne" cursor="ne-resize" className="-top-6 -right-6" />
                <Handle mode="sw" cursor="sw-resize" className="-bottom-6 -left-6" />
                <Handle mode="se" cursor="se-resize" className="-bottom-6 -right-6" />

                {/* Edge Handles */}
                <Handle mode="n" cursor="n-resize" className="-top-6 left-1/2 -translate-x-1/2" />
                <Handle mode="s" cursor="s-resize" className="-bottom-6 left-1/2 -translate-x-1/2" />
                <Handle mode="w" cursor="w-resize" className="top-1/2 -translate-y-1/2 -left-6" />
                <Handle mode="e" cursor="e-resize" className="top-1/2 -translate-y-1/2 -right-6" />
             </div>
        </div>
    );
};

const container = document.getElementById('root')!;
const root = (window as any)._root || createRoot(container);
(window as any)._root = root;
root.render(<App />);
