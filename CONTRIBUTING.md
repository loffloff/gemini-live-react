# Contributing to gemini-live-react

Thanks for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/loffloff/gemini-live-react.git
   cd gemini-live-react
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the packages**
   ```bash
   npm run build
   ```

4. **Run in watch mode** (for development)
   ```bash
   npm run dev
   ```

## Project Structure

```
gemini-live-react/
├── packages/
│   ├── react/           # Main React hook (published to npm)
│   │   └── src/
│   │       ├── useGeminiLive.ts  # Core hook implementation
│   │       └── types.ts          # TypeScript definitions
│   └── proxy-deno/      # Supabase Edge Function proxy
├── examples/
│   ├── basic-voice-chat/
│   └── screen-share-assistant/
└── docs/
```

## Making Changes

### Before You Start

1. Check existing [issues](https://github.com/loffloff/gemini-live-react/issues) to avoid duplicating work
2. For significant changes, open an issue first to discuss the approach

### Development Workflow

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add TypeScript types for new features
   - Update documentation as needed

3. **Test your changes**
   - Test on Chrome, Firefox, and Safari
   - Test with different audio sample rates (44.1kHz, 48kHz)
   - Run the build to catch type errors:
     ```bash
     npm run build
     npm run lint
     ```

4. **Commit your changes**
   - Use clear, descriptive commit messages
   - Reference issue numbers when applicable

5. **Submit a Pull Request**
   - Fill out the PR template completely
   - Link related issues
   - Add screenshots/videos for UI changes

## Code Style

### TypeScript

- Use strict TypeScript (no `any` unless absolutely necessary)
- Export types that consumers might need
- Add JSDoc comments for public APIs

### React Hook Patterns

When adding new options:
1. Add the type to `UseGeminiLiveOptions` in `types.ts`
2. Destructure with a default value in `useGeminiLive()`
3. Add to the dependency array if used in callbacks
4. Clear state on disconnect if needed

When adding new return values:
1. Add the type to `UseGeminiLiveReturn` in `types.ts`
2. Create state with `useState`
3. Add to the return object
4. Export the type from `index.ts`

### Proxy Changes

- Maintain backwards compatibility when possible
- Log meaningful messages for debugging
- Handle errors gracefully

## Testing

Currently testing is manual. When testing:

1. **Audio quality**
   - No clicks, pops, or gaps
   - Proper resampling (no pitch shifting)
   - Echo cancellation working

2. **Connection handling**
   - Clean connect/disconnect cycles
   - Proper reconnection on network issues
   - Error states display correctly

3. **Cross-browser**
   - Chrome (primary)
   - Firefox
   - Safari
   - Mobile browsers (if applicable)

## Documentation

- Update README.md for user-facing changes
- Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/) format
- Update CLAUDE.md for architectural changes
- Add inline comments for complex logic

## Questions?

- Open a [Discussion](https://github.com/loffloff/gemini-live-react/discussions) for questions
- Open an [Issue](https://github.com/loffloff/gemini-live-react/issues) for bugs or feature requests

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
