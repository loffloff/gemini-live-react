# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
