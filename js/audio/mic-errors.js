export function explainMicFailure(err) {
  const name = String(err?.name || '').toLowerCase();
  if (!window.isSecureContext) {
    return '❌ Microphone requires a secure context (HTTPS).';
  }
  if (name === 'notallowederror' || name === 'securityerror') {
    return '❌ Microphone blocked by browser permissions or iframe policy. If embedded, ensure iframe allows microphone.';
  }
  if (name === 'notfounderror') {
    return '❌ No microphone device found on this system.';
  }
  if (name === 'notreadableerror' || name === 'aborterror') {
    return '❌ Microphone is busy or unavailable. Close other apps using the mic and try again.';
  }
  return '❌ Could not start microphone. Check browser/site mic permissions and try again.';
}
