/**
 * Browser and device capability detection utilities
 *
 * These utilities help apps adapt to different browser capabilities,
 * particularly for mobile/iOS where screen recording isn't available.
 */

/** Check if running on iOS device */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !('MSStream' in window);
}

/** Check if running on mobile device */
export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent);
}

/** Check if screen recording is supported */
export function canScreenRecord(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/**
 * Check if camera mode should be used instead of screen recording.
 * Returns true on mobile devices without screen capture support.
 */
export function shouldUseCameraMode(): boolean {
  return !canScreenRecord() && isMobile();
}

/**
 * Get recommended video MIME type for this browser.
 * iOS Safari prefers MP4, most others prefer WebM.
 */
export function getVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';

  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/mp4',  // iOS Safari
    'video/webm'
  ];

  return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

/**
 * Get recommended audio constraints for optimal quality across devices.
 * Includes echo cancellation, noise suppression, and auto gain control.
 */
export function getRecommendedAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000,  // Gemini expects 16kHz
  };
}
