import { useState, useEffect } from 'react';
import Scene from './landing/Scene';
import Overlay from './landing/Overlay';

export function LandingPage() {
  const [isEntering, setIsEntering] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    if (isEntering) {
      const timer = setTimeout(() => {
        setHasEntered(true);
        // Redirect to dashboard after animation
        window.location.href = '/dashboard';
      }, 4000); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isEntering]);

  if (hasEntered) {
    // Show loading state during redirect
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="text-center text-cyan-400">
          <div className="text-2xl font-light tracking-wider animate-pulse">
            Entering Dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="w-screen h-screen bg-black">
      <Scene isEntering={isEntering} />
      <Overlay isEntering={isEntering} onEnter={() => setIsEntering(true)} />
    </main>
  );
}
