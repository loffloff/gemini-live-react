import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  Transcript,
  UseGeminiLiveOptions,
  UseGeminiLiveReturn,
  ProxyMessage,
} from './types';

/**
 * React hook for real-time bidirectional voice communication with Google Gemini Live API.
 *
 * Handles all the complex audio processing:
 * - Microphone capture at 16kHz with AudioWorklet
 * - Float32 to Int16 PCM conversion
 * - Audio output resampling from 24kHz to browser's sample rate
 * - Buffer management for smooth playback
 * - Transcript debouncing
 * - Automatic reconnection with exponential backoff
 *
 * @example
 * ```tsx
 * const { connect, disconnect, transcripts, isSpeaking } = useGeminiLive({
 *   proxyUrl: 'wss://your-project.supabase.co/functions/v1/gemini-live-proxy',
 * });
 *
 * // Connect (optionally with a video element for screen sharing)
 * await connect(videoRef.current);
 *
 * // Transcripts update automatically as you speak
 * transcripts.map(t => <div key={t.id}>{t.role}: {t.text}</div>)
 * ```
 */
export function useGeminiLive(options: UseGeminiLiveOptions): UseGeminiLiveReturn {
  const {
    proxyUrl,
    sessionId,
    welcomeMessage,
    onTranscript,
    onError,
    onConnectionChange,
    minBufferMs = 200,
    transcriptDebounceMs = 1500,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingUserText, setStreamingUserText] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelayRef = useRef(1000);
  const sessionHandleRef = useRef<string | null>(null);

  // Transcript accumulation - buffer chunks before creating transcript entries
  const inputTranscriptBufferRef = useRef<string>('');
  const outputTranscriptBufferRef = useRef<string>('');
  const inputTranscriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputTranscriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio refs - separate contexts for input (16kHz) and output (24kHz)
  const playbackContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  // Calculate min buffer samples based on minBufferMs (at 24kHz source rate)
  const minBufferSamples = Math.floor((minBufferMs / 1000) * 24000);

  /**
   * Parse sample rate from mimeType (e.g., "audio/L16;rate=24000" or "audio/pcm;rate=24000")
   */
  const parseSampleRate = useCallback((mimeType: string): number => {
    const match = mimeType.match(/rate=(\d+)/);
    return match ? parseInt(match[1], 10) : 24000;
  }, []);

  /**
   * Simple linear resampling from sourceSampleRate to targetSampleRate.
   * Uses linear interpolation for smooth results.
   */
  const resampleAudio = useCallback(
    (input: Float32Array, sourceSampleRate: number, targetSampleRate: number): Float32Array => {
      if (sourceSampleRate === targetSampleRate) {
        return input;
      }
      const ratio = sourceSampleRate / targetSampleRate;
      const outputLength = Math.floor(input.length / ratio);
      const output = new Float32Array(outputLength);
      for (let i = 0; i < outputLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
        const t = srcIndex - srcIndexFloor;
        // Linear interpolation
        output[i] = input[srcIndexFloor] * (1 - t) + input[srcIndexCeil] * t;
      }
      return output;
    },
    []
  );

  /**
   * Play buffered audio - concatenates all buffered chunks into one for smooth playback.
   * Chains playback: when one buffer ends, checks if more arrived while playing.
   */
  const playBufferedAudio = useCallback(() => {
    if (!playbackContextRef.current || audioBufferRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    const ctx = playbackContextRef.current;
    const chunks = audioBufferRef.current;
    const totalLength = chunks.reduce((sum, arr) => sum + arr.length, 0);

    if (totalLength === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    // Concatenate all buffered chunks into one array
    const concatenated = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      concatenated.set(chunk, offset);
      offset += chunk.length;
    }

    // Clear the buffer
    audioBufferRef.current = [];

    // Create and play audio buffer
    const buffer = ctx.createBuffer(1, concatenated.length, ctx.sampleRate);
    buffer.getChannelData(0).set(concatenated);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      // Check if more audio arrived while playing
      if (audioBufferRef.current.length > 0) {
        playBufferedAudio();
      } else {
        isPlayingRef.current = false;
        setIsSpeaking(false);
      }
    };
    source.start();
  }, []);

  /**
   * Play audio from AI response (24kHz output from native audio model).
   * Handles:
   * - Base64 decoding
   * - PCM16 little-endian to Float32 conversion
   * - Resampling to browser's sample rate
   * - Buffer management for smooth playback
   */
  const playAudio = useCallback(
    async (base64Data: string, mimeType: string) => {
      const sourceSampleRate = parseSampleRate(mimeType);

      // Create AudioContext with browser's default sample rate (don't force 24kHz)
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext();
      }

      const ctx = playbackContextRef.current;
      const targetSampleRate = ctx.sampleRate;

      // Resume AudioContext if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      try {
        // Decode base64 to binary
        const binaryString = atob(base64Data);
        const byteLength = binaryString.length;

        // Ensure byte length is even for Int16Array (PCM16 = 2 bytes per sample)
        const alignedLength = byteLength - (byteLength % 2);
        if (alignedLength < 2) {
          return;
        }

        // Create ArrayBuffer and copy bytes
        const arrayBuffer = new ArrayBuffer(alignedLength);
        const bytes = new Uint8Array(arrayBuffer);
        for (let i = 0; i < alignedLength; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Use DataView to read Int16 values with explicit little-endian byte order
        // This is critical - Gemini sends little-endian PCM16
        const dataView = new DataView(arrayBuffer);
        const numSamples = alignedLength / 2;
        const float32 = new Float32Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
          // Read 16-bit signed integer, little-endian (the `true` is critical!)
          const sample = dataView.getInt16(i * 2, true);
          float32[i] = sample / 32768.0;
        }

        // Resample from source (24kHz) to browser's actual sample rate
        const resampled = resampleAudio(float32, sourceSampleRate, targetSampleRate);

        // Buffer audio chunks
        audioBufferRef.current.push(resampled);

        // Calculate total buffered samples (in target sample rate)
        const totalSamples = audioBufferRef.current.reduce((sum, arr) => sum + arr.length, 0);
        const minSamplesForPlayback = Math.floor(minBufferSamples * (targetSampleRate / 24000));

        // Start playback when we have enough buffered
        if (!isPlayingRef.current && totalSamples >= minSamplesForPlayback) {
          isPlayingRef.current = true;
          setIsSpeaking(true);
          playBufferedAudio();
        }
      } catch (err) {
        console.error('Error playing audio:', err);
      }
    },
    [parseSampleRate, resampleAudio, playBufferedAudio, minBufferSamples]
  );

  /**
   * Capture and send video frame for screen sharing
   */
  const captureAndSendFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !socketRef.current) return;
    if (socketRef.current.readyState !== WebSocket.OPEN) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to match video (scaled down for efficiency)
    const maxWidth = 1024;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

    socketRef.current.send(
      JSON.stringify({
        type: 'frame',
        data: base64Data,
      })
    );
  }, []);

  /** Start frame capture interval (1 FPS) */
  const startFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    frameIntervalRef.current = setInterval(captureAndSendFrame, 1000);
    captureAndSendFrame();
  }, [captureAndSendFrame]);

  /** Stop frame capture */
  const stopFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  /**
   * Start microphone capture (16kHz input for Gemini).
   * Uses AudioWorklet for proper Float32 to Int16 PCM conversion.
   */
  const startMicCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      micStreamRef.current = stream;

      // Create separate audio context for input processing (16kHz)
      const ctx = new AudioContext({ sampleRate: 16000 });
      inputContextRef.current = ctx;

      // Load audio worklet for processing
      // This converts Float32 to Int16 PCM with proper clamping
      await ctx.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [
              `
          class AudioProcessor extends AudioWorkletProcessor {
            constructor() {
              super();
            }

            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (input && input[0]) {
                // Convert Float32 to Int16 PCM with proper clamping
                const float32 = input[0];
                const int16 = new Int16Array(float32.length);
                for (let i = 0; i < float32.length; i++) {
                  const s = Math.max(-1, Math.min(1, float32[i]));
                  // Proper asymmetric conversion for signed 16-bit
                  int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Send raw Int16 buffer to main thread (btoa not available in worklet)
                this.port.postMessage({ audioBuffer: int16.buffer }, [int16.buffer]);
              }
              return true;
            }
          }
          registerProcessor('audio-processor', AudioProcessor);
        `,
            ],
            { type: 'application/javascript' }
          )
        )
      );

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'audio-processor');
      audioWorkletRef.current = worklet;

      worklet.port.onmessage = (event) => {
        if (isMuted) return;
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          // Convert to base64 in main thread where btoa is available
          const bytes = new Uint8Array(event.data.audioBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          socketRef.current.send(
            JSON.stringify({
              type: 'audio',
              mimeType: 'audio/pcm;rate=16000',
              data: base64,
            })
          );
        }
      };

      source.connect(worklet);
      // Don't connect to destination to avoid feedback
    } catch (err) {
      console.error('Failed to start microphone:', err);
      const errorMsg = 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [isMuted, onError]);

  /** Stop microphone capture */
  const stopMicCapture = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect();
      audioWorkletRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
  }, []);

  /**
   * Add a transcript entry and call the onTranscript callback
   */
  const addTranscript = useCallback(
    (role: 'user' | 'assistant', text: string) => {
      const transcript: Transcript = {
        id: Date.now().toString(),
        role,
        text,
        timestamp: new Date(),
      };
      setTranscripts((prev) => [...prev, transcript]);
      onTranscript?.(transcript);
    },
    [onTranscript]
  );

  /**
   * Connect to the Gemini Live proxy
   */
  const connect = useCallback(
    async (videoElement?: HTMLVideoElement) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      setIsConnecting(true);
      setError(null);

      if (videoElement) {
        videoRef.current = videoElement;
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
      }

      try {
        let wsUrl = proxyUrl;
        if (sessionId) {
          const separator = proxyUrl.includes('?') ? '&' : '?';
          wsUrl += `${separator}session_id=${encodeURIComponent(sessionId)}`;
        }

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          reconnectAttemptsRef.current = 0;
        };

        socket.onmessage = (event) => {
          try {
            const data: ProxyMessage = JSON.parse(event.data);

            switch (data.type) {
              case 'setup_complete':
                setIsConnecting(false);
                setIsConnected(true);
                onConnectionChange?.(true);
                if (videoRef.current) {
                  startFrameCapture();
                }
                startMicCapture();
                // Send welcome message to trigger AI greeting
                if (welcomeMessage && socketRef.current?.readyState === WebSocket.OPEN) {
                  socketRef.current.send(
                    JSON.stringify({
                      type: 'text',
                      text: welcomeMessage,
                    })
                  );
                }
                break;

              case 'audio':
                if (data.data && data.mimeType) {
                  playAudio(data.data, data.mimeType);
                }
                break;

              case 'input_transcription':
                // User's speech transcribed to text - accumulate chunks
                if (data.text) {
                  inputTranscriptBufferRef.current += data.text;

                  // Update streaming state for real-time display
                  setStreamingUserText(inputTranscriptBufferRef.current.trim());

                  if (inputTranscriptTimeoutRef.current) {
                    clearTimeout(inputTranscriptTimeoutRef.current);
                  }

                  inputTranscriptTimeoutRef.current = setTimeout(() => {
                    const finalText = inputTranscriptBufferRef.current.trim();
                    if (finalText) {
                      addTranscript('user', finalText);
                      inputTranscriptBufferRef.current = '';
                    }
                    // Clear streaming state after finalizing
                    setStreamingUserText(null);
                  }, transcriptDebounceMs);
                }
                break;

              case 'output_transcription':
                // AI's speech transcribed to text - accumulate chunks
                if (data.text) {
                  outputTranscriptBufferRef.current += data.text;

                  // Update streaming state for real-time display
                  setStreamingText(outputTranscriptBufferRef.current.trim());

                  if (outputTranscriptTimeoutRef.current) {
                    clearTimeout(outputTranscriptTimeoutRef.current);
                  }

                  outputTranscriptTimeoutRef.current = setTimeout(() => {
                    const finalText = outputTranscriptBufferRef.current.trim();
                    if (finalText) {
                      addTranscript('assistant', finalText);
                      outputTranscriptBufferRef.current = '';
                    }
                    // Clear streaming state after finalizing
                    setStreamingText(null);
                  }, transcriptDebounceMs);
                }
                break;

              case 'session_handle':
                sessionHandleRef.current = data.handle ?? null;
                break;

              case 'error':
                const errorMsg = data.message ?? 'Unknown error';
                setError(errorMsg);
                onError?.(errorMsg);
                break;

              case 'disconnected':
                setIsConnected(false);
                onConnectionChange?.(false);
                stopFrameCapture();
                stopMicCapture();
                break;
            }
          } catch (e) {
            console.error('Error parsing WebSocket message:', e);
          }
        };

        socket.onerror = () => {
          const errorMsg = 'Connection error';
          setError(errorMsg);
          setIsConnecting(false);
          onError?.(errorMsg);
        };

        socket.onclose = (event) => {
          setIsConnected(false);
          setIsConnecting(false);
          onConnectionChange?.(false);
          stopFrameCapture();
          stopMicCapture();

          // Attempt reconnect if unexpected close
          if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            const delay = Math.min(
              reconnectDelayRef.current * Math.pow(2, reconnectAttemptsRef.current - 1),
              10000
            );
            setTimeout(() => {
              connect(videoRef.current ?? undefined).catch(() => {
                if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                  const errorMsg = 'Failed to reconnect. Please refresh the page.';
                  setError(errorMsg);
                  onError?.(errorMsg);
                }
              });
            }, delay);
          } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            const errorMsg = 'Connection lost. Please refresh the page to reconnect.';
            setError(errorMsg);
            onError?.(errorMsg);
          }
        };
      } catch (err) {
        const errorMsg = 'Failed to connect to AI';
        setError(errorMsg);
        setIsConnecting(false);
        onError?.(errorMsg);
      }
    },
    [
      proxyUrl,
      sessionId,
      welcomeMessage,
      startFrameCapture,
      stopFrameCapture,
      startMicCapture,
      stopMicCapture,
      playAudio,
      addTranscript,
      transcriptDebounceMs,
      onConnectionChange,
      onError,
    ]
  );

  /** Disconnect from the proxy and clean up all resources */
  const disconnect = useCallback(() => {
    stopFrameCapture();
    stopMicCapture();

    // Clear audio queue and stop playback
    audioBufferRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);

    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }

    // Clear transcript timeouts and flush buffers
    if (inputTranscriptTimeoutRef.current) {
      clearTimeout(inputTranscriptTimeoutRef.current);
      inputTranscriptTimeoutRef.current = null;
    }
    if (outputTranscriptTimeoutRef.current) {
      clearTimeout(outputTranscriptTimeoutRef.current);
      outputTranscriptTimeoutRef.current = null;
    }
    inputTranscriptBufferRef.current = '';
    outputTranscriptBufferRef.current = '';
    setStreamingText(null);
    setStreamingUserText(null);

    if (socketRef.current) {
      socketRef.current.close(1000, 'User disconnected');
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setTranscripts([]);
    reconnectAttemptsRef.current = 0;
    reconnectDelayRef.current = 1000;
    onConnectionChange?.(false);
  }, [stopFrameCapture, stopMicCapture, onConnectionChange]);

  /** Send a text message to Gemini */
  const sendText = useCallback((text: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'text',
          text,
        })
      );
    }
  }, []);

  /** Set microphone muted state */
  const setMutedState = useCallback((muted: boolean) => {
    setIsMuted(muted);
  }, []);

  /** Clear all transcript entries */
  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    transcripts,
    isSpeaking,
    isMuted,
    streamingText,
    streamingUserText,
    connect,
    disconnect,
    sendText,
    setMuted: setMutedState,
    clearTranscripts,
  };
}
