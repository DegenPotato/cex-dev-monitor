import React, { ReactNode } from 'react';
import { useExperienceSettings, usePerformanceMetrics } from '../../contexts/ExperienceSettingsContext';

interface HudContainerProps {
  children: ReactNode;
  className?: string;
}

export const HudContainer: React.FC<HudContainerProps> = ({ children, className = '' }) => {
  const { settings } = useExperienceSettings();
  const { fps, frameTime } = usePerformanceMetrics();
  
  if (!settings.hudVisible) return null;
  
  return (
    <div className={`fixed inset-0 pointer-events-none z-50 ${className}`}>
      {/* Performance Metrics */}
      {settings.showFPS && (
        <div className="absolute top-4 right-4 glass-dark rounded-lg px-3 py-2 pointer-events-auto animate-in fade-in slide-in-from-top duration-300">
          <div className="font-mono text-xs space-y-1">
            <div className="text-cyber-cyan">
              FPS: <span className={fps < 30 ? 'text-alert-red' : fps < 50 ? 'text-plasma-yellow' : 'text-matrix-green'}>{fps}</span>
            </div>
            <div className="text-gray-400">Frame: {frameTime}ms</div>
          </div>
        </div>
      )}
      
      {/* Debug Info */}
      {settings.showDebugInfo && (
        <div className="absolute top-20 right-4 glass-dark rounded-lg px-3 py-2 pointer-events-auto animate-in fade-in slide-in-from-right duration-300">
          <div className="font-mono text-xs space-y-1 text-gray-400">
            <div>Quality: {settings.particleQuality}</div>
            <div>Bloom: {settings.bloomEnabled ? 'ON' : 'OFF'}</div>
            <div>Motion: {settings.reducedMotion ? 'REDUCED' : 'FULL'}</div>
            <div>Mode: {settings.performanceMode ? 'PERF' : 'QUALITY'}</div>
          </div>
        </div>
      )}
      
      {/* Safe area wrapper for mobile */}
      <div className="safe-top safe-bottom safe-left safe-right">
        {children}
      </div>
    </div>
  );
};
