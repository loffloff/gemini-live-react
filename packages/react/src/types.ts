/**
 * A transcript entry representing either user speech or AI response
 */
export interface Transcript {
  /** Unique identifier for this transcript entry */
  id: string;
  /** Who said this - 'user' for mic input, 'assistant' for AI */
  role: 'user' | 'assistant';
  /** The transcribed text */
  text: string;
  /** When this transcript was created */
  timestamp: Date;
}

/**
 * Configuration options for useGeminiLive hook
 */
export interface UseGeminiLiveOptions {
  /**
   * WebSocket URL of your Gemini Live proxy server
   * @example 'wss://your-project.supabase.co/functions/v1/gemini-live-proxy'
   */
  proxyUrl: string;

  /**
   * Optional session ID passed to the proxy as a query parameter
   * Useful for identifying sessions or loading custom configurations
   */
  sessionId?: string;

  /**
   * Optional message sent to AI immediately after connection to trigger a greeting
   * @example 'Please greet the user warmly and ask how you can help them today.'
   */
  welcomeMessage?: string;

  /**
   * Callback fired when a new transcript entry is finalized
   * Transcripts are debounced - this fires after 1.5s of silence
   */
  onTranscript?: (transcript: Transcript) => void;

  /**
   * Callback fired when an error occurs
   */
  onError?: (error: string) => void;

  /**
   * Callback fired when connection state changes
   */
  onConnectionChange?: (connected: boolean) => void;

  /**
   * Minimum audio buffer (in milliseconds) before playback starts
   * Higher values = smoother audio but more latency
   * @default 200
   */
  minBufferMs?: number;

  /**
   * Debounce time (in milliseconds) for grouping transcript chunks
   * @default 1500
   */
  transcriptDebounceMs?: number;
}

/**
 * Return value from useGeminiLive hook
 */
export interface UseGeminiLiveReturn {
  /** Whether currently connected to the proxy */
  isConnected: boolean;

  /** Whether currently attempting to connect */
  isConnecting: boolean;

  /** Whether the AI is currently speaking (audio playing) */
  isSpeaking: boolean;

  /** Whether microphone input is muted */
  isMuted: boolean;

  /** Current error message, if any */
  error: string | null;

  /** All transcript entries from the session */
  transcripts: Transcript[];

  /**
   * AI's current partial transcript (real-time, before debounce finalizes)
   * null when AI is not currently speaking or transcript is finalized
   */
  streamingText: string | null;

  /**
   * User's current partial transcript (real-time, before debounce finalizes)
   * null when user is not currently speaking or transcript is finalized
   */
  streamingUserText: string | null;

  /**
   * Connect to the Gemini Live proxy
   * @param videoElement - Optional video element for screen sharing
   */
  connect: (videoElement?: HTMLVideoElement) => Promise<void>;

  /** Disconnect from the proxy and clean up resources */
  disconnect: () => void;

  /**
   * Send a text message to Gemini (in addition to voice)
   */
  sendText: (text: string) => void;

  /** Set microphone muted state */
  setMuted: (muted: boolean) => void;

  /** Clear all transcript entries */
  clearTranscripts: () => void;
}

/**
 * Message types sent from the proxy to the client
 * @internal
 */
export type ProxyMessageType =
  | 'setup_complete'
  | 'response'
  | 'audio'
  | 'turn_complete'
  | 'input_transcription'
  | 'output_transcription'
  | 'session_handle'
  | 'error'
  | 'disconnected'
  | 'tool_call'
  | 'tool_result';

/**
 * Message from proxy to client
 * @internal
 */
export interface ProxyMessage {
  type: ProxyMessageType;
  text?: string;
  data?: string;
  mimeType?: string;
  message?: string;
  reason?: string;
  handle?: string;
  resumable?: boolean;
  tool?: string;
  query?: string;
  found?: boolean;
  answer?: string;
}

/**
 * Message types sent from client to proxy
 * @internal
 */
export type ClientMessageType = 'frame' | 'audio' | 'text';

/**
 * Message from client to proxy
 * @internal
 */
export interface ClientMessage {
  type: ClientMessageType;
  data?: string;
  mimeType?: string;
  text?: string;
}
