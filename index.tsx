import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  id: number | string;
  video: string;
  conversations: { from: string; value: string }[];
  _parsed?: SituationData; // Internal field for editing
  [key: string]: any;
}

interface TrashedItem {
  deletedAt: string;
  item: DatasetItem;
}

interface AutosaveSnapshot {
  jsonData: DatasetItem[];
  trashData: TrashedItem[];
  videoMap: Record<string, string>;
  savedAt: string;
}

const AUTOSAVE_DB_NAME = 'denm_annotator_autosave';
const AUTOSAVE_STORE_NAME = 'snapshots';

const openAutosaveDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(AUTOSAVE_DB_NAME, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
      db.createObjectStore(AUTOSAVE_STORE_NAME);
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const readAutosaveSnapshot = async (key: string): Promise<AutosaveSnapshot | null> => {
  const db = await openAutosaveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readonly');
    const req = tx.objectStore(AUTOSAVE_STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as AutosaveSnapshot | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
};

const writeAutosaveSnapshot = async (key: string, snapshot: AutosaveSnapshot) => {
  const db = await openAutosaveDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
    tx.objectStore(AUTOSAVE_STORE_NAME).put(snapshot, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const deleteAutosaveSnapshot = async (key: string) => {
  const db = await openAutosaveDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
    tx.objectStore(AUTOSAVE_STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

// --- Helper Functions ---

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const normalizeClipDuration = (rawDuration: number) => {
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) return 0;
  // The TUMTraffic clips are intended to be 5s. Browsers may report values like
  // 5.03/5.07 because of MP4 time bases, frame boundaries, or non-zero PTS.
  return rawDuration >= 4.95 && rawDuration <= 5.2 ? 5 : rawDuration;
};

const nextExportFilename = (inputName?: string | null) => {
  const fallbackName = 'annotated_dataset.json';
  const originalName = inputName || fallbackName;
  const dotIndex = originalName.lastIndexOf('.');
  const ext = dotIndex > 0 ? originalName.slice(dotIndex) : '.json';
  let base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;

  // Old exports used to repeatedly add annotated_. Collapse those prefixes so
  // names do not grow like annotated_annotated_....json.
  base = base.replace(/^(annotated_)+/i, '');

  const numbered = base.match(/^(.*?)(?:_)(\d+)$/);
  if (numbered) {
      return `${numbered[1]}_${Number(numbered[2]) + 1}${ext}`;
  }
  return `${base}_1${ext}`;
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
  const [trashData, setTrashData] = useState<TrashedItem[]>([]);
  // videoFiles maps filename -> File for local uploads, or URL for persistent remote videos.
  // Local blob URLs are created lazily only for the selected video to avoid holding
  // thousands of object URLs in memory when a large folder is loaded.
  const [videoFiles, setVideoFiles] = useState<Map<string, File | string>>(new Map());
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | undefined>(undefined);
  const [isWorkspaceActive, setIsWorkspaceActive] = useState(false);
  const [isDragging, setIsDragging] = useState<'json' | 'video' | null>(null);
  
  // Selection
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1);
  const [activeKeyframe, setActiveKeyframe] = useState<0 | 1>(0); // 0 = Start Frame, 1 = End Frame
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(600);
  const listViewportRef = useRef<HTMLDivElement | null>(null);

  // Player
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);

    const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isScrubbingRef = useRef(false);
    const resumeAfterScrubRef = useRef(false);
    const currentTimeRef = useRef(0);
    const durationRef = useRef(0);
    const rawDurationRef = useRef(0);
    const scrubberRef = useRef<HTMLInputElement | null>(null);
    const timeDisplayRef = useRef<HTMLDivElement | null>(null);

    // Persistence Key
    const STORAGE_KEY = 'denm_project_v1';

  // --- Persistence Logic ---

  // Load on Mount
  useEffect(() => {
    const restoreVideoMap = (savedMap: unknown) => {
        const newMap = new Map<string, File | string>();
        if (savedMap && typeof savedMap === 'object') {
            Object.entries(savedMap as Record<string, unknown>).forEach(([k, v]) => {
                if (typeof v === 'string' && v.startsWith('http')) {
                    newMap.set(k, v);
                }
            });
        }
        setVideoFiles(newMap);
    };

    const savedData = localStorage.getItem(STORAGE_KEY);
    
    if (savedData) {
        try {
            const { jsonData: savedJson, videoMap: savedMap } = JSON.parse(savedData);
            setJsonData(savedJson);
            // Restore persistent remote URLs (Drive links or generic URLs), but local blob URLs are invalid
            restoreVideoMap(savedMap);
        } catch (e) {
            console.error("Failed to restore session", e);
        }
    }

    const savedTrash = localStorage.getItem(`${STORAGE_KEY}_trash`);
    if (savedTrash) {
        try {
            setTrashData(JSON.parse(savedTrash));
        } catch (e) {
            console.error("Failed to restore trash", e);
        }
    }

    let cancelled = false;
    readAutosaveSnapshot(STORAGE_KEY).then(snapshot => {
        if (cancelled || !snapshot) return;
        setJsonData(snapshot.jsonData || []);
        setTrashData(snapshot.trashData || []);
        restoreVideoMap(snapshot.videoMap);
    }).catch(e => console.warn('Failed to restore IndexedDB autosave', e));

    return () => { cancelled = true; };
  }, []);

  // Save on Change
  useEffect(() => {
    if (jsonData.length === 0 && trashData.length === 0) return;
    
    const timeout = setTimeout(() => {
        // We only persist remote URLs, not blobs
        const persistentMap: Record<string, string> = {};
        videoFiles.forEach((v, k) => {
            if (typeof v === 'string' && v.startsWith('http')) persistentMap[k] = v;
        });

        const sanitizedJsonData = jsonData.map(item => {
            const { ...rest } = item;
            // Ensure we don't accidentally persist any DOM nodes or circular refs
            // that might have leaked into the object via [key: string]: any
            return Object.fromEntries(
                Object.entries(rest).filter(([k, v]) =>
                    k !== 'videoNode' &&
                    typeof v !== 'function' &&
                    !(v instanceof HTMLElement)
                )
            ) as DatasetItem;
        });

        const snapshot: AutosaveSnapshot = {
            jsonData: sanitizedJsonData,
            trashData,
            videoMap: persistentMap,
            savedAt: new Date().toISOString(),
        };

        writeAutosaveSnapshot(STORAGE_KEY, snapshot)
            .catch(err => console.warn('IndexedDB autosave failed', err));

        try {
            const smallSnapshot = JSON.stringify({ jsonData: sanitizedJsonData, videoMap: persistentMap });
            if (smallSnapshot.length < 4_000_000) {
                localStorage.setItem(STORAGE_KEY, smallSnapshot);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
            localStorage.setItem(`${STORAGE_KEY}_trash`, JSON.stringify(trashData));
        } catch (err) {
            localStorage.removeItem(STORAGE_KEY);
            console.warn('localStorage autosave skipped; IndexedDB autosave is used instead.', err);
        }
    }, 1000); // Debounce 1s

    return () => clearTimeout(timeout);
  }, [jsonData, videoFiles, trashData]);

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
           newMap.set(file.name, file);
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
      setSelectedItemIndex(visibleItemIndexes[0] ?? 0);
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
              situation: situation ?? 0,
              message_type: situation === 1 ? "DENM" : "none", 
              cause_code: situation === 1 ? (cause_code ?? null) : null,
              sub_cause_code: situation === 1 ? (sub_cause_code ?? null) : null,
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
      a.download = nextExportFilename(jsonFile?.name);
      a.click();
  };

  const clearSession = () => {
      if(confirm("Are you sure? This will delete saved progress.")) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(`${STORAGE_KEY}_trash`);
          deleteAutosaveSnapshot(STORAGE_KEY).catch(e => console.warn('Failed to clear IndexedDB autosave', e));
          setJsonData([]);
          setTrashData([]);
          setVideoFiles(new Map());
      }
  }

  const deleteDatasetItem = useCallback((index: number) => {
      const item = jsonData[index];
      if (!item) return;

      const ok = confirm(
          `Delete this item?\n\n${item.video || item.video_filename || item.id}\n\nThis will remove it from the current dataset and move it into the app trash. Browsers cannot move or delete the original file on disk from its source folder.`
      );
      if (!ok) return;

      setTrashData(prev => [{ deletedAt: new Date().toISOString(), item }, ...prev]);
      setJsonData(prev => {
          const next = prev.filter((_, i) => i !== index);
          if (selectedItemIndex === index) {
              setSelectedItemIndex(next.length === 0 ? -1 : Math.min(index, next.length - 1));
          } else if (selectedItemIndex > index) {
              setSelectedItemIndex(selectedItemIndex - 1);
          }
          return next;
      });

      const itemVideo = item.video || item.video_filename;
      if (itemVideo) {
          setVideoFiles(prev => {
              const remaining = jsonData.some((other, i) => {
                  if (i === index) return false;
                  return other.video === itemVideo || other.video_filename === itemVideo;
              });
              if (remaining) return prev;

              const next = new Map(prev);
              next.delete(itemVideo);
              next.delete(itemVideo.split('/').pop()!);
              return next;
          });
      }
  }, [jsonData, selectedItemIndex]);

  const beginResizeSidebar = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMove = (ev: PointerEvent) => {
          const nextWidth = Math.max(220, Math.min(520, startWidth + ev.clientX - startX));
          setSidebarWidth(nextWidth);
      };

      const handleUp = () => {
          window.removeEventListener('pointermove', handleMove);
          window.removeEventListener('pointerup', handleUp);
          window.removeEventListener('pointercancel', handleUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
  };

  // --- Video Logic ---

  const updatePlaybackChrome = useCallback((time: number, total = durationRef.current) => {
      if (timeDisplayRef.current) {
          timeDisplayRef.current.textContent = `${formatTime(time)} / ${formatTime(total)}`;
      }
      if (scrubberRef.current) {
          scrubberRef.current.value = String(time);
      }
  }, []);

  const mediaTimeToDisplayTime = useCallback((mediaTime: number) => {
      const normalizedDuration = durationRef.current;
      if (normalizedDuration === 5 && rawDurationRef.current !== 5 && mediaTime >= 0 && mediaTime <= 0.16) {
          return 0;
      }
      return Math.max(0, Math.min(normalizedDuration || mediaTime, mediaTime));
  }, []);

  // Clear stale playback state when the user navigates to a different item.
  // Kept separate so it never races with the videoNode remount below.
  useEffect(() => {
    isScrubbingRef.current = false;
    resumeAfterScrubRef.current = false;
    currentTimeRef.current = 0;
    durationRef.current = 0;
    rawDurationRef.current = 0;
    setCurrentTime(0);
    setScrubTime(0);
    setIsScrubbing(false);
    setDuration(0);
    setIsPlaying(false);
    setVideoError(null);
    updatePlaybackChrome(0, 0);
  }, [selectedItemIndex]);

  // Bind/unbind native video events whenever the DOM element changes.
  // Must NOT touch videoError here — the onError handler sets it after mount
  // and clearing it here would wipe it before the user sees it.
  useEffect(() => {
    if (!videoNode) return;

    const ut = () => {
        if (isScrubbingRef.current) return;
        const displayTime = mediaTimeToDisplayTime(videoNode.currentTime);
        currentTimeRef.current = displayTime;
        updatePlaybackChrome(displayTime);
    };
    const ud = () => {
        if (isNaN(videoNode.duration)) return;
        const normalizedDuration = normalizeClipDuration(videoNode.duration);
        rawDurationRef.current = videoNode.duration;
        durationRef.current = normalizedDuration;
        setDuration(normalizedDuration);
        if (scrubberRef.current) scrubberRef.current.max = String(normalizedDuration);
        updatePlaybackChrome(mediaTimeToDisplayTime(videoNode.currentTime), normalizedDuration);
    };

    videoNode.addEventListener('timeupdate', ut);
    videoNode.addEventListener('loadedmetadata', ud);

    currentTimeRef.current = mediaTimeToDisplayTime(videoNode.currentTime);
    setCurrentTime(currentTimeRef.current);
    updatePlaybackChrome(currentTimeRef.current);
    if (!isNaN(videoNode.duration)) {
        const normalizedDuration = normalizeClipDuration(videoNode.duration);
        rawDurationRef.current = videoNode.duration;
        durationRef.current = normalizedDuration;
        setDuration(normalizedDuration);
        if (scrubberRef.current) scrubberRef.current.max = String(normalizedDuration);
        const displayTime = mediaTimeToDisplayTime(videoNode.currentTime);
        currentTimeRef.current = displayTime;
        setCurrentTime(displayTime);
        updatePlaybackChrome(displayTime, normalizedDuration);
    }

    return () => {
        videoNode.removeEventListener('timeupdate', ut);
        videoNode.removeEventListener('loadedmetadata', ud);
    };
  }, [videoNode, updatePlaybackChrome, mediaTimeToDisplayTime]);

  const clampTime = useCallback((t: number) => {
      const max = duration > 0 && Number.isFinite(duration) ? duration : t;
      return Math.max(0, Math.min(max, t));
  }, [duration]);

  const seekVideoNow = useCallback((t: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = t;
  }, []);

  const seekTo = useCallback((t: number) => {
      const safeTime = clampTime(t);
      currentTimeRef.current = safeTime;
      setCurrentTime(safeTime);
      setScrubTime(safeTime);
      updatePlaybackChrome(safeTime);
      seekVideoNow(safeTime);
  }, [clampTime, seekVideoNow, updatePlaybackChrome]);

  const getScrubTimeFromPointer = (input: HTMLInputElement, clientX: number) => {
      const rect = input.getBoundingClientRect();
      if (rect.width <= 0) return currentTimeRef.current;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * (durationRef.current || duration || 0);
  };

  const beginScrub = (e: React.PointerEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      resumeAfterScrubRef.current = Boolean(video && !video.paused && !video.ended);
      if (video && !video.paused) video.pause();
      isScrubbingRef.current = true;
      setIsScrubbing(true);
      const nextTime = getScrubTimeFromPointer(e.currentTarget, e.clientX);
      setScrubTime(nextTime);
      updateScrub(nextTime);
  };

  const updateScrub = (t: number) => {
      const safeTime = clampTime(t);
      currentTimeRef.current = safeTime;
      updatePlaybackChrome(safeTime);
      seekVideoNow(safeTime);

      if (!isScrubbingRef.current) {
          setCurrentTime(safeTime);
          setScrubTime(safeTime);
      }
  };

  const commitScrub = (t = scrubTime) => {
      if (!isScrubbingRef.current) return;
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      seekTo(t);
      if (resumeAfterScrubRef.current) {
          resumeAfterScrubRef.current = false;
          videoRef.current?.play().catch(() => setIsPlaying(false));
      }
  };

  const handleScrubKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (duration <= 0) return;

      let nextTime: number | null = null;
      const baseTime = isScrubbingRef.current ? scrubTime : currentTimeRef.current;
      const step = e.shiftKey ? 5 : 1;

      if (e.key === 'ArrowLeft') {
          nextTime = baseTime - step;
      } else if (e.key === 'ArrowRight') {
          nextTime = baseTime + step;
      } else if (e.key === 'Home') {
          nextTime = 0;
      } else if (e.key === 'End') {
          nextTime = duration;
      } else if (e.key === ' ') {
          e.preventDefault();
          togglePlayback();
          return;
      }

      if (nextTime === null) return;

      e.preventDefault();
      seekTo(nextTime);
  };

  // When local videos are loaded, keep the workspace focused on dataset rows
  // that can actually be reviewed. The complete dataset remains in jsonData
  // and is still included in exports.
  const visibleItemIndexes = useMemo(() => {
      const search = sidebarSearch.trim().toLowerCase();
      return jsonData.reduce<number[]>((indexes, it, i) => {
          const videoName = it.video || it.video_filename || '';
          const basename = videoName.split('/').pop() || videoName;
          const hasVideo = videoFiles.size === 0 || videoFiles.has(videoName) || videoFiles.has(basename);
          const matchesSearch = !search || videoName.toLowerCase().includes(search);
          if (hasVideo && matchesSearch) indexes.push(i);
          return indexes;
      }, []);
  }, [jsonData, sidebarSearch, videoFiles]);

  const LIST_ROW_HEIGHT = 52;
  const LIST_OVERSCAN = 8;
  const virtualList = useMemo(() => {
      const start = Math.max(0, Math.floor(listScrollTop / LIST_ROW_HEIGHT) - LIST_OVERSCAN);
      const count = Math.ceil(listViewportHeight / LIST_ROW_HEIGHT) + LIST_OVERSCAN * 2;
      return {
          start,
          indexes: visibleItemIndexes.slice(start, start + count),
          totalHeight: visibleItemIndexes.length * LIST_ROW_HEIGHT,
      };
  }, [visibleItemIndexes, listScrollTop, listViewportHeight]);

  useEffect(() => {
      const viewport = listViewportRef.current;
      if (!viewport) return;
      const updateHeight = () => setListViewportHeight(viewport.clientHeight);
      updateHeight();
      const observer = new ResizeObserver(updateHeight);
      observer.observe(viewport);
      return () => observer.disconnect();
  }, [isWorkspaceActive]);

  useEffect(() => {
      const viewport = listViewportRef.current;
      const position = visibleItemIndexes.indexOf(selectedItemIndex);
      if (!viewport || position < 0) return;
      const rowTop = position * LIST_ROW_HEIGHT;
      const rowBottom = rowTop + LIST_ROW_HEIGHT;
      if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
      else if (rowBottom > viewport.scrollTop + viewport.clientHeight) {
          viewport.scrollTop = rowBottom - viewport.clientHeight;
      }
  }, [selectedItemIndex, visibleItemIndexes]);

  useEffect(() => {
      if (!isWorkspaceActive) return;

      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement | null;
          const tagName = target?.tagName;
          const inputType = target instanceof HTMLInputElement ? target.type : '';
          const isEditingText =
              (tagName === 'INPUT' && inputType !== 'range') ||
              tagName === 'TEXTAREA' ||
              tagName === 'SELECT' ||
              target?.isContentEditable;

          if (isEditingText) return;

          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (selectedItemIndex === -1) return;
              e.preventDefault();
              deleteDatasetItem(selectedItemIndex);
              return;
          }

          if (e.key === ' ') {
              e.preventDefault();
              const video = videoRef.current;
              if (!video) return;

              if (video.paused || video.ended) {
                  video.play().catch(() => setIsPlaying(false));
              } else {
                  video.pause();
              }
              return;
          }

          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              if (visibleItemIndexes.length === 0) return;

              const currentVisibleIndex = visibleItemIndexes.indexOf(selectedItemIndex);
              const fallbackIndex = e.key === 'ArrowDown' ? -1 : 0;
              const baseIndex = currentVisibleIndex === -1 ? fallbackIndex : currentVisibleIndex;
              const nextVisibleIndex = e.key === 'ArrowDown'
                  ? Math.min(baseIndex + 1, visibleItemIndexes.length - 1)
                  : Math.max(baseIndex - 1, 0);

              e.preventDefault();
              setSelectedItemIndex(visibleItemIndexes[nextVisibleIndex]);
              return;
          }

          if (duration <= 0) return;

          let nextTime: number | null = null;
          const step = e.shiftKey ? 5 : 1;

          if (e.key === 'ArrowLeft') {
              nextTime = currentTimeRef.current - step;
          } else if (e.key === 'ArrowRight') {
              nextTime = currentTimeRef.current + step;
          } else if (e.key === 'Home') {
              nextTime = 0;
          } else if (e.key === 'End') {
              nextTime = duration;
          }

          if (nextTime === null) return;

          e.preventDefault();
          seekTo(nextTime);
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWorkspaceActive, duration, seekTo, visibleItemIndexes, selectedItemIndex, deleteDatasetItem]);

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

  const selectedItem = selectedItemIndex >= 0 ? jsonData[selectedItemIndex] : undefined;
  const selectedVideoSource = useMemo<File | string | undefined>(() => {
      if (!selectedItem) return undefined;
      const candidates = [selectedItem.video, selectedItem.video_filename].filter(Boolean) as string[];
      for (const candidate of candidates) {
          const basename = candidate.split('/').pop() || candidate;
          const source = videoFiles.get(candidate) || videoFiles.get(basename);
          if (source) return source;
      }
      return undefined;
  }, [selectedItem, videoFiles]);

  useEffect(() => {
      setVideoError(null);
      setIsPlaying(false);
      currentTimeRef.current = 0;
      rawDurationRef.current = 0;
      setCurrentTime(0);
      setScrubTime(0);
      updatePlaybackChrome(0);

      if (!selectedVideoSource) {
          setActiveVideoUrl(undefined);
          return;
      }

      if (typeof selectedVideoSource === 'string') {
          setActiveVideoUrl(selectedVideoSource);
          return;
      }

      const objectUrl = URL.createObjectURL(selectedVideoSource);
      setActiveVideoUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
  }, [selectedVideoSource, updatePlaybackChrome]);

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

  const item = selectedItem;
  const parsed = item?._parsed;
  const videoUrl = activeVideoUrl;

  // Compute Type Display
  let typeDisplay = "none";
  if (parsed?.situation === 1 && parsed.cause_text) {
      typeDisplay = parsed.cause_text;
      if (parsed.sub_cause_text) typeDisplay += ` - ${parsed.sub_cause_text}`;
  }
  const sampleIdDisplay = item
      ? String(item.sample_id ?? item.sampleId ?? item.simple_id ?? item.simpleId ?? item.segment_index ?? '')
      : '';
  const displayTime = isScrubbing ? scrubTime : currentTime;
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
              {trashData.length > 0 && (
                  <span className="text-xs bg-red-950/60 border border-red-900 px-2 py-0.5 rounded text-red-200">
                      Trash {trashData.length}
                  </span>
              )}
          </div>
          <Button onClick={downloadJson} variant="primary" className="h-8">
              <Save className="w-4 h-4" /> Export
          </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <aside
              className="bg-gray-900 border-r border-gray-800 flex flex-col shrink-0 z-10"
              style={{ width: sidebarWidth }}
          >
              <div className="px-2 py-2 border-b border-gray-800 shrink-0">
                  <input
                      type="text"
                      placeholder="Filter by filename…"
                      value={sidebarSearch}
                      onChange={e => {
                          setSidebarSearch(e.target.value);
                          setListScrollTop(0);
                          if (listViewportRef.current) listViewportRef.current.scrollTop = 0;
                      }}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 outline-none focus:border-blue-500"
                  />
              </div>
              <div
                  ref={listViewportRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
                  onScroll={(e) => setListScrollTop(e.currentTarget.scrollTop)}
              >
                <div className="relative" style={{ height: virtualList.totalHeight }}>
                  {virtualList.indexes.map((i, offset) => {
                      const it = jsonData[i];
                      return (
                          <div key={it.id || i}
                               onClick={() => setSelectedItemIndex(i)}
                               className={`absolute left-0 right-0 px-3 border-b border-gray-800 cursor-pointer flex items-center gap-2 transition-colors ${selectedItemIndex === i ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-gray-800'}`}
                               style={{ top: (virtualList.start + offset) * LIST_ROW_HEIGHT, height: LIST_ROW_HEIGHT }}>
                              <div
                                  className="flex-1 min-w-0 text-xs font-mono text-gray-400 overflow-hidden whitespace-nowrap truncate"
                                  title={it.video}
                              >
                                  {it.video}
                              </div>
                              {it._parsed?.situation === 1 && <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />}
                              <button
                                  className="w-7 h-7 rounded flex items-center justify-center text-gray-500 hover:text-red-200 hover:bg-red-900/40 shrink-0"
                                  title="Move item to trash"
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      deleteDatasetItem(i);
                                  }}
                              >
                                  <Trash2 className="w-3.5 h-3.5" />
                              </button>
                          </div>
                      );
                  })}
                </div>
              </div>
          </aside>
          <div
              className="w-1.5 shrink-0 cursor-col-resize bg-gray-900 hover:bg-blue-600 active:bg-blue-500 transition-colors z-20"
              onPointerDown={beginResizeSidebar}
              title="Drag to resize the video list"
          />

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
                      <div ref={timeDisplayRef} className="text-xs font-mono text-gray-400 min-w-[100px]">
                          {formatTime(displayTime)} / {formatTime(duration)}
                      </div>
                      <div className="flex-1 h-8 flex items-center px-1 cursor-pointer">
                          <input 
                              ref={scrubberRef}
                              type="range" min={0} max={duration || 100} step={0.01} defaultValue={displayTime}
                              onPointerDown={beginScrub}
                              onPointerUp={e => commitScrub(Number(e.currentTarget.value))}
                              onPointerCancel={e => commitScrub(Number(e.currentTarget.value))}
                              onBlur={e => commitScrub(Number(e.currentTarget.value))}
                              onKeyDown={handleScrubKeyDown}
                              onKeyUp={e => commitScrub(Number(e.currentTarget.value))}
                              onInput={e => updateScrub(Number(e.currentTarget.value))}
                              className="video-scrubber w-full cursor-pointer accent-blue-500"
                          />
                      </div>
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
                                const newT = duration > 0 ? currentTimeRef.current / duration : 0;
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
                                     type="text"
                                     className="w-full bg-gray-950 border border-gray-700 text-sm text-gray-200 rounded-md px-3 py-2 focus:border-blue-500 outline-none font-mono transition-colors"
                                     value={item.id ?? ''}
                                     onChange={(e) => updateMeta('id', e.target.value)}
                                 />
                             </div>
                             <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-gray-500 uppercase">Sample ID</label>
                                 <input 
                                     type="text"
                                     className="w-full bg-gray-950 border border-gray-700 text-sm text-gray-200 rounded-md px-3 py-2 focus:border-blue-500 outline-none font-mono transition-colors"
                                     value={sampleIdDisplay}
                                     onChange={(e) => updateMeta('sample_id', e.target.value)}
                                     title={sampleIdDisplay}
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
    const sourceBox = boxData?.[activeKeyframe] as SituationBox | undefined;
    const [draftBox, setDraftBox] = useState<SituationBox>(() => sourceBox ? [...sourceBox] as SituationBox : [0, 0, 0, 0, 0]);
    const draftBoxRef = useRef<SituationBox>(draftBox);
    const isDraggingRef = useRef(false);
    type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'draw';

    useEffect(() => {
        if (!sourceBox || isDraggingRef.current) return;
        const next = [...sourceBox] as SituationBox;
        draftBoxRef.current = next;
        setDraftBox(next);
    }, [sourceBox, activeKeyframe]);

    if (!sourceBox) return null;

    const [, ymin, xmin, ymax, xmax] = draftBox;
    
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

        const updateFromPointer = (clientX: number, clientY: number): SituationBox | null => {
            if (mode === 'draw') {
                const dx = clientX - startX;
                const dy = clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) < 3) return null;

                const startXRel = normalize(startX - rect.left, rect.width);
                const startYRel = normalize(startY - rect.top, rect.height);
                const currXRel = normalize(clientX - rect.left, rect.width);
                const currYRel = normalize(clientY - rect.top, rect.height);

                return [
                    startBox[0],
                    Math.max(0, Math.min(1000, Math.min(startYRel, currYRel))),
                    Math.max(0, Math.min(1000, Math.min(startXRel, currXRel))),
                    Math.max(0, Math.min(1000, Math.max(startYRel, currYRel))),
                    Math.max(0, Math.min(1000, Math.max(startXRel, currXRel)))
                ];
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

            return [
                t,
                Math.max(0, Math.min(1000, finalYmin)),
                Math.max(0, Math.min(1000, finalXmin)),
                Math.max(0, Math.min(1000, finalYmax)),
                Math.max(0, Math.min(1000, finalXmax))
            ];
        };

        const handleMove = (ev: PointerEvent) => {
            ev.preventDefault();
            const next = updateFromPointer(ev.clientX, ev.clientY);
            if (!next) return;
            draftBoxRef.current = next;
            setDraftBox(next);
        };

        const handleUp = (ev: PointerEvent) => {
            ev.preventDefault();
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
            document.body.style.userSelect = '';

            const finalBox = updateFromPointer(ev.clientX, ev.clientY);
            if (finalBox) {
                draftBoxRef.current = finalBox;
                setDraftBox(finalBox);
                onUpdate(activeKeyframe, finalBox);
            }
            isDraggingRef.current = false;

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
        isDraggingRef.current = true;
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
