import { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array, AUDIO_PLAYBACK_RATE } from '../utils/audioUtils';
import { AIConfig } from '../types';

interface UseGeminiLiveProps {
  apiKey: string;
  config: AIConfig;
  isRecording: boolean;
  audioStream: MediaStream | null;
}

export const useGeminiLive = ({ apiKey, config, isRecording, audioStream }: UseGeminiLiveProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentText, setCurrentText] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false); // If AI is currently speaking

  // Refs for audio processing to avoid stale closures and re-renders
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Keep config in a ref to access latest value in callbacks without re-connecting
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const cleanup = useCallback(() => {
    // Stop all playing sources
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();

    // Disconnect audio nodes
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
    if (inputContextRef.current) inputContextRef.current.close();
    if (outputContextRef.current) outputContextRef.current.close();

    // Close session if possible (GenAI SDK doesn't expose explicit close on promise, but we stop sending)
    sessionPromiseRef.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
    nextStartTimeRef.current = 0;
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey || !audioStream) return;
    
    // Initialize Audio Contexts
    inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_PLAYBACK_RATE });
    
    const client = new GoogleGenAI({ apiKey });

    const systemInstruction = `
      You are a friendly, charismatic, and slightly curious video podcast host. 
      The user is recording a vlog or video diary. 
      Your goal is to actively listen to them and occasionally jump in with short, 
      engaging follow-up questions to help them elaborate on their thoughts. 
      Do not interrupt while they are in the middle of a sentence, wait for a pause.
      Keep your responses concise (under 15 words usually) and natural.
      If the user stops talking, prompt them with a creative question related to what they just said.
    `;

    try {
      sessionPromiseRef.current = client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction,
          // We need transcriptions to display text overlay
          outputAudioTranscription: { },
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Connected');
            setIsConnected(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            const currentConfig = configRef.current;
            
            // Handle Transcription
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              if (text) {
                setCurrentText(prev => {
                    // Simple heuristic to clear old text if it's been a while or new sentence
                    if (prev.length > 100) return text;
                    return prev + text; 
                });
                // Auto-clear text after a delay if needed handled by UI
              }
            }
            
            if (message.serverContent?.turnComplete) {
                // Could clear text here or handle turn logic
            }

            // Handle Audio
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              
              // Only play audio if mode is 'audio'
              if (currentConfig.mode === 'audio') {
                setIsSpeaking(true);
                const ctx = outputContextRef.current;
                if (!ctx) return;

                const audioBuffer = await decodeAudioData(
                  base64ToUint8Array(base64Audio),
                  ctx,
                  AUDIO_PLAYBACK_RATE
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                // Ensure gapless playback
                const now = ctx.currentTime;
                // Add a small buffer (0.1s) if we fell behind to prevent glitching, otherwise schedule at end of queue
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
          }
        }
      });

      // Setup Input Stream
      if (inputContextRef.current && audioStream) {
        const source = inputContextRef.current.createMediaStreamSource(audioStream);
        // Using ScriptProcessor for simplicity in this demo context to access raw PCM
        const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
          if (!sessionPromiseRef.current) return;
          
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
    }
  }, [apiKey, audioStream]);

  // Connect when recording starts, Disconnect when it stops
  useEffect(() => {
    if (isRecording && !isConnected && config.mode !== 'off') {
      connect();
    } else if (!isRecording && isConnected) {
      cleanup();
    }
  }, [isRecording, isConnected, connect, cleanup, config.mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { isConnected, currentText, isSpeaking };
};
