export { useGeminiLive } from './useGeminiLive';
export { useScreenRecording } from './useScreenRecording';
export type {
  // Gemini Live types
  Transcript,
  UseGeminiLiveOptions,
  UseGeminiLiveReturn,
  ConnectionState,
  DebugLevel,
  DebugCallback,
  ToolDefinition,
  ToolCall,
  ToolCallHandler,
  ToolCallContext,
  // Browser Control types
  BrowserControlAction,
  BrowserControlCommand,
  BrowserControlResult,
  BrowserControlConfig,
  BrowserControlHandler,
  UICommandType,
  UICommand,
  UICommandHandler,
  // Screen Recording types
  UseScreenRecordingOptions,
  UseScreenRecordingReturn,
  RecordingState,
  RecordingResult,
  TimestampedScreenshot,
  // Session Recording types
  SessionEventType,
  SessionEvent,
  SessionRecording,
  RecordingConfig,
  // Workflow Builder types
  WorkflowStep,
  Workflow,
  WorkflowExecution,
  // Smart Element Detection types
  DetectedElement,
  SmartDetectionConfig,
  DetectionResult,
} from './types';

// Browser capability detection utilities
export {
  isIOS,
  isMobile,
  canScreenRecord,
  shouldUseCameraMode,
  getVideoMimeType,
  getRecommendedAudioConstraints,
} from './browserCapabilities';

// Captured Surface Control (Chrome 124+ scroll/zoom control for captured screens)
export {
  useCapturedSurfaceControl,
  isCapturedSurfaceControlSupported,
} from './useCapturedSurfaceControl';
export type {
  CapturedSurfaceControlState,
  ScrollByOptions,
  UseCapturedSurfaceControlReturn,
} from './useCapturedSurfaceControl';
