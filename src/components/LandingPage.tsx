import { useState, useEffect } from 'react';
import { BlackholeScene } from './landing/BlackholeScene';
import { SolarSystemScene } from './landing/SolarSystemScene';
import { MatrixSkynetScene } from './landing/MatrixSkynetScene';
import { BlackWhiteHoleMetricSimulation } from './landing/BlackWhiteHoleMetricSimulation';
import { InformationTopologySimulation } from './landing/InformationTopologySimulation';
import { MultilayerSpacetimeSimulation } from './landing/MultilayerSpacetimeSimulation';
import { HigherDimensionalNetworkSimulation } from './landing/HigherDimensionalNetworkSimulation';
import { Dashboard } from './Dashboard';
import { useAuth } from '../contexts/AuthContext';

export function LandingPage() {
  const { user } = useAuth();
  const [currentUniverse, setCurrentUniverse] = useState<'blackhole' | 'solar' | 'matrix' | 'dashboard' | 'simulation' | 'infotopo' | 'multilayer' | 'hyperdim'>('blackhole');
  
  // Debug logging for state changes
  useEffect(() => {
    console.log('🎭 LandingPage - Current Universe:', currentUniverse);
  }, [currentUniverse]);

  const handleEnterVortex = (selectedUniverse?: string) => {
    console.log('🌀 handleEnterVortex called with:', selectedUniverse);
    
    // If a universe was specifically selected, go there
    if (selectedUniverse === 'spaces-manager') {
      // Redirect to Spaces Manager (external app)
      console.log('🌌 Redirecting to Spaces Manager...');
      window.location.href = 'https://spaces-manager.example.com'; // Update with actual URL
      return;
    } else if (selectedUniverse === 'matrix') {
      console.log('🔮 Entering The Matrix...');
      setCurrentUniverse('matrix');
    } else if (selectedUniverse === 'simulation') {
      console.log('🌌 Entering Metric Simulation...');
      setCurrentUniverse('simulation');
    } else if (selectedUniverse === 'infotopo') {
      console.log('🔮 Entering Information Topology...');
      setCurrentUniverse('infotopo');
    } else if (selectedUniverse === 'multilayer') {
      console.log('🌊 Entering Multilayer Spacetime...');
      setCurrentUniverse('multilayer');
    } else if (selectedUniverse === 'hyperdim') {
      console.log('🔮 Entering Higher Dimensional Network...');
      setCurrentUniverse('hyperdim');
    } else if (selectedUniverse === 'cex-monitor') {
      console.log('📊 Redirecting to Dashboard...');
      // Redirect to /dashboard after animation
      window.location.href = '/dashboard';
      return; // Prevent any state updates
    } else {
      // Default behavior when no specific universe selected
      console.log('⚠️ No universe specified, defaulting to Dashboard');
      setCurrentUniverse('dashboard');
    }
  };

  // Check if user is super_admin
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <main className="w-screen h-screen bg-black relative">
      {/* Black Hole Universe - ENTRY PORTAL */}
      {currentUniverse === 'blackhole' && (
        <BlackholeScene onEnter={handleEnterVortex} />
      )}

      {/* CEX Dashboard - SUPER ADMIN ONLY */}
      {currentUniverse === 'dashboard' && (
        <>
          <Dashboard />
          
          {/* Navigation Options */}
          <div className="absolute top-8 left-8 space-y-2 z-50">
            {/* Return through wormhole */}
            <button
              onClick={() => setCurrentUniverse('blackhole')}
              className="block px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 
                         border border-purple-500/30 rounded-lg text-purple-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              🌀 Return to Entry Portal
            </button>
            
            {/* Access Solar System Demo */}
            <button
              onClick={() => setCurrentUniverse('solar')}
              className="block px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 
                         border border-blue-500/30 rounded-lg text-blue-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              🪐 Solar System Demo
            </button>
            
            {/* Access Black-White Hole Simulation */}
            <button
              onClick={() => setCurrentUniverse('simulation')}
              className="block px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 
                         border border-cyan-500/30 rounded-lg text-cyan-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              🌌 Metric Simulation
            </button>
          </div>
        </>
      )}

      {/* Solar System Universe - Demo for friends */}
      {currentUniverse === 'solar' && (
        <>
          <SolarSystemScene />
          
          {/* Navigation Options */}
          <div className="absolute top-8 left-8 space-y-2 z-50">
            {/* Return through wormhole */}
            <button
              onClick={() => setCurrentUniverse('blackhole')}
              className="block px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 
                         border border-purple-500/30 rounded-lg text-purple-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              🌀 Return to Entry Portal
            </button>
            
            {/* Access CEX Dashboard - ONLY for super_admins */}
            {isSuperAdmin && (
              <button
                onClick={() => setCurrentUniverse('dashboard')}
                className="block px-4 py-2 bg-green-600/20 hover:bg-green-600/40 
                           border border-green-500/30 rounded-lg text-green-300 font-bold 
                           transition-all duration-300 hover:scale-105"
              >
                📊 CEX Dashboard
              </button>
            )}
            
            {/* Access Black-White Hole Simulation */}
            <button
              onClick={() => setCurrentUniverse('simulation')}
              className="block px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 
                         border border-cyan-500/30 rounded-lg text-cyan-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              🌌 Metric Simulation
            </button>
          </div>
        </>
      )}
      
      {/* Matrix Skynet Universe - SUPER ADMIN DATA COMMAND CENTER */}
      {currentUniverse === 'matrix' && (
        <>
          <MatrixSkynetScene onBack={() => setCurrentUniverse('blackhole')} />
          {/* Debug indicator */}
          <div className="fixed bottom-4 left-4 bg-green-500/20 border border-green-500 px-4 py-2 rounded text-green-300 text-sm z-[9999]">
            🔮 Matrix Universe Active
          </div>
        </>
      )}
      
      {/* Black-White Hole Metric Simulation */}
      {currentUniverse === 'simulation' && (
        <>
          <BlackWhiteHoleMetricSimulation />
          <button
            onClick={() => setCurrentUniverse('blackhole')}
            className="absolute top-4 left-4 z-50 px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg backdrop-blur-sm transition-colors"
          >
            🌀 Return to Entry Portal
          </button>
        </>
      )}
      
      {/* Information Topology Simulation */}
      {currentUniverse === 'infotopo' && (
        <>
          <InformationTopologySimulation />
          <button
            onClick={() => setCurrentUniverse('blackhole')}
            className="absolute top-4 right-4 z-50 px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg backdrop-blur-sm transition-colors"
          >
            🌀 Return to Entry Portal
          </button>
        </>
      )}
      
      {/* Multilayer Spacetime Simulation */}
      {currentUniverse === 'multilayer' && (
        <>
          <MultilayerSpacetimeSimulation />
          <button
            onClick={() => setCurrentUniverse('blackhole')}
            className="absolute bottom-4 left-4 z-50 px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg backdrop-blur-sm transition-colors"
          >
            🌀 Return to Entry Portal
          </button>
        </>
      )}
      
      {/* Higher Dimensional Network Simulation */}
      {currentUniverse === 'hyperdim' && (
        <>
          <HigherDimensionalNetworkSimulation />
          <button
            onClick={() => setCurrentUniverse('blackhole')}
            className="absolute bottom-4 right-4 z-50 px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg backdrop-blur-sm transition-colors"
          >
            🌀 Return to Entry Portal
          </button>
        </>
      )}
    </main>
  );
}
