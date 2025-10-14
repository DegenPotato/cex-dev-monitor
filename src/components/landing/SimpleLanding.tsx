import { motion } from 'framer-motion';

interface SimpleLandingProps {
  onEnter: () => void;
}

export function SimpleLanding({ onEnter }: SimpleLandingProps) {
  return (
    <div className="w-screen h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center overflow-hidden relative">
      {/* Animated background particles */}
      <div className="absolute inset-0">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-cyan-400 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6">
        <motion.h1
          className="text-5xl md:text-7xl lg:text-8xl font-thin tracking-widest uppercase text-white mb-4"
          style={{ textShadow: '0 0 20px rgba(0,255,255,0.5)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          SNIFF AGENCY
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-purple-300 font-light tracking-wider mb-12"
          style={{ textShadow: '0 0 10px rgba(255,0,255,0.3)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          Follow the Money.
        </motion.p>

        <motion.button
          className="px-8 py-3 border border-cyan-400 text-cyan-400 rounded-full text-lg font-semibold bg-black/30 backdrop-blur-sm hover:bg-cyan-400 hover:text-black transition-all duration-300"
          style={{ boxShadow: '0 0 15px rgba(0, 255, 255, 0.5)' }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEnter}
        >
          Enter the Dashboard
        </motion.button>
      </div>
    </div>
  );
}
