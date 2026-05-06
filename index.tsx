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
type SituationBox = [number, number, number, number, number];

interface SituationData {
  situation: number; // 0 or 1
  message_type: "DENM" | "none";
  cause_code: number | null;
  sub_cause_code: number | null;
  cause_text: string | null;
  sub_cause_text: string | null;
  box_2d: SituationBox[]; // Array of exactly 2 arrays if situation=1
  description: string;
}

interface DatasetItem {
  id: number;
  video: string;
  conversations: { from: string; value: string }[];
  _parsed?: SituationData; // Internal field for editing
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
  const [sidebarSearch, setSidebarSearch] = useState('');

  // Player
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);

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
                        situation: 0, message_type: 'none', 
                        cause_code: null, sub_cause_code: null, 
                        cause_text: null, sub_cause_text: null, 
                        box_2d: [], description: ""
                    };
                }
            } else {
                 item._parsed = {
                        situation: 0, message_type: 'none', 
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
                  { from: "human", value: `<image>\nAnalyze the traffic situation.` },
                  { from: "assistant", value: "" } // Will be filled on export
              ],
              _parsed: {
                  situation: 0, 
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

  const updateField = (key: keyof SituationData, value: any) => {
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
          if (key === 'situation') {
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
               if (value === null) {
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

  const updateBox = useCallback((idx: 0 | 1, newBox: SituationBox) => {
      setJsonData(prev => {
          if (selectedItemIndex === -1) return prev;
          const newData = [...prev];
          const item = { ...newData[selectedItemIndex] };
          if (!item._parsed) return prev;

          const parsed = { ...item._parsed };
          // Deep copy the box_2d array to avoid mutation
          parsed.box_2d = parsed.box_2d.map(box => [...box]) as SituationBox[];
          
          if (parsed.situation === 1 && parsed.box_2d.length === 2) {
               // Clamp AND Round values for schema compliance (integers 0-1000)
              const clamped: SituationBox = [
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
              situation, message_type, cause_code, sub_cause_code, 
              cause_text, sub_cause_text, box_2d, description 
          } = newItem._parsed || {};
          
          // Ensure correct schema typing for NULLs
          const cleanParsed: SituationData = {
              situation: situation || 0, 
              message_type: situation === 1 ? "DENM" : "none", 
              cause_code: situation === 1 ? (cause_code || null) : null, 
              sub_cause_code: situation === 1 ? (sub_cause_code || null) : null,
              cause_text: situation === 1 ? (cause_text || null) : null, 
              sub_cause_text: situation === 1 ? (sub_cause_text || null) : null, 
              box_2d: situation === 1 ? (box_2d || []) : [], 
              description: description || ""
          };

          const jsonStr = JSON.stringify(cleanParsed);

          // Update/Create Assistant Message
          if (!newItem.conversations || newItem.conversations.length === 0) {
              newItem.conversations = [
                  { from: "human", value: `<image>\nAnalyze the road scene frame(s) from the given traffic video and output a STRICT JSON object with ONLY these keys:\n- "situation": 1 if a real traffic situation/hazard is visible in the video, else 0.\n- "message_type": "DENM" if situation=1, else "none".\n- "cause_code": integer if situation=1, else null.\n- "sub_cause_code": integer if situation=1, else null.\n- "cause_text": string if situation=1, else null.\n- "sub_cause_text": string if situation=1, else null.\n- "box_2d": if situation=1, provide TWO spatiotemporal boxes for the main hazardous object:\n    [t_0, ymin_0, xmin_0, ymax_0, xmax_0],\n    [t_1, ymin_1, xmin_1, ymax_1, xmax_1]\n  where t is normalized 0-1 and coordinates are normalized to 0-1000 with (0,0) at top-left.\n  If situation=0, box_2d must be [].\n- "description": short factual description of the scene and the hazard (if any).\n\nRules:\n- Output JSON only (no extra text, no extra keys).\n- If situation=1 -> message_type MUST be "DENM", box_2d MUST contain exactly 2 entries.\n- If situation=0 -> message_type MUST be "none", all code/text fields MUST be null, and box_2d MUST be [].` },
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
          if (cleanParsed.situation === 1 && cleanParsed.cause_text) {
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

  // Clear stale playback state when the user navigates to a different item.
  // Kept separate so it never races with the videoNode remount below.
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setVideoError(null);
  }, [selectedItemIndex]);

  // Bind/unbind native video events whenever the DOM element changes.
  // Must NOT touch videoError here — the onError handler sets it after mount
  // and clearing it here would wipe it before the user sees it.
  useEffect(() => {
    if (!videoNode) return;

    const ut = () => setCurrentTime(videoNode.currentTime);
    const ud = () => setDuration(videoNode.duration);

    videoNode.addEventListener('timeupdate', ut);
    videoNode.addEventListener('loadedmetadata', ud);

    setCurrentTime(videoNode.currentTime);
    if (!isNaN(videoNode.duration)) setDuration(videoNode.duration);

    return () => {
        videoNode.removeEventListener('timeupdate', ut);
        videoNode.removeEventListener('loadedmetadata', ud);
    };
  }, [videoNode]);

  const seekTo = (t: number) => {
      if (videoNode) videoNode.currentTime = t;
  };

  const togglePlayback = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused || video.ended) {
          setVideoError(null);
          const playPromise = video.play();
          if (playPromise !== undefined) {
              playPromise.catch(() => {
                  setIsPlaying(false);
                  setVideoError('Playback failed. This browser may not support the video codec.');
              });
          }
      } else {
          video.pause();
      }
  }, []);

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
  if (parsed?.situation === 1 && parsed.cause_text) {
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
              <div className="px-2 py-2 border-b border-gray-800 shrink-0">
                  <input
                      type="text"
                      placeholder="Filter by filename…"
                      value={sidebarSearch}
                      onChange={e => setSidebarSearch(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-blue-500"
                  />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {jsonData.map((it, i) => {
                      if (sidebarSearch && !it.video?.toLowerCase().includes(sidebarSearch.toLowerCase())) return null;
                      return (
                          <div key={it.id || i}
                               onClick={() => setSelectedItemIndex(i)}
                               className={`px-4 py-3 border-b border-gray-800 cursor-pointer flex justify-between items-center transition-colors ${selectedItemIndex === i ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-gray-800'}`}>
                              <div className="text-xs font-mono text-gray-400 overflow-hidden whitespace-nowrap" title={it.video} style={{direction:'rtl', textOverflow:'ellipsis'}}>{it.video}</div>
                              {it._parsed?.situation === 1 && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                          </div>
                      );
                  })}
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
                                  key={videoUrl}
                                  ref={(el) => {
                                      videoRef.current = el;
                                      if (el !== videoNode) setVideoNode(el);
                                  }}
                                  src={videoUrl}
                                  crossOrigin={videoUrl.startsWith('http') ? "anonymous" : undefined}
                                  className="max-h-[calc(100vh-200px)] max-w-full shadow-lg block"
                                  onClick={togglePlayback}
                                  onPlay={() => setIsPlaying(true)}
                                  onPause={() => setIsPlaying(false)}
                                  onEnded={() => setIsPlaying(false)}
                                  onError={(e) => {
                                      const v = e.currentTarget;
                                      const code = v.error?.code;
                                      const msg: Record<number, string> = {
                                          1: 'Load aborted',
                                          2: 'Network error',
                                          3: 'Decode error — file may be corrupted',
                                          4: 'Unsupported format or codec',
                                      };
                                      setVideoError(msg[code ?? 0] ?? 'Unknown video error');
                                  }}
                               />
                               {videoError && (
                                   <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30">
                                       <div className="flex items-center gap-2 bg-red-900/80 border border-red-700 text-red-200 text-xs px-4 py-2 rounded-lg shadow">
                                           <AlertCircle className="w-4 h-4 shrink-0" />
                                           <span>{videoError}</span>
                                       </div>
                                   </div>
                               )}

                               {/* Ensure BoxOverlay only renders when videoNode is ready */}
                               {parsed && parsed.situation === 1 && parsed.box_2d.length === 2 && videoNode && (
                                   <BoxOverlay 
                                      activeKeyframe={activeKeyframe}
                                      boxData={parsed.box_2d}
                                      onUpdate={updateBox}
                                      onTogglePlay={togglePlayback}
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
                      <Button variant="ghost" onClick={togglePlayback}>
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
                  {parsed && parsed.situation === 1 && parsed.box_2d.length === 2 ? (
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
                                             const newBox: SituationBox = [s / duration, old[1], old[2], old[3], old[4]];
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
                                            const newBox = [...parsed.box_2d[activeKeyframe]] as SituationBox;
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
                          <Info className="w-4 h-4" /> Enable "Situation" in the sidebar to access the Spatiotemporal Editor.
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
                      
                      {/* Situation Toggle */}
                      <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
                          <span className="text-sm font-bold text-gray-200">Traffic Situation?</span>
                          <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800">
                              <button 
                                onClick={() => updateField('situation', 0)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${parsed.situation === 0 ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                NO
                              </button>
                              <button 
                                onClick={() => updateField('situation', 1)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${parsed.situation === 1 ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
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

                      {parsed.situation === 1 && (
                          <>
                              {/* Cause Code */}
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase">Cause Code</label>
                                  <select 
                                      className="w-full bg-gray-950 border border-gray-700 text-sm text-white rounded-md p-2.5 focus:border-blue-500 outline-none"
                                      value={parsed.cause_code ?? ""}
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
                                      value={parsed.sub_cause_code ?? ""}
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
    type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'draw';

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

    const startDrag = (e: React.PointerEvent, mode: DragMode) => {
        e.preventDefault();
        e.stopPropagation();
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startBox = [...boxData[activeKeyframe]] as SituationBox;
        const normalize = (val: number, dim: number) => (val / dim) * 1000;

        const updateFromPointer = (clientX: number, clientY: number) => {
            if (mode === 'draw') {
                const dx = clientX - startX;
                const dy = clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) < 3) return;

                const startXRel = normalize(startX - rect.left, rect.width);
                const startYRel = normalize(startY - rect.top, rect.height);
                const currXRel = normalize(clientX - rect.left, rect.width);
                const currYRel = normalize(clientY - rect.top, rect.height);

                onUpdate(activeKeyframe, [
                    startBox[0],
                    Math.max(0, Math.min(1000, Math.min(startYRel, currYRel))),
                    Math.max(0, Math.min(1000, Math.min(startXRel, currXRel))),
                    Math.max(0, Math.min(1000, Math.max(startYRel, currYRel))),
                    Math.max(0, Math.min(1000, Math.max(startXRel, currXRel)))
                ]);
                return;
            }

            const dx = ((clientX - startX) / rect.width) * 1000;
            const dy = ((clientY - startY) / rect.height) * 1000;
            const [t, sYmin, sXmin, sYmax, sXmax] = startBox;
            let nYmin = sYmin;
            let nXmin = sXmin;
            let nYmax = sYmax;
            let nXmax = sXmax;

            if (mode === 'move') {
                nXmin += dx; nXmax += dx; nYmin += dy; nYmax += dy;
            } else if (mode === 'nw') {
                nXmin += dx; nYmin += dy;
            } else if (mode === 'ne') {
                nXmax += dx; nYmin += dy;
            } else if (mode === 'sw') {
                nXmin += dx; nYmax += dy;
            } else if (mode === 'se') {
                nXmax += dx; nYmax += dy;
            } else if (mode === 'n') {
                nYmin += dy;
            } else if (mode === 's') {
                nYmax += dy;
            } else if (mode === 'w') {
                nXmin += dx;
            } else if (mode === 'e') {
                nXmax += dx;
            }

            const finalXmin = Math.min(nXmin, nXmax);
            const finalXmax = Math.max(nXmin, nXmax);
            const finalYmin = Math.min(nYmin, nYmax);
            const finalYmax = Math.max(nYmin, nYmax);

            onUpdate(activeKeyframe, [
                t,
                Math.max(0, Math.min(1000, finalYmin)),
                Math.max(0, Math.min(1000, finalXmin)),
                Math.max(0, Math.min(1000, finalYmax)),
                Math.max(0, Math.min(1000, finalXmax))
            ]);
        };

        const handleMove = (ev: PointerEvent) => {
            ev.preventDefault();
            updateFromPointer(ev.clientX, ev.clientY);
        };

        const handleUp = (ev: PointerEvent) => {
            ev.preventDefault();
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
            document.body.style.userSelect = '';

            if (mode === 'draw') {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) < 3 && onTogglePlay) {
                    onTogglePlay();
                }
            }
        };

        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // The window-level pointer listeners still keep the drag alive.
        }

        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);
    };

    const Handle = ({ mode, cursor, className }: { mode: any, cursor: string, className: string }) => (
        <div 
            className={`absolute w-14 h-14 flex items-center justify-center z-40 pointer-events-auto touch-none group/handle ${className}`}
            style={{ cursor }}
            onPointerDown={(e) => startDrag(e, mode)}
            title="Drag to resize"
        >
            {/* Visual hit area indicator on hover */}
            <div className="absolute inset-0 rounded-full group-hover/handle:bg-blue-500/10 transition-colors pointer-events-none" />
            <div 
                className="w-4 h-4 bg-white border-2 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.3)] group-hover/handle:scale-125 group-hover/handle:border-blue-400 transition-all duration-150 z-10 relative"
                style={{ borderColor: color }}
            />
        </div>
    );

    const EdgeZone = ({ mode, cursor, className }: { mode: DragMode, cursor: string, className: string }) => (
        <div
            className={`absolute z-30 pointer-events-auto touch-none ${className}`}
            style={{ cursor }}
            onPointerDown={(e) => startDrag(e, mode)}
            title="Drag to resize"
        />
    );

    return (
        <div 
            ref={containerRef} 
            className="absolute inset-0 z-20 cursor-crosshair touch-none select-none"
            onPointerDown={(e) => startDrag(e, 'draw')}
            title="Drag to draw a new box"
        >
             {/* Only the box interacts, background passes through */}
             <div 
                className="absolute border-2 pointer-events-auto cursor-move group touch-none shadow-[0_0_15px_rgba(37,99,235,0.5)] will-change-[top,left,width,height]"
                style={{ ...style, borderColor: color, backgroundColor: bg }}
                onPointerDown={(e) => startDrag(e, e.shiftKey ? 'draw' : 'move')}
                title="Drag to move. Shift-drag to redraw."
             >
                {/* Label */}
                <div 
                    className="absolute -top-6 left-0 px-1.5 py-0.5 text-[10px] font-bold text-white rounded shadow-sm whitespace-nowrap pointer-events-none"
                    style={{ backgroundColor: color }}
                >
                    {activeKeyframe === 0 ? "START" : "END"}
                </div>

                {/* Corner Handles */}
                <Handle mode="nw" cursor="nw-resize" className="-top-7 -left-7" />
                <Handle mode="ne" cursor="ne-resize" className="-top-7 -right-7" />
                <Handle mode="sw" cursor="sw-resize" className="-bottom-7 -left-7" />
                <Handle mode="se" cursor="se-resize" className="-bottom-7 -right-7" />

                {/* Edge Handles */}
                <EdgeZone mode="n" cursor="n-resize" className="-top-3 left-7 right-7 h-6" />
                <EdgeZone mode="s" cursor="s-resize" className="-bottom-3 left-7 right-7 h-6" />
                <EdgeZone mode="w" cursor="w-resize" className="top-7 bottom-7 -left-3 w-6" />
                <EdgeZone mode="e" cursor="e-resize" className="top-7 bottom-7 -right-3 w-6" />
                <Handle mode="n" cursor="n-resize" className="-top-7 left-1/2 -translate-x-1/2" />
                <Handle mode="s" cursor="s-resize" className="-bottom-7 left-1/2 -translate-x-1/2" />
                <Handle mode="w" cursor="w-resize" className="top-1/2 -translate-y-1/2 -left-7" />
                <Handle mode="e" cursor="e-resize" className="top-1/2 -translate-y-1/2 -right-7" />
             </div>
        </div>
    );
};

const container = document.getElementById('root')!;
const root = (window as any)._root || createRoot(container);
(window as any)._root = root;
root.render(<App />);
