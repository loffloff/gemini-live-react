// =============================================================================
// Browser Control Types
// =============================================================================

/** Browser control action types */
export type BrowserControlAction =
  | 'click'
  | 'type'
  | 'scroll'
  | 'highlight'
  | 'get_dom'
  | 'get_errors';

/** Browser control command from AI */
export interface BrowserControlCommand {
  toolCallId: string;
  action: BrowserControlAction;
  args: {
    selector?: string;
    text?: string;
    message?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    duration?: number;
    clear?: boolean;
    maxDepth?: number;
    limit?: number;
    confirmMessage?: string;
  };
}

/** UI command types */
export type UICommandType =
  | 'highlight_element'
  | 'show_action_button'
  | 'update_checklist'
  | 'think_aloud'
  | 'ask_user'
  | 'run_diagnostic'
  | 'escalate_to_human';

/** UI command from AI */
export interface UICommand {
  toolCallId: string;
  command: UICommandType;
  args: Record<string, unknown>;
}

/** Browser control configuration */
export interface BrowserControlConfig {
  /** Auto-execute browser commands (default: false) */
  autoExecute?: boolean;
  /** Auto-execute UI commands (default: false) */
  autoExecuteUI?: boolean;
  /** Custom highlight styles */
  highlightStyle?: {
    color?: string;
    borderWidth?: number;
    duration?: number;
  };
  /** Require confirmation for destructive actions */
  confirmDestructive?: boolean;
}

/** Result of a browser control action */
export interface BrowserControlResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

// =============================================================================
// Screen Recording Types
// =============================================================================

/**
 * A screenshot captured during recording with timestamp metadata
 */
export interface TimestampedScreenshot {
  /** Base64-encoded JPEG image data */
  image: string;
  /** Seconds from recording start */
  timestamp: number;
  /** Formatted time string (e.g., "1:30") */
  formattedTime: string;
}

/**
 * Current state of the screen recording
 */
export interface RecordingState {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Whether recording is paused */
  isPaused: boolean;
  /** Recording duration in seconds */
  duration: number;
  /** Error message if recording failed */
  error: string | null;
}

/**
 * Result returned when stopping a recording
 */
export interface RecordingResult {
  /** Recorded video as a Blob */
  videoBlob: Blob;
  /** All captured screenshots during the recording */
  screenshots: TimestampedScreenshot[];
  /** Separate microphone audio as a Blob (if available) */
  audioBlob?: Blob;
}

/**
 * Configuration options for useScreenRecording hook
 */
export interface UseScreenRecordingOptions {
  /**
   * Interval between automatic screenshot captures (ms)
   * @default 2000
   */
  screenshotInterval?: number;

  /**
   * Maximum number of screenshots to keep (rolling window)
   * @default 30
   */
  maxScreenshots?: number;

  /**
   * JPEG quality for screenshots (0-1)
   * @default 0.8
   */
  screenshotQuality?: number;

  /**
   * Custom constraints for microphone audio capture
   * @default { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
   */
  audioConstraints?: MediaTrackConstraints;
}

/**
 * Return value from useScreenRecording hook
 */
export interface UseScreenRecordingReturn {
  /** Current recording state */
  state: RecordingState;

  /**
   * Start screen or camera recording
   * @param useCameraMode - Use camera instead of screen capture (for mobile fallback)
   */
  startRecording: (useCameraMode?: boolean) => Promise<void>;

  /**
   * Stop recording and return the results
   * @returns Recording result with video, audio, and screenshots
   */
  stopRecording: () => Promise<RecordingResult | null>;

  /** Pause the current recording */
  pauseRecording: () => void;

  /** Resume a paused recording */
  resumeRecording: () => void;

  /**
   * Get the video element used for capture
   * Pass this to useGeminiLive's connect() for live streaming
   */
  getVideoElement: () => HTMLVideoElement | null;

  /** Get the current media stream */
  getStream: () => MediaStream | null;

  /** Get the most recent automatically captured screenshot */
  getLatestScreenshot: () => string | null;

  /** Capture a screenshot immediately (on-demand) */
  captureScreenshotNow: () => string | null;
}

// =============================================================================
// Session Recording Types
// =============================================================================

/** Session recording event types */
export type SessionEventType =
  | 'connection_change'
  | 'transcript'
  | 'audio_chunk'
  | 'frame_capture'
  | 'tool_call'
  | 'tool_result'
  | 'browser_control'
  | 'ui_command'
  | 'dom_snapshot'
  | 'error';

/** Individual session event */
export interface SessionEvent {
  type: SessionEventType;
  timestamp: number;
  data: unknown;
}

/** Complete session recording */
export interface SessionRecording {
  id: string;
  startTime: number;
  endTime?: number;
  events: SessionEvent[];
  metadata?: Record<string, unknown>;
}

/** Recording configuration */
export interface RecordingConfig {
  /** Record audio streams (default: true) */
  audio?: boolean;
  /** Record screen frames (default: true) */
  frames?: boolean;
  /** Record DOM snapshots (default: true) */
  domSnapshots?: boolean;
  /** Snapshot interval in ms (default: 5000) */
  snapshotInterval?: number;
  /** Max recording duration in ms (default: unlimited) */
  maxDuration?: number;
}

// =============================================================================
// Workflow Builder Types
// =============================================================================

/** Single step in a workflow */
export interface WorkflowStep {
  id: string;
  type: 'browser_control' | 'wait' | 'condition' | 'ai_prompt';
  action?: BrowserControlAction;
  args?: Record<string, unknown>;
  /** Wait duration in ms */
  waitMs?: number;
  /** Condition to check before proceeding */
  condition?: {
    selector: string;
    check: 'exists' | 'visible' | 'contains_text';
    value?: string;
  };
  /** Prompt for AI to execute */
  prompt?: string;
  /** Next step ID (or array for branching) */
  next?: string | string[];
  /** Error handler step ID */
  onError?: string;
}

/** Complete workflow definition */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  entryPoint: string;
  steps: Record<string, WorkflowStep>;
  variables?: Record<string, unknown>;
}

/** Workflow execution state */
export interface WorkflowExecution {
  workflowId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStepId: string;
  variables: Record<string, unknown>;
  history: Array<{
    stepId: string;
    result: BrowserControlResult;
    timestamp: number;
  }>;
  error?: string;
}

// =============================================================================
// Smart Element Detection Types
// =============================================================================

/** Detected element from visual analysis */
export interface DetectedElement {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  type: 'button' | 'input' | 'link' | 'text' | 'image' | 'unknown';
  text?: string;
  selector?: string;
  confidence: number;
  description?: string;
}

/** Detection configuration */
export interface SmartDetectionConfig {
  enabled?: boolean;
  autoDetect?: boolean;
  highlightDetections?: boolean;
}

/** Detection result */
export interface DetectionResult {
  elements: DetectedElement[];
  timestamp: number;
}

// =============================================================================
// Gemini Live Types
// =============================================================================

/**
 * Debug log levels for categorizing log messages
 */
export type DebugLevel = 'info' | 'warn' | 'error' | 'verbose';

/**
 * Debug callback function signature
 */
export type DebugCallback = (level: DebugLevel, message: string, data?: unknown) => void;

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
 * Definition of a tool that can be called by the AI
 */
export interface ToolDefinition {
  /** Unique name for this tool */
  name: string;
  /** Description of what this tool does (helps AI decide when to use it) */
  description: string;
  /**
   * JSON Schema for the tool's parameters
   * @example { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
   */
  parameters?: Record<string, unknown>;
}

/**
 * A tool call request from the AI
 */
export interface ToolCall {
  /** Unique ID for this tool call (use when sending results back) */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

/**
 * Callback function signature for handling tool calls
 * Return the result to send back to the AI
 */
export type ToolCallHandler = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<unknown> | unknown;

/**
 * Callback for handling browser control commands from AI
 * Return a result to send back, or undefined to use default handling
 */
export type BrowserControlHandler = (
  command: BrowserControlCommand
) => Promise<BrowserControlResult> | BrowserControlResult | void;

/**
 * Callback for handling UI commands from AI
 */
export type UICommandHandler = (command: UICommand) => void;

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

  /**
   * Enable debug logging to help diagnose issues
   * - true: logs to console
   * - DebugCallback: custom logging function
   * @default false
   */
  debug?: boolean | DebugCallback;

  /**
   * Reconnection configuration
   */
  reconnection?: {
    /** Maximum number of reconnection attempts @default 5 */
    maxAttempts?: number;
    /** Initial delay in ms before first reconnection @default 1000 */
    initialDelay?: number;
    /** Maximum delay in ms between reconnections @default 10000 */
    maxDelay?: number;
    /** Multiplier for exponential backoff @default 2 */
    backoffFactor?: number;
  };

  /**
   * Tools/functions that the AI can call
   * Tool definitions are forwarded to Gemini via the proxy
   */
  tools?: ToolDefinition[];

  /**
   * Callback fired when the AI requests a tool call
   * Return the result to send back to the AI
   */
  onToolCall?: ToolCallHandler;

  /**
   * Enable Voice Activity Detection
   * Only sends audio when user is speaking, reducing bandwidth
   * @default false
   */
  vad?: boolean;

  /**
   * VAD configuration options
   */
  vadOptions?: {
    /** Speech probability threshold (0-1) @default 0.5 */
    threshold?: number;
    /** Minimum speech duration in ms before triggering @default 250 */
    minSpeechDuration?: number;
    /** Duration of silence before ending speech @default 300 */
    silenceDuration?: number;
  };

  /**
   * Browser control configuration
   * Enables AI to manipulate DOM elements and read page state
   */
  browserControl?: BrowserControlConfig;

  /**
   * Callback fired when the AI sends a browser control command
   * Return a result to send back, or undefined to let auto-execute handle it
   */
  onBrowserControl?: BrowserControlHandler;

  /**
   * Callback fired when the AI sends a UI command
   * (highlight_element, show_action_button, update_checklist, etc.)
   */
  onUICommand?: UICommandHandler;

  /**
   * Enable session recording
   */
  recording?: RecordingConfig;

  /**
   * Callback when recording event occurs
   */
  onRecordingEvent?: (event: SessionEvent) => void;

  /**
   * Smart element detection configuration
   */
  smartDetection?: SmartDetectionConfig;
}

/**
 * Connection state machine states
 */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'disconnected';

/**
 * Connection quality metrics
 */
export interface ConnectionMetrics {
  /** Number of audio chunks received from AI */
  audioChunksReceived: number;
  /** Total number of WebSocket messages received */
  messagesReceived: number;
  /** Number of reconnection attempts made */
  reconnectCount: number;
  /** Timestamp when last connected (null if not connected) */
  lastConnectedAt: number | null;
  /** Total time spent connected in milliseconds */
  totalConnectedTime: number;
}

/**
 * Return value from useGeminiLive hook
 */
export interface UseGeminiLiveReturn {
  /** Whether currently connected to the proxy */
  isConnected: boolean;

  /** Whether currently attempting to connect */
  isConnecting: boolean;

  /**
   * Unified connection state machine
   * Provides more granular state than isConnected/isConnecting
   */
  connectionState: ConnectionState;

  /** Whether the AI is currently speaking (audio playing) */
  isSpeaking: boolean;

  /** Whether microphone input is muted */
  isMuted: boolean;

  /** Whether AI audio output is muted */
  isSpeakerMuted: boolean;

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

  /** Manually retry connection after error or disconnect */
  retry: () => Promise<void>;

  /**
   * Send a text message to Gemini (in addition to voice)
   */
  sendText: (text: string) => void;

  /** Set microphone muted state */
  setMuted: (muted: boolean) => void;

  /** Set speaker muted state (mutes AI audio output) */
  setSpeakerMuted: (muted: boolean) => void;

  /** Clear all transcript entries */
  clearTranscripts: () => void;

  /**
   * Send a tool result back to the AI
   * @param toolCallId - The ID from the tool call
   * @param result - The result to send back
   */
  sendToolResult: (toolCallId: string, result: unknown) => void;

  /**
   * Whether the user is currently speaking (VAD detected voice activity)
   * Only available when vad: true
   */
  isUserSpeaking: boolean;

  /** Get connection quality metrics */
  getMetrics: () => ConnectionMetrics;

  /**
   * Highlight an element in the DOM with a visual indicator
   * @param selector - CSS selector for the element
   * @param message - Optional label to display with the highlight
   * @param duration - Duration in ms before highlight disappears (default: 3000)
   */
  highlightElement: (selector: string, message?: string, duration?: number) => void;

  /**
   * Click an element in the DOM
   * @param selector - CSS selector for the element to click
   */
  clickElement: (selector: string) => Promise<BrowserControlResult>;

  /**
   * Type text into an input element
   * @param selector - CSS selector for the input element
   * @param text - Text to type
   * @param clear - Whether to clear existing value first (default: true)
   */
  typeIntoElement: (selector: string, text: string, clear?: boolean) => Promise<BrowserControlResult>;

  /**
   * Scroll to an element or in a direction
   * @param target - CSS selector or direction object
   */
  scrollTo: (target: string | { direction: 'up' | 'down' | 'left' | 'right'; amount?: number }) => void;

  /**
   * Send a browser control result back to the AI
   * @param toolCallId - The ID from the browser control command
   * @param result - The result to send back
   */
  sendBrowserControlResult: (toolCallId: string, result: BrowserControlResult) => void;

  // =============================================================================
  // Session Recording
  // =============================================================================

  /** Start recording the session */
  startRecording: () => void;

  /** Stop recording and return data */
  stopRecording: () => SessionRecording;

  /** Whether currently recording */
  isRecording: boolean;

  /** Export recording as JSON blob */
  exportRecording: () => Blob;

  // =============================================================================
  // Workflow Builder
  // =============================================================================

  /** Register a workflow */
  registerWorkflow: (workflow: Workflow) => void;

  /** Execute a workflow by ID */
  executeWorkflow: (id: string, variables?: Record<string, unknown>) => Promise<WorkflowExecution>;

  /** Pause current workflow */
  pauseWorkflow: () => void;

  /** Resume paused workflow */
  resumeWorkflow: () => void;

  /** Cancel current workflow */
  cancelWorkflow: () => void;

  /** Current workflow state */
  workflowExecution: WorkflowExecution | null;

  // =============================================================================
  // Smart Element Detection
  // =============================================================================

  /** Request AI to detect elements on current screen */
  detectElements: () => Promise<DetectionResult>;

  /** Click detected element by ID */
  clickDetectedElement: (elementId: string) => Promise<BrowserControlResult>;

  /** Latest detection results */
  detectedElements: DetectedElement[];

  /** Detection in progress */
  isDetecting: boolean;
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
  | 'tool_result'
  | 'browser_control';

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
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  /** Browser control action (for browser_control messages) */
  action?: BrowserControlAction;
}

/**
 * Message types sent from client to proxy
 * @internal
 */
export type ClientMessageType = 'frame' | 'audio' | 'text' | 'tool_result' | 'setup_tools' | 'browser_control_result';

/**
 * Message from client to proxy
 * @internal
 */
export interface ClientMessage {
  type: ClientMessageType;
  data?: string;
  mimeType?: string;
  text?: string;
  toolCallId?: string;
  result?: unknown;
  tools?: ToolDefinition[];
}
