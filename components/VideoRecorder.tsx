
import React, { useEffect, useRef, useState } from 'react';
import { AIConfig, SavedTranscript, TranscriptEntry, CrewMember, DigitalSignature, WeatherData, LogicQuestion } from '../types';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { saveChunk, saveTranscriptDraft, checkDraftExists, loadDraft, clearDraft } from '../utils/db';
import { fetchWeatherData } from '../utils/weather';
import { 
  Download, 
  Trash2, 
  History, 
  Printer, 
  X, 
  CheckSquare, 
  Square,
  AlertTriangle,
  PenTool,
  Lock,
  Scissors,
  Play,
  Pause,
  Save,
  ChevronLeft,
  XCircle
} from 'lucide-react';

interface VideoRecorderProps {
  apiKey?: string;
}

// --- TOOLTIP COMPONENT (Material Design 3) ---
const Tooltip = ({ 
  children, 
  text, 
  position = 'top',
  align = 'center',
  className = ""
}: { 
  children?: React.ReactNode, 
  text: string, 
  position?: 'top' | 'bottom' | 'left' | 'right',
  align?: 'start' | 'center' | 'end',
  className?: string
}) => {
  const posClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2'
  };

  let alignClass = '';
  if (position === 'top' || position === 'bottom') {
      if (align === 'start') alignClass = 'left-0';
      else if (align === 'end') alignClass = 'right-0';
      else alignClass = 'left-1/2 -translate-x-1/2';
  } else {
      if (align === 'start') alignClass = 'top-0';
      else if (align === 'end') alignClass = 'bottom-0';
      else alignClass = 'top-1/2 -translate-y-1/2';
  }

  return (
    <div className={`group relative flex items-center justify-center ${className}`}>
      {children}
      <div className={`
        absolute ${posClasses[position]} ${alignClass}
        opacity-0 group-hover:opacity-100 transition-opacity duration-200 
        pointer-events-none z-[1000] px-3 py-2 
        bg-[#E6E1E5] text-[#313033] text-xs font-medium rounded-[4px] shadow-lg 
        w-max max-w-[150px] whitespace-normal text-center leading-tight
      `}>
        {text}
      </div>
    </div>
  );
};

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ 
  apiKey = process.env.API_KEY || ''
}) => {
  // --- STATE ---
  const dimensions = { width: 720, height: 1280, label: 'Portrait Story' };
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);

  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Compliance & Commercial State
  const [crew, setCrew] = useState<CrewMember[]>([{ id: '1', name: 'Captain', role: 'Master' }]);
  const [isIncidentMode, setIsIncidentMode] = useState(false);
  
  // History & Signature State
  const [showHistory, setShowHistory] = useState(false);
  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<Set<string>>(new Set());
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signerName, setSignerName] = useState('');

  // Recovery State
  const [showRecovery, setShowRecovery] = useState(false);

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const mixingContextRef = useRef<AudioContext | null>(null);

  // --- DERIVED STATE ---
  // Attempt to retrieve previous location context (mocking or inferring since not stored explicitly yet)
  const previousLogLocation = savedTranscripts.length > 0 
    ? "Unknown (Check previous log entries)" 
    : null;

  // --- HOOKS ---
  const { currentText, isSpeaking, transcript, error: liveError } = useGeminiLive({
    apiKey: apiKey,
    config: { mode: 'audio', personality: 'formal' },
    isRecording,
    isPaused,
    audioStream,
    crew,
    isIncidentMode,
    weather,
    previousLogLocation
  });

  // --- EFFECTS ---

  useEffect(() => {
    if (liveError && isRecording) {
      console.error("Stopping recording due to Live API error:", liveError);
      stopRecording();
      alert(`The AI Service is currently unavailable or encountered an error. Recording has been saved locally.\n\nError: ${liveError.message}`);
    }
  }, [liveError, isRecording]);

  useEffect(() => {
    const stored = localStorage.getItem('captains_log_history');
    if (stored) {
      try {
        setSavedTranscripts(JSON.parse(stored));
      } catch (e) { console.error("History parse error", e); }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const getWx = async () => {
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                if (!mounted) return;
                try {
                  const data = await fetchWeatherData(pos.coords.latitude, pos.coords.longitude);
                  if (mounted && data) setWeather(data);
                } catch (e) {
                  console.warn("Weather fetch failed safely");
                }
            }, (err) => {
                console.warn("Weather location denied or failed", err);
            }, { timeout: 10000 });
        }
    };
    getWx();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const check = async () => {
      const hasDraft = await checkDraftExists();
      if (hasDraft) setShowRecovery(true);
    };
    check();
  }, []);

  useEffect(() => {
    if (isRecording && transcript.length > 0) {
      saveTranscriptDraft(transcript);
    }
  }, [transcript, isRecording]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
          audio: true 
        });
        streamRef.current = stream;
        setAudioStream(new MediaStream(stream.getAudioTracks()));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) { console.error("Camera error", err); }
    };
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mixingContextRef.current) mixingContextRef.current.close();
    };
  }, []);

  useEffect(() => {
    const draw = () => {
      if (!videoRef.current || !canvasRef.current || recordedVideoUrl) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        if (canvas.width !== dimensions.width) canvas.width = dimensions.width;
        if (canvas.height !== dimensions.height) canvas.height = dimensions.height;
        
        const videoRatio = video.videoWidth / video.videoHeight;
        const targetRatio = dimensions.width / dimensions.height;
        let sx, sy, sWidth, sHeight;
        if (videoRatio > targetRatio) {
          sHeight = video.videoHeight;
          sWidth = sHeight * targetRatio;
          sy = 0;
          sx = (video.videoWidth - sWidth) / 2;
        } else {
          sWidth = video.videoWidth;
          sHeight = sWidth / targetRatio;
          sx = 0;
          sy = (video.videoHeight - sHeight) / 2;
        }
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      animationFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [dimensions, recordedVideoUrl]);


  // --- HELPERS ---

  const saveToHistory = (entries: TranscriptEntry[], sig?: DigitalSignature) => {
    if (entries.length === 0) return;
    const lastEntry = savedTranscripts[0];
    const isDuplicate = lastEntry && entries.length === lastEntry.entries.length && 
                        entries[entries.length-1].timestamp === lastEntry.entries[lastEntry.entries.length-1].timestamp;
    if (isDuplicate) return;

    const newLog: SavedTranscript = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      entries: [...entries],
      preview: entries.find(e => e.role === 'user')?.text.substring(0, 60) || "No user input...",
      crewManifest: crew,
      isIncidentMode,
      signature: sig
    };

    setSavedTranscripts(prev => {
      const updated = [newLog, ...prev];
      localStorage.setItem('captains_log_history', JSON.stringify(updated));
      return updated;
    });
  };

  const startRecording = async () => {
    if (!canvasRef.current || !streamRef.current) return;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn("AudioContext resume failed", e);
      }
    }
    mixingContextRef.current = audioCtx;

    await clearDraft();
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval);
          beginMediaRecorder();
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  const beginMediaRecorder = () => {
    if (!canvasRef.current || !streamRef.current || !mixingContextRef.current) return;
    try {
        const canvasStream = canvasRef.current.captureStream(30);
        const audioCtx = mixingContextRef.current; 
        const dest = audioCtx.createMediaStreamDestination();
        const audioTracks: MediaStreamTrack[] = [];
        if (streamRef.current.getAudioTracks().length > 0) {
            const source = audioCtx.createMediaStreamSource(streamRef.current);
            source.connect(dest);
            audioTracks.push(...dest.stream.getAudioTracks());
        } else {
            console.warn("No audio tracks found in source stream");
        }

        const tracks = [
            ...canvasStream.getVideoTracks(),
            ...audioTracks
        ].filter(t => t); 

        const combined = new MediaStream(tracks);
        const getSupportedMimeType = () => {
            const types = ['video/mp4', 'video/webm;codecs=h264', 'video/webm', 'video/x-matroska'];
            return types.find(type => MediaRecorder.isTypeSupported(type));
        };

        const mimeType = getSupportedMimeType();
        const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
        chunksRef.current = []; 

        recorder.ondataavailable = (e) => { 
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
            saveChunk(e.data);
          } 
        };
        
        recorder.onerror = (e) => {
            console.error("MediaRecorder Error:", e);
            setIsRecording(false);
            setCountdown(null);
            alert("Recording failed to start. Please check camera/mic permissions.");
        };

        recorder.onstop = () => {
          setIsProcessing(true);
          setTimeout(() => {
             const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/mp4' });
             if (blob.size > 0) {
                const url = URL.createObjectURL(blob);
                setRecordedVideoUrl(url);
             }
             chunksRef.current = [];
             setIsProcessing(false);
             if (mixingContextRef.current) { 
                 mixingContextRef.current.close(); 
                 mixingContextRef.current = null; 
             }
          }, 100);
        };
        
        recorder.start(1000);
        setIsRecording(true);
        setIsPaused(false);
        mediaRecorderRef.current = recorder;

    } catch (e) {
        console.error("Failed to begin recording:", e);
        setIsRecording(false);
        setCountdown(null);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (transcript.length > 0) saveToHistory(transcript);
    }
  };

  const togglePlayback = () => {
    if (reviewVideoRef.current) {
      if (isPlaying) {
        reviewVideoRef.current.pause();
      } else {
        reviewVideoRef.current.play();
      }
    }
  };

  const returnToHome = async () => {
      await clearDraft();
      setRecordedVideoUrl(null);
      setIsRecording(false);
      setIsEditing(false);
  };

  // --- EDITING LOGIC ---

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const dur = e.currentTarget.duration;
    if (dur && !isNaN(dur) && dur !== Infinity) {
        setVideoDuration(dur);
        if (!isEditing) setTrimRange([0, dur]);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const t = e.currentTarget.currentTime;
    if (isEditing) {
       if (t >= trimRange[1] || t < trimRange[0]) {
           if (isPlayingPreview) {
               e.currentTarget.currentTime = trimRange[0];
               e.currentTarget.play().catch(() => {});
           } else {
               e.currentTarget.pause();
               e.currentTarget.currentTime = trimRange[0];
           }
       }
    }
  };

  const toggleEditMode = () => {
      if (isEditing) {
          setIsEditing(false);
          setIsPlayingPreview(false);
          if (reviewVideoRef.current) {
              reviewVideoRef.current.currentTime = 0;
              reviewVideoRef.current.pause();
          }
      } else {
          if (reviewVideoRef.current) {
              reviewVideoRef.current.pause();
              const dur = reviewVideoRef.current.duration;
              setVideoDuration(dur);
              setTrimRange([0, dur]);
              setIsEditing(true);
              setIsPlayingPreview(false);
          }
      }
  };

  const applyTrim = async () => {
    if (!recordedVideoUrl) return;
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
        const startTime = trimRange[0];
        const endTime = trimRange[1];

        const hiddenVideo = document.createElement('video');
        hiddenVideo.src = recordedVideoUrl;
        hiddenVideo.crossOrigin = 'anonymous'; 
        hiddenVideo.currentTime = startTime;
        hiddenVideo.playsInline = true; 
        hiddenVideo.muted = false; 
        
        await new Promise((resolve) => {
            hiddenVideo.onloadeddata = resolve;
        });

        const processCanvas = document.createElement('canvas');
        processCanvas.width = hiddenVideo.videoWidth;
        processCanvas.height = hiddenVideo.videoHeight;
        const ctx = processCanvas.getContext('2d');
        
        const offlineAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = offlineAudioCtx.createMediaElementSource(hiddenVideo);
        const dest = offlineAudioCtx.createMediaStreamDestination();
        source.connect(dest);

        const stream = processCanvas.captureStream(30); 
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) stream.addTrack(audioTrack);

        const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 }); 
        const chunks: Blob[] = [];

        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        
        recorder.onstop = () => {
            const newBlob = new Blob(chunks, { type: mimeType });
            const newUrl = URL.createObjectURL(newBlob);
            setRecordedVideoUrl(newUrl);
            offlineAudioCtx.close();
            hiddenVideo.remove();
            processCanvas.remove();
            setIsEditing(false);
            setIsProcessing(false);
            setProcessingProgress(0);
        };

        recorder.start();
        await hiddenVideo.play();

        const process = () => {
            if (hiddenVideo.paused && !hiddenVideo.ended && hiddenVideo.currentTime < endTime) {
                hiddenVideo.play();
            }
            if (hiddenVideo.ended || hiddenVideo.currentTime >= endTime) {
                recorder.stop();
                hiddenVideo.pause();
                return;
            }
            if (ctx) ctx.drawImage(hiddenVideo, 0, 0);
            const prog = Math.min(100, Math.max(0, ((hiddenVideo.currentTime - startTime) / (endTime - startTime)) * 100));
            setProcessingProgress(prog);
            requestAnimationFrame(process);
        };
        process();

    } catch (e) {
        console.error("Trim failed", e);
        setIsProcessing(false);
        alert("Could not process video. Try again.");
    }
  };

  // --- COMPLIANCE FEATURES ---

  const handleSignLog = () => {
    if (!signerName.trim()) return;
    const logToSign = savedTranscripts[0];
    if (!logToSign) return;

    const signature: DigitalSignature = {
        signerName,
        signedAt: Date.now(),
        isLocked: true
    };

    const updatedLog = { ...logToSign, signature };
    const updatedList = [updatedLog, ...savedTranscripts.slice(1)];
    
    setSavedTranscripts(updatedList);
    localStorage.setItem('captains_log_history', JSON.stringify(updatedList));
    setShowSignatureModal(false);
  };

  const printFormalLog = (ids: Set<string>) => {
    const logs = savedTranscripts.filter(t => ids.has(t.id));
    if (logs.length === 0) return;
    // ... (Printing logic same as before)
    // For brevity keeping the same
    const printContent = `
      <html>
      <head>
        <title>Official Logbook Export</title>
        <style>
          @media print { @page { size: landscape; margin: 0.5in; } }
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; }
          .page { border: 2px solid #000; padding: 20px; margin-bottom: 20px; page-break-after: always; height: 90vh; position: relative; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; border: 1px solid #000; padding: 10px; }
          .log-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .log-table th, .log-table td { border: 1px solid #000; padding: 8px; vertical-align: top; text-align: left; }
          .log-table th { background-color: #eee; }
          .signature-box { border: 1px solid #000; padding: 15px; width: 40%; margin-left: auto; text-align: center; }
          .stamp { border: 3px double #000; display: inline-block; padding: 5px 15px; font-weight: bold; transform: rotate(-2deg); margin-top: 10px; }
          .incident-warning { background: #000; color: #fff; padding: 5px; font-weight: bold; text-align: center; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        ${logs.map((log: SavedTranscript) => {
          return `
          <div class="page">
            ${log.isIncidentMode ? '<div class="incident-warning">*** INCIDENT REPORT MODE ACTIVE ***</div>' : ''}
            <div class="header">
              <div class="title">OFFICIAL DECK LOG</div>
              <div>ID: ${log.id.slice(0, 8)}</div>
            </div>
            <div class="meta-grid">
              <div><strong>DATE:</strong><br>${new Date(log.timestamp).toLocaleDateString()}</div>
              <div><strong>TIME (Local):</strong><br>${new Date(log.timestamp).toLocaleTimeString()}</div>
              <div><strong>POB:</strong><br>${log.crewManifest ? log.crewManifest.length : 0} Souls</div>
              <div><strong>LOCATION:</strong><br>${log.signature ? 'LOCKED' : (weather?.location || 'Unknown')}</div>
            </div>
            <table class="log-table">
              <thead>
                <tr>
                  <th style="width: 15%">Time</th>
                  <th style="width: 15%">Speaker</th>
                  <th>Entry</th>
                </tr>
              </thead>
              <tbody>
                ${log.entries.map((e: TranscriptEntry) => `
                  <tr>
                    <td>${new Date(e.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
                    <td>${e.role === 'ai' ? 'LOG (AI)' : 'COMMAND'}</td>
                    <td>${e.text}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="signature-box">
              <div>I HEREBY CERTIFY THIS LOG ENTRY IS TRUE AND ACCURATE.</div>
              <br><br>
              <div style="border-bottom: 1px solid #000; height: 1px; width: 80%; margin: 0 auto;"></div>
              <div>${log.signature ? log.signature.signerName : '(Unsigned Draft)'}</div>
              ${log.signature && log.signature.isLocked ? `
                <div class="stamp">DIGITALLY LOCKED<br>${new Date(log.signature.signedAt).toLocaleString()}</div>
              ` : ''}
            </div>
          </div>
        `}).join('')}
        <script>window.print();</script>
      </body>
      </html>
    `;
    const w = window.open('', '_blank');
    if (w) { w.document.write(printContent); w.document.close(); }
  };

  // --- RENDER ---
  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-[#141218] text-[#E6E1E5] overflow-hidden font-sans">
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* RECOVERY MODAL */}
      {showRecovery && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-[#1D1B20] w-full max-w-md rounded-2xl border border-[#EAB308] p-6 flex flex-col gap-4 relative">
              <button 
                onClick={() => { clearDraft(); setShowRecovery(false); }} 
                className="absolute top-2 right-2 p-2 rounded-full hover:bg-white/10 text-[#CAC4D0] transition-colors"
                aria-label="Close"
              >
                <XCircle size={24} />
              </button>
              <div className="flex items-center gap-3 text-[#EAB308]">
                 <AlertTriangle size={32} />
                 <h2 className="text-xl font-bold font-serif">Unsaved Log Found</h2>
              </div>
              <p className="text-[#E6E1E5] text-sm">A previous session was interrupted.</p>
              <div className="flex gap-3 mt-2">
                 <button onClick={async () => { await clearDraft(); setShowRecovery(false); }} className="flex-1 py-3 rounded-full bg-[#2B2930] hover:bg-[#36343b] transition-colors font-medium">Discard</button>
                 <button onClick={async () => { 
                    const draft = await loadDraft(); 
                    if (draft) { 
                      setRecordedVideoUrl(URL.createObjectURL(draft.blob)); 
                      saveToHistory(draft.transcript); 
                    } 
                    setShowRecovery(false); 
                 }} className="flex-1 py-3 rounded-full bg-[#EAB308] hover:bg-[#FACC15] text-[#31111D] font-bold transition-colors">Recover</button>
              </div>
           </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#1D1B20] w-full max-w-4xl h-[80vh] rounded-2xl border border-[#49454F] flex flex-col overflow-hidden relative">
                  <div className="p-4 border-b border-[#49454F] flex justify-between items-center bg-[#141218]">
                      <h3 className="text-lg font-bold font-serif text-[#E6E1E5]">Logbook History</h3>
                      <div className="flex gap-2">
                          {selectedTranscriptIds.size > 0 && (
                            <Tooltip text="Export Selected to PDF" position="bottom" align="end">
                                <button onClick={() => printFormalLog(selectedTranscriptIds)} className="flex items-center gap-2 px-3 py-1 bg-md-sys-primary text-md-sys-onPrimary rounded text-sm font-bold">
                                    <Printer size={16}/> Print Selected
                                </button>
                            </Tooltip>
                          )}
                          <Tooltip text="Close History" position="bottom" align="end">
                              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-[#49454F] rounded-full text-[#CAC4D0] hover:text-[#E6E1E5] transition-colors">
                                <XCircle size={24} />
                              </button>
                          </Tooltip>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {savedTranscripts.length === 0 ? (
                          <div className="text-center text-[#CAC4D0] mt-10">No logs recorded yet.</div>
                      ) : (
                          savedTranscripts.map(log => (
                              <div key={log.id} className={`p-4 rounded-xl border ${selectedTranscriptIds.has(log.id) ? 'border-md-sys-primary bg-[#2B2930]' : 'border-[#49454F] bg-[#1D1B20]'} hover:border-[#CAC4D0] transition-colors cursor-pointer`}
                                   onClick={() => {
                                      const newSet = new Set(selectedTranscriptIds);
                                      if (newSet.has(log.id)) newSet.delete(log.id);
                                      else newSet.add(log.id);
                                      setSelectedTranscriptIds(newSet);
                                   }}
                              >
                                  <div className="flex justify-between items-start mb-2">
                                      <div className="flex gap-3 items-center">
                                          <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedTranscriptIds.has(log.id) ? 'bg-md-sys-primary border-md-sys-primary' : 'border-[#CAC4D0]'}`}>
                                              {selectedTranscriptIds.has(log.id) && <CheckSquare size={12} className="text-md-sys-onPrimary"/>}
                                          </div>
                                          <div>
                                              <div className="font-bold text-[#E6E1E5]">{new Date(log.timestamp).toLocaleDateString()} - {new Date(log.timestamp).toLocaleTimeString()}</div>
                                              <div className="text-xs text-[#CAC4D0]">{log.entries.length} Entries • {log.isIncidentMode ? <span className="text-red-400 font-bold">INCIDENT REPORT</span> : 'Routine Log'}</div>
                                              {log.signature && (
                                                <Tooltip text="Digitally Signed & Locked" position="right" align="center">
                                                    <div className="text-[10px] text-[#EAB308] flex items-center gap-1 mt-1"><Lock size={10}/> Signed by {log.signature.signerName}</div>
                                                </Tooltip>
                                              )}
                                          </div>
                                      </div>
                                      
                                      {/* DELETE ACTION / LOCK INDICATOR */}
                                      {log.signature ? (
                                        <Tooltip text="Log is Locked" position="left" align="center">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    alert("Signed logs cannot be deleted.");
                                                }} 
                                                className="p-2 text-gray-500 hover:text-gray-400 rounded-full"
                                            >
                                                <Lock size={16}/>
                                            </button>
                                        </Tooltip>
                                      ) : (
                                        <Tooltip text="Delete Entry" position="left" align="center">
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                if(confirm('Delete this log permanently?')) {
                                                    const next = savedTranscripts.filter(p => p.id !== log.id);
                                                    setSavedTranscripts(next);
                                                    localStorage.setItem('captains_log_history', JSON.stringify(next));
                                                }
                                            }} className="p-2 hover:bg-red-900/50 text-red-400 rounded-full"><Trash2 size={16}/></button>
                                        </Tooltip>
                                      )}
                                  </div>
                                  <p className="text-sm text-[#E6E1E5] line-clamp-2 pl-8 opacity-80 italic">"{log.preview}..."</p>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* SIGNATURE MODAL */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-[#FDF6E3] text-black w-full max-w-md rounded-lg p-8 shadow-2xl relative">
              <button 
                onClick={() => setShowSignatureModal(false)}
                className="absolute top-2 right-2 p-2 hover:bg-black/10 rounded-full transition-colors"
                aria-label="Close"
              >
                <XCircle size={24} className="text-black/60 hover:text-black" />
              </button>
              
              <h2 className="text-2xl font-serif font-bold mb-2 uppercase tracking-widest text-center border-b-2 border-black pb-2">Official Logbook Sign-off</h2>
              <p className="text-xs font-mono mb-6 text-center">WARNING: SIGNING THIS LOG LOCKS THE RECORD PER USCG REGULATIONS.</p>
              
              <div className="mb-4">
                 <label className="block text-xs font-bold mb-1">CAPTAIN'S NAME (PRINTED)</label>
                 <input 
                   type="text" 
                   value={signerName} 
                   onChange={(e) => setSignerName(e.target.value)}
                   className="w-full bg-white border-b border-black p-2 font-serif text-lg outline-none focus:bg-black/5 transition-colors" 
                   placeholder="e.g. Cpt. John Smith"
                 />
              </div>

              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowSignatureModal(false)} className="flex-1 py-3 border border-black text-black font-bold text-xs uppercase hover:bg-black/5 transition-colors">Cancel</button>
                <button onClick={handleSignLog} className="flex-1 py-3 bg-black text-white font-bold text-xs uppercase hover:bg-black/80 transition-colors">Sign & Lock</button>
              </div>
           </div>
        </div>
      )}

      {/* TOOLS RAIL */}
      <aside className="flex md:flex-col items-center justify-between md:justify-start w-full md:w-24 p-4 md:py-8 bg-[#1D1B20] border-r border-[#49454F] z-50 shadow-elevation-1 shrink-0">
        <div className="flex md:flex-col gap-4 items-center">
           {/* History */}
           <Tooltip text="View Logs" position="bottom" align="start">
               <button onClick={() => setShowHistory(true)} className="p-3 rounded-full hover:bg-[#49454F] text-[#E6E1E5] transition-colors">
                 <History size={24} />
               </button>
           </Tooltip>
        </div>
      </aside>

      {/* WRAPPER FOR MAIN + FOOTER */}
      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 relative">
        
        {/* MAIN STAGE */}
        <main className="flex-1 flex flex-col items-center justify-center bg-[#141218] p-4 min-h-0 overflow-hidden relative">
            <div 
                className={`relative shadow-2xl bg-black rounded-[20px] overflow-hidden border ${isIncidentMode ? 'border-red-500 border-4' : 'border-[#49454F]'}`}
                style={{ 
                    aspectRatio: `${dimensions.width}/${dimensions.height}`, 
                    height: '100%', 
                    maxHeight: '100%', 
                    width: 'auto',
                    maxWidth: '100%' 
                }}
            >

            {/* STATUS HEADER OVERLAY */}
            <div className="absolute top-0 left-0 right-0 p-4 z-[60] flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
                 <div className="text-[#E6E1E5] text-sm font-mono uppercase tracking-widest font-bold flex items-center gap-2">
                     {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                     {isRecording ? (isIncidentMode ? "INCIDENT RECORDING" : "RECORDING") : (recordedVideoUrl ? (isEditing ? "EDITING MODE" : "REVIEW MODE") : "")}
                 </div>
                 
                 {/* Close Button for Review Mode */}
                 {recordedVideoUrl && !isEditing && (
                    <div className="pointer-events-auto">
                        <Tooltip text="Close & Return Home" position="left" align="start">
                            <button 
                                onClick={returnToHome}
                                className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors"
                            >
                                <XCircle size={28} />
                            </button>
                        </Tooltip>
                    </div>
                 )}
            </div>
            
            {/* Video Preview */}
            {recordedVideoUrl ? (
                <video 
                ref={reviewVideoRef} 
                src={recordedVideoUrl} 
                className="w-full h-full object-cover" 
                controls={!isEditing}
                autoPlay={false} // Disabled auto-play
                playsInline 
                loop={!isEditing}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                />
            ) : (
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
            )}

            {/* EDITING OVERLAY */}
            {isEditing && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-4 pb-8 z-40 flex flex-col gap-2 border-t border-white/10">
                    <div className="flex justify-between text-xs font-mono text-gray-400 mb-1">
                        <span>{trimRange[0].toFixed(1)}s</span>
                        <span>{trimRange[1].toFixed(1)}s</span>
                    </div>
                    
                    {/* Dual Range Slider Container */}
                    <div className="relative h-10 w-full flex items-center justify-center">
                        <div className="absolute w-full h-2 bg-gray-700 rounded-full"></div>
                        <div 
                            className="absolute h-2 bg-yellow-500 rounded-full pointer-events-none"
                            style={{
                                left: `${(trimRange[0] / videoDuration) * 100}%`,
                                width: `${((trimRange[1] - trimRange[0]) / videoDuration) * 100}%`
                            }}
                        ></div>
                        <input 
                            type="range" 
                            min={0} max={videoDuration} step={0.1}
                            value={trimRange[0]}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (val < trimRange[1] - 0.5) setTrimRange([val, trimRange[1]]);
                            }}
                            className="absolute w-full h-2 bg-transparent appearance-none pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none z-20"
                        />
                        <input 
                            type="range" 
                            min={0} max={videoDuration} step={0.1}
                            value={trimRange[1]}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (val > trimRange[0] + 0.5) setTrimRange([trimRange[0], val]);
                            }}
                            className="absolute w-full h-2 bg-transparent appearance-none pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none z-20"
                        />
                    </div>

                    <div className="flex justify-center mt-2">
                        <Tooltip text={isPlayingPreview ? "Pause Preview" : "Play Preview"} position="top">
                            <button 
                                onClick={() => {
                                    if (reviewVideoRef.current) {
                                        if (isPlayingPreview) {
                                            reviewVideoRef.current.pause();
                                            setIsPlayingPreview(false);
                                        } else {
                                            reviewVideoRef.current.currentTime = trimRange[0];
                                            reviewVideoRef.current.play();
                                            setIsPlayingPreview(true);
                                        }
                                    }
                                }}
                                className="p-3 bg-white/10 rounded-full hover:bg-white/20"
                            >
                                {isPlayingPreview ? <Pause size={20} /> : <Play size={20} />}
                            </button>
                        </Tooltip>
                    </div>
                </div>
            )}

            {/* Processing Indicator */}
            {isProcessing && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
                    <div className="text-white font-bold animate-pulse text-xl mb-4">Trimming Video...</div>
                    <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-500 transition-all duration-100" style={{width: `${processingProgress}%`}}></div>
                    </div>
                    <div className="text-white/50 text-xs mt-2">{Math.round(processingProgress)}%</div>
                </div>
            )}
            
            {/* INCIDENT MODE TOGGLE */}
            {!recordedVideoUrl && !isProcessing && (
                <Tooltip text={isIncidentMode ? "Deactivate Incident Mode" : "Report Safety Incident"} position="bottom" align="start" className="absolute top-16 left-4 z-50">
                    <button 
                    onClick={() => setIsIncidentMode(!isIncidentMode)}
                    className={`px-4 py-2 rounded-full font-bold text-xs tracking-wider border backdrop-blur-md transition-all
                        ${isIncidentMode ? 'bg-red-600 text-white border-red-400 animate-pulse' : 'bg-black/50 text-white/50 border-white/20 hover:bg-black/70'}
                    `}
                    >
                    {isIncidentMode ? '⚠ INCIDENT MODE ACTIVE' : '⚠ REPORT INCIDENT'}
                    </button>
                </Tooltip>
            )}

            {isIncidentMode && !recordedVideoUrl && (
                <div className="absolute top-0 left-0 right-0 h-2 bg-red-600 animate-pulse z-50" />
            )}
            
            {/* Captions */}
            {currentText && !recordedVideoUrl && (
                <div className="absolute bottom-12 left-0 right-0 px-4 flex justify-center z-30">
                <div className="max-w-[90%] p-4 rounded-2xl backdrop-blur-xl bg-black/60 text-white/90 border border-white/10 shadow-lg">
                    <p className="font-serif text-lg md:text-xl text-center font-medium">{currentText}</p>
                </div>
                </div>
            )}
            </div>
        </main>

        {/* FOOTER */}
        <footer className="w-full bg-[#1D1B20] border-t border-[#49454F] p-4 pb-8 md:pb-4 z-50 shrink-0">
            <div className="max-w-5xl mx-auto flex flex-col gap-4">
            {/* Controls */}
            <div className="flex items-center justify-center gap-6 md:gap-12 relative min-h-[100px]">
                {recordedVideoUrl ? (
                    isEditing ? (
                        <>
                            <Tooltip text="Discard Changes" position="top" align="start">
                                <button onClick={toggleEditMode} className="flex items-center gap-2 px-6 py-3 rounded-full bg-[#2B2930] hover:bg-[#49454F] text-[#E6E1E5] transition-colors">
                                    <X size={20} /> <span className="hidden md:inline">Cancel</span>
                                </button>
                            </Tooltip>
                            <Tooltip text="Apply Trimming" position="top" align="end">
                                <button onClick={applyTrim} className="flex items-center gap-2 px-6 py-3 rounded-full bg-md-sys-primary text-md-sys-onPrimary font-bold transition-colors">
                                    <CheckSquare size={20} /> <span>Apply Trim</span>
                                </button>
                            </Tooltip>
                        </>
                    ) : (
                    <>
                         {/* DELETE (Trash) Button - Left */}
                         {!savedTranscripts[0]?.signature ? (
                            <Tooltip text="Delete Entry" position="top" align="start">
                                <button onClick={async () => { await clearDraft(); setRecordedVideoUrl(null); setIsRecording(false); }} className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#2B2930] hover:bg-[#49454F] text-[#E6E1E5] transition-colors">
                                    <Trash2 size={20} /> <span className="hidden md:inline">Delete</span>
                                </button>
                            </Tooltip>
                         ) : (
                             <Tooltip text="Log Locked" position="top" align="start">
                                <button onClick={() => alert("Signed logs cannot be deleted.")} className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#1D1B20] text-gray-500 border border-gray-800 cursor-not-allowed">
                                    <Lock size={20} /> <span className="hidden md:inline">Locked</span>
                                </button>
                            </Tooltip>
                         )}
                        
                        {/* PLAY/PAUSE - Center */}
                        <Tooltip text={isPlaying ? "Pause Video" : "Play Video"} position="top">
                            <button onClick={togglePlayback} className="flex items-center gap-2 px-6 py-4 rounded-full bg-[#49454F] text-white font-bold hover:bg-[#605D66] transition-colors shadow-lg">
                                {isPlaying ? <Pause size={24} /> : <Play size={24} />} 
                            </button>
                        </Tooltip>

                        {/* TRIM - Right Center */}
                        <Tooltip text="Edit Video" position="top">
                            <button onClick={toggleEditMode} className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#2B2930] hover:bg-[#49454F] text-[#E6E1E5] transition-colors">
                                <Scissors size={20} /> <span className="hidden md:inline">Trim</span>
                            </button>
                        </Tooltip>

                        {/* SIGN - Right */}
                        {!savedTranscripts[0]?.signature && (
                            <Tooltip text="Sign Logbook" position="top" align="end">
                                <button onClick={() => setShowSignatureModal(true)} className="flex items-center gap-2 px-4 py-3 rounded-full bg-[#EAB308] hover:bg-[#FACC15] text-[#31111D] font-bold transition-colors shadow-md">
                                <PenTool size={20} /> <span className="hidden md:inline">Sign</span>
                                </button>
                            </Tooltip>
                        )}
                    </>
                    )
                ) : (
                <Tooltip text={isRecording ? "Stop Recording" : "Start Recording"} position="top">
                    <button 
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isProcessing}
                        className={`
                        relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-xl
                        ${isRecording ? 'bg-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'bg-white hover:bg-[#D0BCFF] hover:scale-105'}
                        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {isRecording ? <Square size={32} className="fill-white text-white" /> : <div className="w-16 h-16 rounded-full border-4 border-[#141218]" />}
                        
                        {countdown !== null && (
                        <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-[#141218]">
                            {countdown}
                        </div>
                        )}
                    </button>
                </Tooltip>
                )}
            </div>
            </div>
        </footer>
      </div>
    </div>
  );
};
