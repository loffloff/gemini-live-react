# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Session Recording & Replay** - Record everything that happens in a session:
  - `startRecording()` / `stopRecording()` / `exportRecording()` methods
  - `isRecording` state
  - `recording` config option with filters for audio, frames, DOM snapshots
  - `onRecordingEvent` callback for real-time event streaming
  - 10 event types: `connection_change`, `transcript`, `audio_chunk`, `frame_capture`, `tool_call`, `tool_result`, `browser_control`, `ui_command`, `dom_snapshot`, `error`
  - Export as JSON blob for debugging, analysis, or training
- **Workflow Builder** - Define multi-step automations AI can execute:
  - `registerWorkflow()` / `executeWorkflow()` methods
  - `pauseWorkflow()` / `resumeWorkflow()` / `cancelWorkflow()` controls
  - `workflowExecution` state tracking
  - 4 step types: `browser_control`, `wait`, `condition`, `ai_prompt`
  - Branching logic with `next` arrays and `onError` handlers
  - Variable passing between steps
- **Smart Element Detection** - Detect interactive elements without selectors:
  - `detectElements()` returns all visible interactive elements
  - `clickDetectedElement(id)` clicks by element ID
  - `detectedElements` / `isDetecting` states
  - `smartDetection` config with `highlightDetections` option
  - Detects: buttons, inputs, links, text, images
  - Auto-generates selectors, falls back to coordinate clicks

## [0.2.1] - 2025-01-16

### Added
- **Browser Capability Utilities** - Detection functions for mobile/iOS support:
  - `isIOS()` - Check if running on iOS device
  - `isMobile()` - Check if running on mobile device
  - `canScreenRecord()` - Check if screen recording is supported
  - `shouldUseCameraMode()` - Check if camera fallback should be used
  - `getVideoMimeType()` - Get recommended video MIME type for browser
  - `getRecommendedAudioConstraints()` - Get optimized audio constraints
- Mobile usage guide (`docs/MOBILE.md`) with:
  - Camera fallback patterns for iOS
  - Video element setup (`playsInline` attribute)
  - Audio optimization tips
  - Codec considerations
  - Common issues and solutions
- Mobile Support section in README

## [0.2.0] - 2025-01-16

### Added
- **Debug/Logging Mode** - `debug` option accepts `true` or custom callback for diagnosing issues
- **Connection State Machine** - `connectionState` provides unified state (`idle`, `connecting`, `connected`, `reconnecting`, `error`, `disconnected`)
- **Tool/Function Calling** - `tools` and `onToolCall` for AI-driven function execution
- **Voice Activity Detection (VAD)** - `vad` option to only send audio when speaking (requires `@ricky0123/vad-web`)
- **Configurable Reconnection** - `reconnection` options for `maxAttempts`, `initialDelay`, `maxDelay`, `backoffFactor`
- `sendToolResult()` method for manually sending tool results
- `isUserSpeaking` state for VAD feedback
- CONTRIBUTING.md - Contributor guidelines
- CODE_OF_CONDUCT.md - Community standards

### Changed
- Reconnection logic now uses configurable options instead of hardcoded values
- Proxy now forwards tool configurations to Gemini setup

## [0.1.1] - 2025-01-15

### Added
- `streamingText` - Real-time partial transcript of AI speech before debounce finalizes
- `streamingUserText` - Real-time partial transcript of user speech before debounce finalizes
- `welcomeMessage` option - Auto-send a prompt to trigger AI greeting on connect
- CLAUDE.md - Documentation for AI assistants
- TROUBLESHOOTING.md - Common issues and solutions
- GitHub issue templates (bug report, feature request)
- Pull request template

### Changed
- Updated README with production example link

## [0.1.0] - 2025-01-14

### Added
- Initial release
- `useGeminiLive` React hook for real-time voice communication
- Bidirectional audio streaming (16kHz input, 24kHz output)
- Audio resampling from Gemini's 24kHz to browser sample rate
- Transcript accumulation with configurable debounce
- Screen sharing support via video element
- Auto-reconnect with exponential backoff
- Session resumption support
- Mute/unmute functionality
- Supabase Edge Function proxy (Deno)
- TypeScript type definitions
- Basic examples
