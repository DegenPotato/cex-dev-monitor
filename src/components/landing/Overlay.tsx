import { motion, AnimatePresence } from 'framer-motion';

interface OverlayProps {
  isEntering: boolean;
  onEnter: () => void;
}

const Overlay: React.FC<OverlayProps> = ({ isEntering, onEnter }) => {
  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-center items-center">
      <AnimatePresence>
        {!isEntering && (
          <motion.div
            className="text-center text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
          >
            <motion.h1
              className="text-5xl md:text-7xl lg:text-8xl font-thin tracking-widest uppercase"
              style={{ textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 40px #00ffff' }}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.5 }}
            >
              SNIFF AGENCY
            </motion.h1>
            <motion.p
              className="mt-4 text-lg md:text-xl text-magenta-500 font-light tracking-wider"
              style={{ textShadow: '0 0 5px #f0f, 0 0 10px #f0f' }}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1.5, delay: 1 }}
            >
              Follow the Money.
            </motion.p>
            <motion.button
              className="pointer-events-auto mt-12 px-8 py-3 border border-cyan-400 text-cyan-400 rounded-full text-lg font-semibold bg-black bg-opacity-30 backdrop-blur-sm hover:bg-cyan-400 hover:text-black transition-all duration-300"
              style={{ boxShadow: '0 0 15px rgba(0, 255, 255, 0.5)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: 2 }}
              onClick={onEnter}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Enter the Dashboard
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Overlay;
