let activeRecognition = null;
let recognitionResolve = null;
export let recognitionLastError = '';

export function isSpeechApiAvailable() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function hasActiveWebSpeech() {
  return !!activeRecognition;
}

export function startWebSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition;
  try {
    recognition = new SR();
  } catch (err) {
    console.warn('Web Speech API constructor failed:', err);
    return false;
  }

  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';
  let lastInterimTranscript = '';
  recognitionLastError = '';

  function bestTranscriptSoFar() {
    const fin = finalTranscript.trim();
    if (fin) return fin;
    return lastInterimTranscript.trim();
  }

  const result = new Promise(resolve => {
    recognitionResolve = resolve;
    recognition.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript || '';
        if (e.results[i].isFinal) {
          finalTranscript += `${piece} `;
        } else {
          lastInterimTranscript = piece;
        }
      }
    };
    recognition.onerror = e => {
      const code = String(e?.error || '');
      console.warn('Speech recognition error:', code || e);
      recognitionLastError = code;
      if (code.toLowerCase() === 'aborted') return;
      if (recognitionResolve) {
        const r = recognitionResolve;
        recognitionResolve = null;
        r(bestTranscriptSoFar());
      }
    };
    recognition.onend = () => {
      if (recognitionResolve) {
        const r = recognitionResolve;
        recognitionResolve = null;
        r(bestTranscriptSoFar());
      }
    };
  });

  try {
    recognition.start();
    activeRecognition = { recognition, result };
    return true;
  } catch (err) {
    console.warn('Web Speech API start() failed:', err);
    activeRecognition = null;
    recognitionResolve = null;
    return false;
  }
}

export async function stopWebSpeech() {
  if (!activeRecognition) return '';
  const { recognition, result } = activeRecognition;
  activeRecognition = null;
  try { recognition.stop(); } catch { /* ignore */ }
  return await result;
}
