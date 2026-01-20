import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type {
  Transcript,
  UseGeminiLiveOptions,
  UseGeminiLiveReturn,
  ProxyMessage,
  ConnectionState,
  ConnectionMetrics,
  DebugLevel,
  DebugCallback,
  BrowserControlCommand,
  BrowserControlResult,
  UICommand,
  UICommandType,
  SessionEvent,
  SessionRecording,
  Workflow,
  WorkflowStep,
  WorkflowExecution,
  DetectedElement,
  DetectionResult,
  ToolCallContext,
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
    debug = false,
    reconnection,
    tools,
    onToolCall,
    vad = false,
    vadOptions,
    browserControl,
    onBrowserControl,
    onUICommand,
    recording,
    onRecordingEvent,
    smartDetection,
  } = options;

  // Reconnection config with defaults
  const maxReconnectAttempts = reconnection?.maxAttempts ?? 5;
  const initialReconnectDelay = reconnection?.initialDelay ?? 1000;
  const maxReconnectDelay = reconnection?.maxDelay ?? 10000;
  const reconnectBackoffFactor = reconnection?.backoffFactor ?? 2;

  // VAD config with defaults
  const vadThreshold = vadOptions?.threshold ?? 0.5;
  const vadMinSpeechDuration = vadOptions?.minSpeechDuration ?? 250;
  const vadSilenceDuration = vadOptions?.silenceDuration ?? 300;

  // Debug logging helper
  const log = useCallback(
    (level: DebugLevel, message: string, data?: unknown) => {
      if (!debug) return;
      if (typeof debug === 'function') {
        (debug as DebugCallback)(level, message, data);
      } else {
        const prefix = `[gemini-live] [${level}]`;
        if (data !== undefined) {
          console.log(prefix, message, data);
        } else {
          console.log(prefix, message);
        }
      }
    },
    [debug]
  );

  // Connection state machine - single source of truth
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');

  // Computed backwards-compatible booleans
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';

  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingUserText, setStreamingUserText] = useState<string | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectDelayRef = useRef(initialReconnectDelay);
  const sessionHandleRef = useRef<string | null>(null);

  // VAD refs
  const vadRef = useRef<unknown>(null);
  const vadAudioContextRef = useRef<AudioContext | null>(null);

  // Transcript accumulation - buffer chunks before creating transcript entries
  const inputTranscriptBufferRef = useRef<string>('');
  const outputTranscriptBufferRef = useRef<string>('');
  const inputTranscriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputTranscriptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Console errors buffer for browser control get_errors action
  const consoleErrorsRef = useRef<string[]>([]);

  // Audio refs - separate contexts for input (16kHz) and output (24kHz)
  const playbackContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  // Connection quality metrics
  const metricsRef = useRef<ConnectionMetrics>({
    audioChunksReceived: 0,
    messagesReceived: 0,
    reconnectCount: 0,
    lastConnectedAt: null,
    totalConnectedTime: 0,
  });

  // =============================================================================
  // Session Recording State
  // =============================================================================
  const [isRecording, setIsRecording] = useState(false);
  const recordingEventsRef = useRef<SessionEvent[]>([]);
  const recordingStartRef = useRef<number | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const domSnapshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // =============================================================================
  // Workflow Builder State
  // =============================================================================
  const [workflowExecution, setWorkflowExecution] = useState<WorkflowExecution | null>(null);
  const workflowRegistryRef = useRef<Map<string, Workflow>>(new Map());
  const workflowPausedRef = useRef(false);
  const workflowCancelledRef = useRef(false);

  // =============================================================================
  // Smart Element Detection State
  // =============================================================================
  const [detectedElements, setDetectedElements] = useState<DetectedElement[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // =============================================================================
  // Refs for ToolCallContext - allows accessing latest state in callbacks
  // =============================================================================
  const transcriptsRef = useRef<Transcript[]>([]);
  const streamingTextRef = useRef<string | null>(null);
  const streamingUserTextRef = useRef<string | null>(null);
  const isSpeakingRef = useRef(false);
  const isMutedRef = useRef(false);
  const connectionStateRef = useRef<ConnectionState>('idle');
  const workflowExecutionRef = useRef<WorkflowExecution | null>(null);
  const detectedElementsRef = useRef<DetectedElement[]>([]);

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
      // If speaker is muted, discard audio
      if (isSpeakerMuted) {
        audioBufferRef.current = [];
        return;
      }

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
    [parseSampleRate, resampleAudio, playBufferedAudio, minBufferSamples, isSpeakerMuted]
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

  // Track if user is speaking for VAD-controlled audio sending
  const isUserSpeakingRef = useRef(false);

  /**
   * Start microphone capture (16kHz input for Gemini).
   * Uses AudioWorklet for proper Float32 to Int16 PCM conversion.
   * Optionally uses VAD to only send audio when user is speaking.
   */
  const startMicCapture = useCallback(async () => {
    try {
      log('info', 'Starting microphone capture', { vad });

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
        // If VAD is enabled, only send audio when user is speaking
        if (vad && !isUserSpeakingRef.current) return;

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

      // Initialize VAD if enabled
      if (vad) {
        try {
          // Dynamically import VAD library (optional dependency)
          const vadModule = await import('@ricky0123/vad-web');
          log('info', 'Initializing VAD', { threshold: vadThreshold });

          const micVAD = await vadModule.MicVAD.new({
            stream,
            positiveSpeechThreshold: vadThreshold,
            minSpeechFrames: Math.ceil(vadMinSpeechDuration / 32), // ~32ms per frame
            redemptionFrames: Math.ceil(vadSilenceDuration / 32),
            onSpeechStart: () => {
              log('verbose', 'VAD: Speech started');
              isUserSpeakingRef.current = true;
              setIsUserSpeaking(true);
            },
            onSpeechEnd: () => {
              log('verbose', 'VAD: Speech ended');
              isUserSpeakingRef.current = false;
              setIsUserSpeaking(false);
            },
          });

          vadRef.current = micVAD;
          micVAD.start();
          log('info', 'VAD started');
        } catch (vadErr) {
          log('warn', 'VAD initialization failed (is @ricky0123/vad-web installed?)', {
            error: vadErr,
          });
          // Continue without VAD - audio will be sent continuously
        }
      }
    } catch (err) {
      console.error('Failed to start microphone:', err);
      log('error', 'Failed to start microphone', { error: err });
      const errorMsg = 'Failed to access microphone';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [isMuted, onError, vad, vadThreshold, vadMinSpeechDuration, vadSilenceDuration, log]);

  /** Stop microphone capture */
  const stopMicCapture = useCallback(() => {
    log('verbose', 'Stopping microphone capture');

    // Stop VAD if running
    if (vadRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (vadRef.current as any).destroy?.();
      } catch {
        // Ignore VAD cleanup errors
      }
      vadRef.current = null;
      isUserSpeakingRef.current = false;
      setIsUserSpeaking(false);
    }

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
  }, [log]);

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

  // =============================================================================
  // Browser Control - DOM Helper Functions
  // =============================================================================

  /**
   * Highlight an element in the DOM with a visual indicator
   */
  const highlightElement = useCallback(
    (selector: string, message?: string, duration = 3000) => {
      const el = document.querySelector(selector);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.className = 'gemini-live-highlight';
      const highlightColor = browserControl?.highlightStyle?.color || '#3b82f6';
      const borderWidth = browserControl?.highlightStyle?.borderWidth || 3;
      overlay.style.cssText = `
        position: fixed;
        top: ${rect.top - 4}px;
        left: ${rect.left - 4}px;
        width: ${rect.width + 8}px;
        height: ${rect.height + 8}px;
        border: ${borderWidth}px solid ${highlightColor};
        border-radius: 4px;
        pointer-events: none;
        z-index: 999999;
        box-shadow: 0 0 10px ${highlightColor}40;
        transition: opacity 0.3s ease;
      `;

      if (message) {
        const label = document.createElement('div');
        label.textContent = message;
        label.style.cssText = `
          position: absolute;
          top: -28px;
          left: 0;
          background: ${highlightColor};
          color: white;
          padding: 4px 8px;
          font-size: 12px;
          border-radius: 4px;
          white-space: nowrap;
        `;
        overlay.appendChild(label);
      }

      document.body.appendChild(overlay);

      const actualDuration = browserControl?.highlightStyle?.duration ?? duration;
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
      }, actualDuration);
    },
    [browserControl?.highlightStyle]
  );

  /**
   * Click an element in the DOM
   */
  const clickElement = useCallback(
    async (selector: string): Promise<BrowserControlResult> => {
      try {
        const el = document.querySelector(selector);
        if (!el) {
          return { success: false, error: `Element not found: ${selector}` };
        }
        (el as HTMLElement).click();
        return { success: true, message: `Clicked ${selector}` };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
    []
  );

  /**
   * Type text into an input element
   */
  const typeIntoElement = useCallback(
    async (selector: string, text: string, clear = true): Promise<BrowserControlResult> => {
      try {
        const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
        if (!el) {
          return { success: false, error: `Element not found: ${selector}` };
        }
        if (clear) {
          el.value = '';
        }
        el.value += text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, message: `Typed into ${selector}` };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
    []
  );

  /**
   * Scroll to an element or in a direction
   */
  const scrollTo = useCallback(
    (target: string | { direction: 'up' | 'down' | 'left' | 'right'; amount?: number }) => {
      if (typeof target === 'string') {
        document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const amount = target.amount || 300;
        const dir = target.direction;
        window.scrollBy({
          top: dir === 'down' ? amount : dir === 'up' ? -amount : 0,
          left: dir === 'right' ? amount : dir === 'left' ? -amount : 0,
          behavior: 'smooth',
        });
      }
    },
    []
  );

  /**
   * Serialize DOM structure for AI to understand page layout
   */
  const serializeDOM = useCallback(
    (root: Element | null, maxDepth: number, currentDepth = 0): unknown => {
      if (!root || currentDepth >= maxDepth) return null;

      const result: Record<string, unknown> = {
        tag: root.tagName.toLowerCase(),
        id: root.id || undefined,
        className: root.className || undefined,
      };

      // Include key attributes for interactive elements
      if (root instanceof HTMLInputElement) {
        result.type = root.type;
        result.value = root.value;
        result.placeholder = root.placeholder || undefined;
      } else if (root instanceof HTMLAnchorElement) {
        result.href = root.href;
        result.text = root.textContent?.trim().slice(0, 50);
      } else if (root instanceof HTMLButtonElement) {
        result.text = root.textContent?.trim().slice(0, 50);
      }

      // Add selector for AI to use
      if (root.id) {
        result.selector = `#${root.id}`;
      } else if (root.className) {
        const firstClass = root.className.split(' ')[0];
        result.selector = `${root.tagName.toLowerCase()}.${firstClass}`;
      }

      const children = Array.from(root.children)
        .map((child) => serializeDOM(child, maxDepth, currentDepth + 1))
        .filter(Boolean);

      if (children.length > 0) {
        result.children = children;
      }

      return result;
    },
    []
  );

  // =============================================================================
  // Session Recording Engine
  // =============================================================================

  /**
   * Record a session event
   */
  const recordEvent = useCallback(
    (type: SessionEvent['type'], data: unknown) => {
      if (!isRecording || !recordingStartRef.current) return;

      // Check recording config filters
      if (type === 'audio_chunk' && recording?.audio === false) return;
      if (type === 'frame_capture' && recording?.frames === false) return;
      if (type === 'dom_snapshot' && recording?.domSnapshots === false) return;

      const event: SessionEvent = {
        type,
        timestamp: Date.now() - recordingStartRef.current,
        data,
      };

      recordingEventsRef.current.push(event);
      onRecordingEvent?.(event);

      // Check max duration
      if (recording?.maxDuration && event.timestamp >= recording.maxDuration) {
        // Auto-stop recording
        setIsRecording(false);
      }
    },
    [isRecording, recording, onRecordingEvent]
  );

  /**
   * Start recording the session
   */
  const startRecording = useCallback(() => {
    if (isRecording) return;

    recordingIdRef.current = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    recordingStartRef.current = Date.now();
    recordingEventsRef.current = [];
    setIsRecording(true);

    log('info', 'Session recording started', { id: recordingIdRef.current });

    // Start DOM snapshot interval if enabled
    const snapshotInterval = recording?.snapshotInterval ?? 5000;
    if (recording?.domSnapshots !== false) {
      domSnapshotIntervalRef.current = setInterval(() => {
        const dom = serializeDOM(document.body, 3);
        recordEvent('dom_snapshot', { dom });
      }, snapshotInterval);
    }

    // Record initial connection state
    recordEvent('connection_change', { connected: isConnected, state: connectionState });
  }, [isRecording, recording, log, serializeDOM, recordEvent, isConnected, connectionState]);

  /**
   * Stop recording and return the recording data
   */
  const stopRecording = useCallback((): SessionRecording => {
    if (domSnapshotIntervalRef.current) {
      clearInterval(domSnapshotIntervalRef.current);
      domSnapshotIntervalRef.current = null;
    }

    const endTime = Date.now();
    const startTime = recordingStartRef.current || endTime;
    const recordingData: SessionRecording = {
      id: recordingIdRef.current || `rec_${Date.now()}`,
      startTime,
      endTime,
      events: [...recordingEventsRef.current],
    };

    log('info', 'Session recording stopped', {
      id: recordingData.id,
      eventCount: recordingData.events.length,
      duration: endTime - startTime,
    });

    setIsRecording(false);
    recordingEventsRef.current = [];
    recordingStartRef.current = null;
    recordingIdRef.current = null;

    return recordingData;
  }, [log]);

  /**
   * Export the current recording as a JSON blob
   */
  const exportRecording = useCallback((): Blob => {
    const recordingData: SessionRecording = {
      id: recordingIdRef.current || `rec_${Date.now()}`,
      startTime: recordingStartRef.current || Date.now(),
      endTime: isRecording ? undefined : Date.now(),
      events: [...recordingEventsRef.current],
    };

    return new Blob([JSON.stringify(recordingData, null, 2)], {
      type: 'application/json',
    });
  }, [isRecording]);

  // =============================================================================
  // Smart Element Detection Engine
  // =============================================================================

  /**
   * Detect elements on the current screen
   */
  const detectElements = useCallback(async (): Promise<DetectionResult> => {
    setIsDetecting(true);
    log('info', 'Starting element detection');

    try {
      // Collect all interactive elements from the DOM
      const interactiveSelectors = [
        'button',
        'a[href]',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])',
      ];

      const elements: DetectedElement[] = [];
      const seenBounds = new Set<string>();

      for (const selector of interactiveSelectors) {
        const domElements = document.querySelectorAll(selector);
        domElements.forEach((el, index) => {
          const rect = (el as HTMLElement).getBoundingClientRect();

          // Skip hidden or off-screen elements
          if (rect.width === 0 || rect.height === 0) return;
          if (rect.bottom < 0 || rect.top > window.innerHeight) return;
          if (rect.right < 0 || rect.left > window.innerWidth) return;

          // Skip duplicates based on bounds
          const boundsKey = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`;
          if (seenBounds.has(boundsKey)) return;
          seenBounds.add(boundsKey);

          // Determine element type
          let type: DetectedElement['type'] = 'unknown';
          const tagName = el.tagName.toLowerCase();
          if (tagName === 'button' || el.getAttribute('role') === 'button') {
            type = 'button';
          } else if (tagName === 'a') {
            type = 'link';
          } else if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
            type = 'input';
          } else if (tagName === 'img') {
            type = 'image';
          }

          // Generate selector
          let selectorStr = '';
          if (el.id) {
            selectorStr = `#${el.id}`;
          } else if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            selectorStr = classes ? `${tagName}.${classes}` : tagName;
          } else {
            selectorStr = `${tagName}:nth-of-type(${index + 1})`;
          }

          // Get text content
          const text = (el as HTMLElement).innerText?.trim().slice(0, 100) ||
                       el.getAttribute('aria-label') ||
                       el.getAttribute('title') ||
                       (el as HTMLInputElement).placeholder ||
                       '';

          elements.push({
            id: `det_${Date.now()}_${elements.length}`,
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            type,
            text: text || undefined,
            selector: selectorStr,
            confidence: 1.0, // DOM-based detection is deterministic
            description: `${type}: ${text || selectorStr}`,
          });
        });
      }

      // Highlight detected elements if configured
      if (smartDetection?.highlightDetections) {
        elements.forEach((element) => {
          if (element.selector) {
            highlightElement(element.selector, element.description, 2000);
          }
        });
      }

      const result: DetectionResult = {
        elements,
        timestamp: Date.now(),
      };

      setDetectedElements(elements);
      setIsDetecting(false);

      log('info', 'Element detection complete', { count: elements.length });

      // Record detection
      recordEvent('tool_result', { type: 'element_detection', count: elements.length });

      return result;
    } catch (err) {
      log('error', 'Element detection failed', { error: err });
      setIsDetecting(false);
      return { elements: [], timestamp: Date.now() };
    }
  }, [log, smartDetection, highlightElement, recordEvent]);

  /**
   * Click a detected element by ID
   */
  const clickDetectedElement = useCallback(
    async (elementId: string): Promise<BrowserControlResult> => {
      const element = detectedElements.find((e) => e.id === elementId);
      if (!element) {
        return { success: false, error: `Detected element not found: ${elementId}` };
      }

      // Try selector first
      if (element.selector) {
        const result = await clickElement(element.selector);
        if (result.success) {
          recordEvent('browser_control', {
            action: 'click',
            elementId,
            selector: element.selector,
          });
          return result;
        }
      }

      // Fallback to coordinate click
      const centerX = element.bounds.x + element.bounds.width / 2;
      const centerY = element.bounds.y + element.bounds.height / 2;
      const targetEl = document.elementFromPoint(centerX, centerY);

      if (targetEl) {
        (targetEl as HTMLElement).click();
        recordEvent('browser_control', {
          action: 'click',
          elementId,
          coordinates: { x: centerX, y: centerY },
        });
        return { success: true, message: `Clicked element at (${centerX}, ${centerY})` };
      }

      return { success: false, error: 'Could not find element to click' };
    },
    [detectedElements, clickElement, recordEvent]
  );

  /**
   * Send a browser control result back to the AI
   */
  const sendBrowserControlResult = useCallback(
    (toolCallId: string, result: BrowserControlResult) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        log('info', 'Sending browser control result', { toolCallId, result });
        socketRef.current.send(
          JSON.stringify({
            type: 'browser_control_result',
            toolCallId,
            result,
          })
        );
      }
    },
    [log]
  );

  /**
   * Execute a browser control command
   */
  const executeBrowserControl = useCallback(
    async (cmd: BrowserControlCommand): Promise<BrowserControlResult> => {
      try {
        switch (cmd.action) {
          case 'click': {
            return await clickElement(cmd.args.selector || '');
          }

          case 'type': {
            const el = document.querySelector(cmd.args.selector || '') as HTMLInputElement;
            if (!el) return { success: false, error: 'Element not found' };
            if (cmd.args.clear !== false) el.value = '';
            el.value += cmd.args.text || '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, message: `Typed into ${cmd.args.selector}` };
          }

          case 'scroll': {
            if (cmd.args.selector) {
              document.querySelector(cmd.args.selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              const amount = cmd.args.amount || 300;
              const dir = cmd.args.direction || 'down';
              window.scrollBy({
                top: dir === 'down' ? amount : dir === 'up' ? -amount : 0,
                left: dir === 'right' ? amount : dir === 'left' ? -amount : 0,
                behavior: 'smooth',
              });
            }
            return { success: true };
          }

          case 'highlight': {
            highlightElement(cmd.args.selector || '', cmd.args.message, cmd.args.duration);
            return { success: true };
          }

          case 'get_dom': {
            const root = document.querySelector(cmd.args.selector || 'body');
            const dom = serializeDOM(root, cmd.args.maxDepth || 5);
            return { success: true, data: dom };
          }

          case 'get_errors': {
            const limit = cmd.args.limit || 20;
            return { success: true, data: consoleErrorsRef.current.slice(-limit) };
          }

          default:
            return { success: false, error: `Unknown action: ${cmd.action}` };
        }
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
    [clickElement, highlightElement, serializeDOM]
  );

  /**
   * Execute a UI command (for autoExecuteUI mode)
   */
  const executeUICommand = useCallback(
    (cmd: UICommand) => {
      // Default UI command execution - can be enhanced
      switch (cmd.command) {
        case 'highlight_element':
          if (cmd.args.selector) {
            highlightElement(
              cmd.args.selector as string,
              cmd.args.message as string | undefined,
              cmd.args.duration as number | undefined
            );
          }
          break;
        case 'think_aloud':
          log('info', 'AI thinking aloud', { message: cmd.args.message });
          break;
        // Other UI commands would be handled by the onUICommand callback
        default:
          log('verbose', 'UI command received', { command: cmd.command, args: cmd.args });
      }
    },
    [highlightElement, log]
  );

  // =============================================================================
  // Workflow Builder Engine
  // =============================================================================

  /**
   * Register a workflow
   */
  const registerWorkflow = useCallback((workflow: Workflow) => {
    workflowRegistryRef.current.set(workflow.id, workflow);
    log('info', 'Workflow registered', { id: workflow.id, name: workflow.name });
  }, [log]);

  /**
   * Check a workflow condition
   */
  const checkCondition = useCallback(
    (condition: WorkflowStep['condition']): boolean => {
      if (!condition) return true;

      const element = document.querySelector(condition.selector);
      if (!element) return condition.check === 'exists' ? false : false;

      switch (condition.check) {
        case 'exists':
          return true;
        case 'visible': {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
        case 'contains_text':
          return element.textContent?.includes(condition.value || '') ?? false;
        default:
          return false;
      }
    },
    []
  );

  /**
   * Execute a single workflow step
   */
  const executeWorkflowStep = useCallback(
    async (
      step: WorkflowStep,
      variables: Record<string, unknown>
    ): Promise<{ result: BrowserControlResult; nextStepId?: string }> => {
      // Check condition if present
      if (step.condition && !checkCondition(step.condition)) {
        return {
          result: { success: false, error: 'Condition not met' },
          nextStepId: step.onError,
        };
      }

      switch (step.type) {
        case 'browser_control': {
          if (!step.action) {
            return { result: { success: false, error: 'No action specified' } };
          }
          const cmd: BrowserControlCommand = {
            toolCallId: `wf_${step.id}_${Date.now()}`,
            action: step.action,
            args: (step.args || {}) as BrowserControlCommand['args'],
          };
          const result = await executeBrowserControl(cmd);
          return {
            result,
            nextStepId: result.success
              ? (Array.isArray(step.next) ? step.next[0] : step.next)
              : step.onError,
          };
        }

        case 'wait': {
          await new Promise((resolve) => setTimeout(resolve, step.waitMs || 1000));
          return {
            result: { success: true, message: `Waited ${step.waitMs}ms` },
            nextStepId: Array.isArray(step.next) ? step.next[0] : step.next,
          };
        }

        case 'condition': {
          const conditionMet = checkCondition(step.condition);
          const nextSteps = Array.isArray(step.next) ? step.next : [step.next];
          return {
            result: { success: true, data: { conditionMet } },
            nextStepId: conditionMet ? nextSteps[0] : (nextSteps[1] || step.onError),
          };
        }

        case 'ai_prompt': {
          if (step.prompt && socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                type: 'text',
                text: step.prompt,
              })
            );
          }
          return {
            result: { success: true, message: 'AI prompt sent' },
            nextStepId: Array.isArray(step.next) ? step.next[0] : step.next,
          };
        }

        default:
          return { result: { success: false, error: `Unknown step type: ${step.type}` } };
      }
    },
    [checkCondition, executeBrowserControl]
  );

  /**
   * Execute a workflow by ID
   */
  const executeWorkflow = useCallback(
    async (id: string, initialVariables?: Record<string, unknown>): Promise<WorkflowExecution> => {
      const workflow = workflowRegistryRef.current.get(id);
      if (!workflow) {
        const execution: WorkflowExecution = {
          workflowId: id,
          status: 'failed',
          currentStepId: '',
          variables: {},
          history: [],
          error: `Workflow not found: ${id}`,
        };
        setWorkflowExecution(execution);
        return execution;
      }

      workflowPausedRef.current = false;
      workflowCancelledRef.current = false;

      const variables = { ...workflow.variables, ...initialVariables };
      const execution: WorkflowExecution = {
        workflowId: id,
        status: 'running',
        currentStepId: workflow.entryPoint,
        variables,
        history: [],
      };

      setWorkflowExecution(execution);
      log('info', 'Workflow execution started', { id, entryPoint: workflow.entryPoint });

      // Record workflow start
      recordEvent('tool_call', { type: 'workflow_start', workflowId: id });

      let currentStepId: string | undefined = workflow.entryPoint;

      while (currentStepId && !workflowCancelledRef.current) {
        // Check for pause
        while (workflowPausedRef.current && !workflowCancelledRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (workflowCancelledRef.current) break;

        const step = workflow.steps[currentStepId];
        if (!step) {
          execution.status = 'failed';
          execution.error = `Step not found: ${currentStepId}`;
          break;
        }

        execution.currentStepId = currentStepId;
        setWorkflowExecution({ ...execution });

        const { result, nextStepId } = await executeWorkflowStep(step, variables);

        execution.history.push({
          stepId: currentStepId,
          result,
          timestamp: Date.now(),
        });

        // Record step execution
        recordEvent('tool_result', {
          type: 'workflow_step',
          stepId: currentStepId,
          result,
        });

        if (!result.success && !step.onError) {
          execution.status = 'failed';
          execution.error = result.error;
          break;
        }

        currentStepId = nextStepId;
      }

      if (workflowCancelledRef.current) {
        execution.status = 'failed';
        execution.error = 'Workflow cancelled';
      } else if (execution.status === 'running') {
        execution.status = 'completed';
      }

      setWorkflowExecution({ ...execution });
      log('info', 'Workflow execution finished', {
        id,
        status: execution.status,
        stepsExecuted: execution.history.length,
      });

      return execution;
    },
    [log, executeWorkflowStep, recordEvent]
  );

  /**
   * Pause the current workflow
   */
  const pauseWorkflow = useCallback(() => {
    if (workflowExecution?.status === 'running') {
      workflowPausedRef.current = true;
      setWorkflowExecution((prev) =>
        prev ? { ...prev, status: 'paused' } : null
      );
      log('info', 'Workflow paused');
    }
  }, [workflowExecution, log]);

  /**
   * Resume a paused workflow
   */
  const resumeWorkflow = useCallback(() => {
    if (workflowExecution?.status === 'paused') {
      workflowPausedRef.current = false;
      setWorkflowExecution((prev) =>
        prev ? { ...prev, status: 'running' } : null
      );
      log('info', 'Workflow resumed');
    }
  }, [workflowExecution, log]);

  /**
   * Cancel the current workflow
   */
  const cancelWorkflow = useCallback(() => {
    if (workflowExecution?.status === 'running' || workflowExecution?.status === 'paused') {
      workflowCancelledRef.current = true;
      workflowPausedRef.current = false;
      log('info', 'Workflow cancellation requested');
    }
  }, [workflowExecution, log]);

  /**
   * Connect to the Gemini Live proxy
   */
  const connect = useCallback(
    async (videoElement?: HTMLVideoElement) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        log('verbose', 'Already connected, skipping');
        return;
      }

      log('info', 'Connecting to proxy', { proxyUrl, sessionId });
      setConnectionState('connecting');
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
          log('info', 'WebSocket opened');
          reconnectAttemptsRef.current = 0;

          // Send tool definitions to proxy if configured
          if (tools && tools.length > 0) {
            log('info', 'Sending tool definitions', { tools });
            socket.send(
              JSON.stringify({
                type: 'setup_tools',
                tools,
              })
            );
          }
        };

        socket.onmessage = (event) => {
          try {
            const data: ProxyMessage = JSON.parse(event.data);
            metricsRef.current.messagesReceived++;

            log('verbose', 'Received message', { type: data.type });

            // Inline recording helper that uses refs directly
            const record = (type: SessionEvent['type'], eventData: unknown) => {
              if (recordingStartRef.current) {
                const evt: SessionEvent = {
                  type,
                  timestamp: Date.now() - recordingStartRef.current,
                  data: eventData,
                };
                recordingEventsRef.current.push(evt);
                onRecordingEvent?.(evt);
              }
            };

            switch (data.type) {
              case 'setup_complete':
                log('info', 'Setup complete, starting audio capture');
                metricsRef.current.lastConnectedAt = Date.now();
                setConnectionState('connected');
                onConnectionChange?.(true);
                record('connection_change', { connected: true });
                if (videoRef.current) {
                  startFrameCapture();
                }
                startMicCapture();
                // Send welcome message to trigger AI greeting
                if (welcomeMessage && socketRef.current?.readyState === WebSocket.OPEN) {
                  log('verbose', 'Sending welcome message', { welcomeMessage });
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
                  metricsRef.current.audioChunksReceived++;
                  record('audio_chunk', { mimeType: data.mimeType, size: data.data.length });
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
                      record('transcript', { role: 'user', text: finalText });
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
                      record('transcript', { role: 'assistant', text: finalText });
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
                log('error', 'Received error', { message: errorMsg });
                record('error', { message: errorMsg });
                setError(errorMsg);
                setConnectionState('error');
                onError?.(errorMsg);
                break;

              case 'disconnected':
                log('info', 'Server disconnected', { reason: data.reason });
                record('connection_change', { connected: false, reason: data.reason });
                setConnectionState('disconnected');
                onConnectionChange?.(false);
                stopFrameCapture();
                stopMicCapture();
                break;

              case 'tool_call': {
                // Check if it's a UI command
                const uiCommands: UICommandType[] = [
                  'highlight_element',
                  'show_action_button',
                  'update_checklist',
                  'think_aloud',
                  'ask_user',
                  'run_diagnostic',
                  'escalate_to_human',
                ];

                if (data.toolCallId && data.toolName && uiCommands.includes(data.toolName as UICommandType)) {
                  // Handle as UI command
                  const uiCommand: UICommand = {
                    toolCallId: data.toolCallId,
                    command: data.toolName as UICommandType,
                    args: data.args || {},
                  };

                  log('info', 'Received UI command', { command: uiCommand });
                  record('ui_command', { command: uiCommand.command, args: uiCommand.args });

                  if (browserControl?.autoExecuteUI) {
                    executeUICommand(uiCommand);
                  }

                  onUICommand?.(uiCommand);
                } else if (data.toolCallId && data.toolName && onToolCall) {
                  // Handle as regular tool call
                  log('info', 'Received tool call', {
                    id: data.toolCallId,
                    name: data.toolName,
                    args: data.args,
                  });
                  record('tool_call', { id: data.toolCallId, name: data.toolName, args: data.args });
                  const args = data.args ?? {};

                  // Build context with current state (read from refs for freshness)
                  const toolCallContext: ToolCallContext = {
                    transcripts: transcriptsRef.current,
                    streamingText: streamingTextRef.current,
                    streamingUserText: streamingUserTextRef.current,
                    isConnected: connectionStateRef.current === 'connected',
                    isSpeaking: isSpeakingRef.current,
                    isMuted: isMutedRef.current,
                    sendText,
                    executeWorkflow,
                    detectElements,
                    clickDetectedElement,
                    clickElement,
                    typeIntoElement,
                    highlightElement,
                    workflowExecution: workflowExecutionRef.current,
                    detectedElements: detectedElementsRef.current,
                  };

                  // Call the handler and send result back
                  Promise.resolve(onToolCall(data.toolName, args, toolCallContext))
                    .then((result) => {
                      record('tool_result', { id: data.toolCallId, result });
                      if (socketRef.current?.readyState === WebSocket.OPEN) {
                        log('info', 'Sending tool result', {
                          id: data.toolCallId,
                          result,
                        });
                        socketRef.current.send(
                          JSON.stringify({
                            type: 'tool_result',
                            toolCallId: data.toolCallId,
                            result,
                          })
                        );
                      }
                    })
                    .catch((err) => {
                      log('error', 'Tool call error', { error: err });
                      record('tool_result', { id: data.toolCallId, error: String(err) });
                      if (socketRef.current?.readyState === WebSocket.OPEN) {
                        socketRef.current.send(
                          JSON.stringify({
                            type: 'tool_result',
                            toolCallId: data.toolCallId,
                            result: { error: String(err) },
                          })
                        );
                      }
                    });
                }
                break;
              }

              case 'browser_control': {
                // AI wants to control the browser
                if (data.toolCallId && data.action) {
                  const bcCommand: BrowserControlCommand = {
                    toolCallId: data.toolCallId,
                    action: data.action,
                    args: (data.args as BrowserControlCommand['args']) || {},
                  };

                  log('info', 'Received browser control command', { command: bcCommand });
                  record('browser_control', { action: bcCommand.action, args: bcCommand.args });

                  if (browserControl?.autoExecute) {
                    // Auto-execute and send result back
                    executeBrowserControl(bcCommand).then((result) => {
                      sendBrowserControlResult(bcCommand.toolCallId, result);
                    });
                  } else if (onBrowserControl) {
                    // Let dev handle it
                    const result = onBrowserControl(bcCommand);
                    if (result instanceof Promise) {
                      result.then((r) => r && sendBrowserControlResult(bcCommand.toolCallId, r));
                    } else if (result) {
                      sendBrowserControlResult(bcCommand.toolCallId, result);
                    }
                  }
                }
                break;
              }
            }
          } catch (e) {
            console.error('Error parsing WebSocket message:', e);
          }
        };

        socket.onerror = () => {
          const errorMsg = 'Connection error';
          log('error', 'WebSocket error');
          setError(errorMsg);
          setConnectionState('error');
          onError?.(errorMsg);
        };

        socket.onclose = (event) => {
          log('info', 'WebSocket closed', { code: event.code, reason: event.reason });
          onConnectionChange?.(false);
          stopFrameCapture();
          stopMicCapture();

          // Attempt reconnect if unexpected close
          if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            metricsRef.current.reconnectCount++;
            const delay = Math.min(
              reconnectDelayRef.current * Math.pow(reconnectBackoffFactor, reconnectAttemptsRef.current - 1),
              maxReconnectDelay
            );
            log('info', 'Scheduling reconnect', {
              attempt: reconnectAttemptsRef.current,
              maxAttempts: maxReconnectAttempts,
              delayMs: delay,
            });
            setConnectionState('reconnecting');
            setTimeout(() => {
              connect(videoRef.current ?? undefined).catch(() => {
                if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                  const errorMsg = 'Failed to reconnect. Please refresh the page.';
                  log('error', 'Max reconnect attempts reached');
                  setError(errorMsg);
                  setConnectionState('error');
                  onError?.(errorMsg);
                }
              });
            }, delay);
          } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            const errorMsg = 'Connection lost. Please refresh the page to reconnect.';
            log('error', 'Connection lost after max attempts');
            setError(errorMsg);
            setConnectionState('error');
            onError?.(errorMsg);
          } else {
            // Normal close (code 1000)
            setConnectionState('disconnected');
          }
        };
      } catch (err) {
        const errorMsg = 'Failed to connect to AI';
        log('error', 'Connection failed', { error: err });
        setError(errorMsg);
        setConnectionState('error');
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
      log,
      tools,
      onToolCall,
      maxReconnectAttempts,
      maxReconnectDelay,
      reconnectBackoffFactor,
      browserControl,
      onBrowserControl,
      onUICommand,
      executeBrowserControl,
      executeUICommand,
      sendBrowserControlResult,
    ]
  );

  /** Disconnect from the proxy and clean up all resources */
  const disconnect = useCallback(() => {
    log('info', 'Disconnecting');

    // Update total connected time
    if (metricsRef.current.lastConnectedAt !== null) {
      metricsRef.current.totalConnectedTime +=
        Date.now() - metricsRef.current.lastConnectedAt;
      metricsRef.current.lastConnectedAt = null;
    }

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

    // Clean up VAD
    if (vadAudioContextRef.current) {
      vadAudioContextRef.current.close();
      vadAudioContextRef.current = null;
    }
    vadRef.current = null;
    setIsUserSpeaking(false);

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

    // Clean up recording DOM snapshot interval
    if (domSnapshotIntervalRef.current) {
      clearInterval(domSnapshotIntervalRef.current);
      domSnapshotIntervalRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close(1000, 'User disconnected');
      socketRef.current = null;
    }
    setConnectionState('idle');
    setTranscripts([]);
    reconnectAttemptsRef.current = 0;
    reconnectDelayRef.current = initialReconnectDelay;
    onConnectionChange?.(false);
  }, [stopFrameCapture, stopMicCapture, onConnectionChange, log, initialReconnectDelay]);

  /** Manually retry connection after error or disconnect */
  const retry = useCallback(async () => {
    if (connectionState === 'error' || connectionState === 'disconnected') {
      reconnectAttemptsRef.current = 0;
      reconnectDelayRef.current = initialReconnectDelay;
      setError(null);
      await connect(videoRef.current ?? undefined);
    }
  }, [connectionState, connect, initialReconnectDelay]);

  /** Send a text message to Gemini */
  const sendText = useCallback(
    (text: string) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        log('verbose', 'Sending text message', { text });
        socketRef.current.send(
          JSON.stringify({
            type: 'text',
            text,
          })
        );
      }
    },
    [log]
  );

  /** Send a tool result back to Gemini */
  const sendToolResult = useCallback(
    (toolCallId: string, result: unknown) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        log('info', 'Sending tool result', { toolCallId, result });
        socketRef.current.send(
          JSON.stringify({
            type: 'tool_result',
            toolCallId,
            result,
          })
        );
      }
    },
    [log]
  );

  /** Set microphone muted state */
  const setMutedState = useCallback((muted: boolean) => {
    setIsMuted(muted);
  }, []);

  /** Set speaker muted state */
  const setSpeakerMutedState = useCallback((muted: boolean) => {
    setIsSpeakerMuted(muted);
    if (muted) {
      audioBufferRef.current = []; // Clear any pending audio
    }
  }, []);

  /** Clear all transcript entries */
  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  /** Get connection quality metrics */
  const getMetrics = useCallback((): ConnectionMetrics => {
    return { ...metricsRef.current };
  }, []);

  // =============================================================================
  // Sync refs for ToolCallContext (keeps state accessible in callbacks)
  // =============================================================================
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  useEffect(() => {
    streamingUserTextRef.current = streamingUserText;
  }, [streamingUserText]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    workflowExecutionRef.current = workflowExecution;
  }, [workflowExecution]);

  useEffect(() => {
    detectedElementsRef.current = detectedElements;
  }, [detectedElements]);

  // Capture console errors for browser control get_errors action
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      consoleErrorsRef.current.push(args.map(String).join(' '));
      // Keep only last 100 errors
      if (consoleErrorsRef.current.length > 100) {
        consoleErrorsRef.current = consoleErrorsRef.current.slice(-100);
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
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
    connectionState,
    error,
    transcripts,
    isSpeaking,
    isMuted,
    isSpeakerMuted,
    streamingText,
    streamingUserText,
    isUserSpeaking,
    connect,
    disconnect,
    retry,
    sendText,
    sendToolResult,
    setMuted: setMutedState,
    setSpeakerMuted: setSpeakerMutedState,
    clearTranscripts,
    getMetrics,
    // Browser control helpers
    highlightElement,
    clickElement,
    typeIntoElement,
    scrollTo,
    sendBrowserControlResult,
    // Session Recording
    startRecording,
    stopRecording,
    isRecording,
    exportRecording,
    // Workflow Builder
    registerWorkflow,
    executeWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    cancelWorkflow,
    workflowExecution,
    // Smart Element Detection
    detectElements,
    clickDetectedElement,
    detectedElements,
    isDetecting,
  };
}
