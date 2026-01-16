export { useGeminiLive } from './useGeminiLive';
export type {
  Transcript,
  UseGeminiLiveOptions,
  UseGeminiLiveReturn,
  ConnectionState,
  DebugLevel,
  DebugCallback,
  ToolDefinition,
  ToolCall,
  ToolCallHandler,
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
