'use client';
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [prompt,    setPrompt]    = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) { setInstalled(true); return; }

    // Pick up event captured before React hydration
    const early = (window as any).__pwaInstallPrompt as BeforeInstallPromptEvent | null;
    if (early) setPrompt(early);

    function onPrompt(e: Event) {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
      setPrompt(e as BeforeInstallPromptEvent);
    }
    function onReady() {
      const p = (window as any).__pwaInstallPrompt as BeforeInstallPromptEvent | null;
      if (p) setPrompt(p);
    }
    function onInstalled() {
      setInstalled(true);
      setPrompt(null);
      (window as any).__pwaInstallPrompt = null;
    }

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('pwa:ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('pwa:ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
    (window as any).__pwaInstallPrompt = null;
  }

  return { canInstall: !!prompt && !installed, install, installed };
}
