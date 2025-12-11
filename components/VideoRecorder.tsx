import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VideoDimensions, AIConfig } from '../types';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { Mic, MicOff, Video, StopCircle, Download, RotateCcw, MessageSquare, Volume2, VolumeX, Sparkles } from 'lucide-react';

interface VideoRecorderProps {
  dimensions: VideoDimensions;
  onBack: () => void;
}

const PROMPTS = [
  "What's one thing you're grateful for today?",
  "Tell a story about a childhood memory.",
  "What is a challenge you overcame recently?",
  "If you could travel anywhere right now, where would it be?",
  "Who has influenced your life the most?",
  "What is your favorite comfort food and why?",
  "Talk about a hobby you are passionate about."
];

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ dimensions, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const [aiConfig, setAiConfig] = useState<AIConfig>({ mode: 'audio' });
  const [showPrompt, setShowPrompt] = useState(true);

  // Gemini Hook
  const { isConnected, currentText, isSpeaking } = useGeminiLive({
    apiKey: process.env.API_KEY || '',
    config: aiConfig,
    isRecording,
    audioStream
  });

  // Cycle prompts
  const nextPrompt = () => {
    setPromptIndex((prev) => (prev + 1) % PROMPTS.length);
  };

  // Setup Camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user'
          },
          audio: true // We need audio for the recording AND the AI
        });
        
        streamRef.current = stream;
        
        // Split audio stream for AI hook
        const audioOnlyStream = new MediaStream(stream.getAudioTracks());
        setAudioStream(audioOnlyStream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Canvas Drawing Loop (Crop to aspect ratio)
  useEffect(() => {
    const draw = () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;

        // Calculate crop logic: "cover" object-fit equivalent
        const videoRatio = video.videoWidth / video.videoHeight;
        const targetRatio = dimensions.width / dimensions.height;
        
        let sx, sy, sWidth, sHeight;

        if (videoRatio > targetRatio) {
          // Video is wider than target
          sHeight = video.videoHeight;
          sWidth = sHeight * targetRatio;
          sy = 0;
          sx = (video.videoWidth - sWidth) / 2;
        } else {
          // Video is taller than target
          sWidth = video.videoWidth;
          sHeight = sWidth / targetRatio;
          sx = 0;
          sy = (video.videoHeight - sHeight) / 2;
        }

        // Mirror effect for selfie cam
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dimensions]);

  const startRecording = () => {
    if (!canvasRef.current || !streamRef.current) return;

    // Countdown
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
    if (!canvasRef.current || !streamRef.current) return;

    const canvasStream = canvasRef.current.captureStream(30);
    // Combine canvas video + microphone audio
    const combinedTracks = [
      ...canvasStream.getVideoTracks(),
      ...streamRef.current.getAudioTracks()
    ];
    const combinedStream = new MediaStream(combinedTracks);

    const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/mp4' });
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      chunksRef.current = [];
    };

    recorder.start();
    setIsRecording(true);
    mediaRecorderRef.current = recorder;
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleDownload = () => {
    if (recordedVideoUrl) {
      const a = document.createElement('a');
      a.href = recordedVideoUrl;
      a.download = `vlog-${new Date().toISOString()}.mp4`;
      a.click();
    }
  };

  const reset = () => {
    setRecordedVideoUrl(null);
    setIsRecording(false);
  };

  const toggleAiMode = () => {
    setAiConfig(prev => {
      if (prev.mode === 'audio') return { mode: 'text' };
      if (prev.mode === 'text') return { mode: 'off' };
      return { mode: 'audio' };
    });
  };

  // Render "Review" state
  if (recordedVideoUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-pastel-cream p-6 animate-fade-in">
        <h2 className="text-3xl font-serif text-pastel-text mb-6">Your Story</h2>
        <div className="relative shadow-2xl rounded-2xl overflow-hidden border-4 border-white">
          <video 
            src={recordedVideoUrl} 
            controls 
            className="block bg-black"
            style={{ 
              width: dimensions.width > dimensions.height ? '80vw' : 'auto',
              height: dimensions.height > dimensions.width ? '70vh' : 'auto',
              maxHeight: '70vh',
              maxWidth: '90vw',
              aspectRatio: `${dimensions.width}/${dimensions.height}`
            }}
          />
        </div>
        
        <div className="flex gap-6 mt-8">
          <button 
            onClick={reset}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-white text-pastel-text shadow-md hover:shadow-lg transition-all font-sans font-bold"
          >
            <RotateCcw size={20} />
            Discard
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-pastel-lavender text-purple-900 shadow-md hover:shadow-lg hover:scale-105 transition-all font-sans font-bold"
          >
            <Download size={20} />
            Save Memory
          </button>
        </div>
      </div>
    );
  }

  // Render "Recording/Preview" state
  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-neutral-900 overflow-hidden">
      {/* Hidden Video Source */}
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* Main Canvas Display */}
      <div className="relative shadow-2xl overflow-hidden bg-black transition-all duration-500"
           style={{
             width: dimensions.width > dimensions.height ? 'min(90vw, 1280px)' : 'auto',
             height: dimensions.height > dimensions.width ? 'min(90vh, 1280px)' : 'auto',
             aspectRatio: `${dimensions.width}/${dimensions.height}`,
             maxHeight: '90vh',
             maxWidth: '100vw'
           }}
      >
        <canvas 
          ref={canvasRef} 
          className="w-full h-full object-contain"
        />

        {/* Overlays */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-50 backdrop-blur-sm">
            <span className="text-9xl font-bold text-white animate-bounce">{countdown}</span>
          </div>
        )}

        {/* AI Text Overlay */}
        {(currentText && aiConfig.mode !== 'off') && (
          <div className="absolute bottom-24 left-4 right-4 z-20 pointer-events-none">
            <div className={`p-4 rounded-xl backdrop-blur-md border border-white/20 shadow-lg transition-all duration-300 ${isSpeaking ? 'bg-pastel-lavender/90 text-purple-900 scale-105' : 'bg-black/50 text-white'}`}>
               <p className="font-serif text-lg leading-relaxed text-center italic">
                 "{currentText}"
               </p>
            </div>
          </div>
        )}
        
        {/* Connection Status Indicator */}
        {isRecording && aiConfig.mode !== 'off' && (
           <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${isConnected ? 'bg-green-500/80 text-white' : 'bg-yellow-500/80 text-white'}`}>
             <div className={`w-2 h-2 rounded-full bg-white ${isConnected ? 'animate-pulse' : ''}`} />
             {isConnected ? 'AI Listening' : 'Connecting...'}
           </div>
        )}
      </div>

      {/* Controls Container */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-6 z-40 pointer-events-none">
         <div className="flex items-center gap-4 pointer-events-auto bg-black/30 backdrop-blur-xl p-3 rounded-full border border-white/10">
            {/* Back Button */}
            {!isRecording && (
                <button onClick={onBack} className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                  <RotateCcw size={20} />
                </button>
            )}

            {/* AI Toggle */}
            <button 
              onClick={toggleAiMode}
              className={`p-3 rounded-full transition-all ${aiConfig.mode === 'off' ? 'bg-white/10 text-gray-400' : 'bg-pastel-lavender text-purple-900'}`}
              title={`AI Mode: ${aiConfig.mode}`}
            >
              {aiConfig.mode === 'audio' && <Volume2 size={24} />}
              {aiConfig.mode === 'text' && <MessageSquare size={24} />}
              {aiConfig.mode === 'off' && <VolumeX size={24} />}
            </button>

            {/* Record Button */}
            {isRecording ? (
              <button 
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-red-500 border-4 border-white flex items-center justify-center hover:scale-110 transition-transform shadow-lg shadow-red-500/50"
              >
                <div className="w-6 h-6 bg-white rounded-sm" />
              </button>
            ) : (
              <button 
                onClick={startRecording}
                className="w-16 h-16 rounded-full bg-white border-4 border-gray-200 flex items-center justify-center hover:scale-110 transition-transform hover:border-pastel-pink"
              >
                <div className="w-14 h-14 rounded-full bg-red-500" />
              </button>
            )}

            {/* Prompt Generator */}
            <button 
              onClick={nextPrompt}
              className="p-3 rounded-full bg-pastel-pink text-pink-900 hover:bg-pink-300 transition shadow-lg"
              title="New Topic"
            >
              <Sparkles size={24} />
            </button>
         </div>
      </div>

      {/* Floating Prompt Card (Top Center) */}
      {showPrompt && !isRecording && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-11/12 max-w-md pointer-events-none z-30">
          <div className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/50 text-center animate-fade-in-down">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Topic Inspiration</h3>
            <p className="text-xl font-serif text-pastel-text">{PROMPTS[promptIndex]}</p>
          </div>
        </div>
      )}
    </div>
  );
};