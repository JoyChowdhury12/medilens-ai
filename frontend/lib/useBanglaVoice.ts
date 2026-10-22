'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reads Bangla text aloud with the browser's own speech engine (nothing is sent to any service by us).
 * `supported` is true only when this device has a Bangla voice, so the button is hidden otherwise.
 */
export function useBanglaVoice() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const pick = () => {
      voice.current = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('bn')) ?? null;
      setSupported(!!voice.current);
    };
    pick();
    synth.addEventListener?.('voiceschanged', pick);
    return () => { synth.removeEventListener?.('voiceschanged', pick); synth.cancel(); };
  }, []);

  const stop = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);

  const speak = useCallback((texts: string[]) => {
    const synth = window.speechSynthesis;
    if (!synth || !voice.current) return;
    synth.cancel();
    // Short pieces: some browsers stop reading long paragraphs half way.
    const parts = texts.flatMap((t) => t.split(/(?<=[।.?!])\s+/)).filter((p) => p.trim());
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.voice = voice.current; u.lang = voice.current!.lang; u.rate = 0.95;
      if (i === parts.length - 1) { u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false); }
      synth.speak(u);
    });
    setSpeaking(parts.length > 0);
  }, []);

  return { supported, speaking, speak, stop };
}
