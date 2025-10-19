import { createPortal } from 'react-dom';
import { MusicManager } from './MusicManager';

interface MusicManagerPortalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicManagerPortal({ isOpen, onClose }: MusicManagerPortalProps) {
  if (!isOpen) return null;
  
  // Render the MusicManager directly to document.body using a portal
  return createPortal(
    <MusicManager isOpen={isOpen} onClose={onClose} />,
    document.body
  );
}
