import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CommitmentLevel = 'processing' | 'confirmed' | 'finalized';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'turbo';

interface TradingSettings {
  // Commitment settings
  commitmentLevel: CommitmentLevel;
  
  // Default priority level
  defaultPriorityLevel: PriorityLevel;
  
  // Slippage settings
  defaultSlippage: number; // in percentage
  
  // Auto-approve settings (future)
  autoApproveUnder?: number; // Auto-approve trades under X SOL
  
  // Actions
  setCommitmentLevel: (level: CommitmentLevel) => void;
  setDefaultPriorityLevel: (level: PriorityLevel) => void;
  setDefaultSlippage: (slippage: number) => void;
  resetToDefaults: () => void;
}

const defaultSettings = {
  commitmentLevel: 'confirmed' as CommitmentLevel,
  defaultPriorityLevel: 'low' as PriorityLevel,
  defaultSlippage: 1, // 1%
};

export const useTradingSettingsStore = create<TradingSettings>()(
  persist(
    (set) => ({
      ...defaultSettings,
      
      setCommitmentLevel: (level) => set({ commitmentLevel: level }),
      setDefaultPriorityLevel: (level) => set({ defaultPriorityLevel: level }),
      setDefaultSlippage: (slippage) => set({ defaultSlippage: slippage }),
      
      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'trading-settings', // LocalStorage key
    }
  )
);
