import { useState } from 'react';
import { BlackholeScene } from './landing/BlackholeScene';
import { SolarSystemScene } from './landing/SolarSystemScene';

export function LandingPage() {
  const [currentUniverse, setCurrentUniverse] = useState<'blackhole' | 'solar' | 'select'>('blackhole');

  const handleEnterVortex = () => {
    // Instead of going to dashboard, enter the Solar System universe
    setCurrentUniverse('solar');
  };

  const handleSelectUniverse = (universe: 'blackhole' | 'solar') => {
    setCurrentUniverse(universe);
  };

  return (
    <main className="w-screen h-screen bg-black relative">
      {/* Black Hole Universe (CEX Monitor) */}
      {currentUniverse === 'blackhole' && (
        <>
          <BlackholeScene onEnter={handleEnterVortex} />
          
          {/* Universe Selector Button */}
          <button
            onClick={() => setCurrentUniverse('select')}
            className="absolute top-8 left-8 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 
                       border border-purple-500/30 rounded-lg text-purple-300 font-bold 
                       transition-all duration-300 hover:scale-105 z-50"
          >
            🌌 Switch Universe
          </button>
        </>
      )}

      {/* Solar System Universe (Spaces Manager) */}
      {currentUniverse === 'solar' && (
        <>
          <SolarSystemScene />
          
          {/* Back to Black Hole Button */}
          <button
            onClick={() => setCurrentUniverse('blackhole')}
            className="absolute top-20 left-8 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 
                       border border-purple-500/30 rounded-lg text-purple-300 font-bold 
                       transition-all duration-300 hover:scale-105 z-50"
          >
            🌀 Back to Black Hole
          </button>
          
          {/* Go to Dashboard Button */}
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="absolute top-32 left-8 px-4 py-2 bg-green-600/20 hover:bg-green-600/40 
                       border border-green-500/30 rounded-lg text-green-300 font-bold 
                       transition-all duration-300 hover:scale-105 z-50"
          >
            📊 CEX Dashboard
          </button>
        </>
      )}

      {/* Universe Selector Screen */}
      {currentUniverse === 'select' && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
          <div className="max-w-6xl mx-auto p-8">
            <h1 className="text-5xl font-bold text-center mb-2 text-white">
              Choose Your Universe
            </h1>
            <p className="text-xl text-center mb-12 text-gray-400">
              Select which monitoring system to enter
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Black Hole Universe */}
              <button
                onClick={() => handleSelectUniverse('blackhole')}
                className="group relative bg-gradient-to-b from-purple-900/20 to-black border border-purple-500/30 
                           rounded-xl p-8 hover:scale-105 transition-all duration-500 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/0 via-purple-600/20 to-purple-600/0 
                                translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                
                <div className="relative z-10">
                  <div className="text-6xl mb-4">🌀</div>
                  <h2 className="text-2xl font-bold text-purple-400 mb-2">Black Hole Universe</h2>
                  <h3 className="text-lg text-cyan-300 mb-4">CEX DEV MONITOR</h3>
                  <p className="text-gray-400 mb-6">
                    Track development wallets, analyze on-chain activity, and monitor token deployments 
                    through the gravitational lens of the blockchain singularity.
                  </p>
                  <ul className="text-left text-sm text-gray-500 space-y-1">
                    <li>• Dev wallet tracking</li>
                    <li>• Token deployment analysis</li>
                    <li>• On-chain activity monitoring</li>
                    <li>• Pump.fun integration</li>
                  </ul>
                </div>
              </button>

              {/* Solar System Universe */}
              <button
                onClick={() => handleSelectUniverse('solar')}
                className="group relative bg-gradient-to-b from-yellow-900/20 to-black border border-yellow-500/30 
                           rounded-xl p-8 hover:scale-105 transition-all duration-500 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-600/0 via-yellow-600/20 to-yellow-600/0 
                                translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                
                <div className="relative z-10">
                  <div className="text-6xl mb-4">☀️</div>
                  <h2 className="text-2xl font-bold text-yellow-400 mb-2">Solar System Universe</h2>
                  <h3 className="text-lg text-orange-300 mb-4">SPACES MANAGER</h3>
                  <p className="text-gray-400 mb-6">
                    Manage livestream spaces as planets in a solar system, with users as asteroids, 
                    super chats as comets, and interactive 3D visualization.
                  </p>
                  <ul className="text-left text-sm text-gray-500 space-y-1">
                    <li>• Live streaming management</li>
                    <li>• 3D user visualization</li>
                    <li>• Reward mechanics</li>
                    <li>• Interactive space navigation</li>
                  </ul>
                </div>
              </button>
            </div>
            
            <button
              onClick={() => setCurrentUniverse('blackhole')}
              className="mt-8 text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back to landing
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
