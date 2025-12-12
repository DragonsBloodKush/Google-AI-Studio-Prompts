
import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array, AUDIO_PLAYBACK_RATE } from '../utils/audioUtils';
import { AIConfig, TranscriptEntry, CrewMember, WeatherData } from '../types';
import { generateSystemInstruction } from '../utils/logicTree';

interface UseGeminiLiveProps {
  apiKey: string;
  config: AIConfig;
  isRecording: boolean;
  isPaused: boolean;
  audioStream: MediaStream | null;
  crew: CrewMember[];
  isIncidentMode: boolean;
  weather: WeatherData | null;
  previousLogLocation?: string | null;
}

export const useGeminiLive = ({ 
  apiKey, 
  config, 
  isRecording, 
  isPaused, 
  audioStream,
  crew,
  isIncidentMode,
  weather,
  previousLogLocation
}: UseGeminiLiveProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentText, setCurrentText] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false); 
  const [aiStream, setAiStream] = useState<MediaStream | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Refs for audio processing
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const aiStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  // Refs for transcript accumulation
  const currentInputRef = useRef<string>('');
  const currentOutputRef = useRef<string>('');

  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Handle Pause State
  useEffect(() => {
    if (outputContextRef.current) {
      if (isPaused) {
        outputContextRef.current.suspend();
      } else {
        outputContextRef.current.resume();
      }
    }
  }, [isPaused]);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const cleanup = useCallback(() => {
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();

    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
    if (inputContextRef.current) inputContextRef.current.close();
    if (outputContextRef.current) outputContextRef.current.close();

    sessionPromiseRef.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
    nextStartTimeRef.current = 0;
    setAiStream(null);
    setError(null);
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey || !audioStream) return;
    
    // Initialize Audio Contexts
    inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_PLAYBACK_RATE });
    
    // Create destination for recording AI audio
    aiStreamDestRef.current = outputContextRef.current.createMediaStreamDestination();
    setAiStream(aiStreamDestRef.current.stream);

    const client = new GoogleGenAI({ apiKey });
    // Use the complex logic tree instruction generator with Weather Data
    const systemInstruction = generateSystemInstruction(
      isIncidentMode, 
      crew, 
      weather,
      previousLogLocation
    );

    try {
      sessionPromiseRef.current = client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction,
          outputAudioTranscription: { },
          inputAudioTranscription: { },
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Connected');
            setIsConnected(true);
            setTranscript([]); // Reset transcript on new session
            setError(null);
          },
          onmessage: async (message: LiveServerMessage) => {
            const currentConfig = configRef.current;
            
            // Handle Transcription
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              if (text) {
                currentOutputRef.current += text;
                setCurrentText(text); 
              }
            }
            
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              if (text) {
                currentInputRef.current += text;
              }
            }

            if (message.serverContent?.turnComplete) {
              const now = Date.now();
              setTranscript(prev => {
                const newEntries: TranscriptEntry[] = [];
                if (currentInputRef.current.trim()) {
                   newEntries.push({ role: 'user', text: currentInputRef.current.trim(), timestamp: now });
                }
                if (currentOutputRef.current.trim()) {
                   newEntries.push({ role: 'ai', text: currentOutputRef.current.trim(), timestamp: now });
                }
                return [...prev, ...newEntries];
              });
              
              currentInputRef.current = '';
              currentOutputRef.current = '';
            }

            // Handle Audio
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              if (currentConfig.mode === 'audio') {
                setIsSpeaking(true);
                const ctx = outputContextRef.current;
                const dest = aiStreamDestRef.current;
                if (!ctx || !dest) return;

                const audioBuffer = await decodeAudioData(
                  base64ToUint8Array(base64Audio),
                  ctx,
                  AUDIO_PLAYBACK_RATE
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                
                source.connect(ctx.destination);
                source.connect(dest);
                
                const now = ctx.currentTime;
                const startTime = Math.max(nextStartTimeRef.current, now + 0.05);
                
                source.start(startTime);
                nextStartTimeRef.current = startTime + audioBuffer.duration;
                
                sourcesRef.current.add(source);
                
                source.onended = () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) {
                     setIsSpeaking(false);
                  }
                };
              }
            }
          },
          onclose: () => {
            console.log('Gemini Live Closed');
            setIsConnected(false);
          },
          onerror: (err) => {
            console.error('Gemini Live Error', err);
            setIsConnected(false);
            setError(err instanceof Error ? err : new Error("Gemini Live Error"));
          }
        }
      });

      // Setup Input Stream
      if (inputContextRef.current && audioStream) {
        const source = inputContextRef.current.createMediaStreamSource(audioStream);
        const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
          if (!sessionPromiseRef.current || isPausedRef.current) return;
          
          const inputData = e.inputBuffer.getChannelData(0);
          const blob = createPcmBlob(inputData);
          
          sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({ media: blob });
          }).catch(err => console.error("Error sending audio", err));
        };

        source.connect(processor);
        processor.connect(inputContextRef.current.destination);
        
        sourceNodeRef.current = source;
        scriptProcessorRef.current = processor;
      }

    } catch (error) {
      console.error("Failed to connect to Gemini Live", error);
      setIsConnected(false);
      setError(error instanceof Error ? error : new Error("Failed to connect"));
    }
  }, [apiKey, audioStream, crew, isIncidentMode, weather, previousLogLocation]);

  useEffect(() => {
    if (isRecording && config.mode !== 'off') {
       if (!isConnected) connect();
    } else if (!isRecording && isConnected) {
      cleanup();
    }
  }, [isRecording, isConnected, connect, cleanup, config.mode]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { isConnected, currentText, isSpeaking, aiStream, transcript, error };
};
