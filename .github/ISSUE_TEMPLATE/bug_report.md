---
name: Bug report
about: Create a report to help us improve
title: ''
labels: bug
assignees: ''
---

## Describe the bug
A clear and concise description of what the bug is.

## To Reproduce
Steps to reproduce the behavior:
1. Call `connect()` with '...'
2. Speak into microphone
3. See error

## Expected behavior
A clear and concise description of what you expected to happen.

## Code snippet
```tsx
// Minimal code that reproduces the issue
const { connect, error } = useGeminiLive({
  proxyUrl: 'wss://...',
});
```

## Environment
- **Browser**: [e.g., Chrome 120, Safari 17, Firefox 121]
- **OS**: [e.g., macOS 14.2, Windows 11, iOS 17]
- **Package version**: [e.g., 0.1.0]
- **Proxy**: [e.g., Supabase Edge Functions, Cloudflare Workers]

## Console errors
```
Paste any relevant console errors here
```

## Additional context
Add any other context about the problem here. Screenshots or screen recordings are helpful for audio/visual issues.
