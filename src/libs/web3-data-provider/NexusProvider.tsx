'use client';
import {
  type EthereumProvider,
  type NexusNetwork,
  type OnAllowanceHookData,
  type OnIntentHookData,
  type OnSwapIntentHookData,
  type SupportedChainsAndTokensResult,
  type SupportedChainsResult,
  type UserAsset,
  NexusSDK,
} from '@avail-project/nexus-core';
import {
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAccount, useAccountEffect } from 'wagmi';

interface NexusContextType {
  nexusSDK: NexusSDK | null;
  bridgableBalance: UserAsset[] | null;
  swapBalance: UserAsset[] | null;
  intent: RefObject<OnIntentHookData | null>;
  allowance: RefObject<OnAllowanceHookData | null>;
  swapIntent: RefObject<OnSwapIntentHookData | null>;
  exchangeRate: Record<string, number> | null;
  supportedChainsAndTokens: SupportedChainsAndTokensResult | null;
  swapSupportedChainsAndTokens: SupportedChainsResult | null;
  network?: NexusNetwork;
  loading: boolean;
  handleInit: (provider: EthereumProvider) => Promise<void>;
  fetchBridgableBalance: () => Promise<void>;
  fetchSwapBalance: () => Promise<void>;
  getFiatValue: (amount: number, token: string) => number;
  initializeNexus: (provider: EthereumProvider) => Promise<void>;
  deinitializeNexus: () => Promise<void>;
  attachEventHooks: () => void;
}

const NexusContext = createContext<NexusContextType | undefined>(undefined);

type NexusProviderProps = {
  children: React.ReactNode;
  config?: {
    network?: NexusNetwork;
    debug?: boolean;
  };
};

const defaultConfig: Required<NexusProviderProps['config']> = {
  network: 'mainnet',
  debug: true,
};

const NexusProvider = ({ children, config = defaultConfig }: NexusProviderProps) => {
  const { isConnected, connector } = useAccount();
  const stableConfig = useMemo(
    () => ({ ...defaultConfig, ...config }),
    [config?.network, config?.debug]
  );

  const sdkRef = useRef<NexusSDK | null>(null);
  sdkRef.current ??= new NexusSDK({
    ...stableConfig,
  });
  const sdk = sdkRef.current;

  const [nexusSDK, setNexusSDK] = useState<NexusSDK | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const supportedChainsAndTokens = useRef<SupportedChainsAndTokensResult | null>(null);
  const swapSupportedChainsAndTokens = useRef<SupportedChainsResult | null>(null);
  const bridgableBalance = useRef<UserAsset[] | null>(null);
  const [swapBalance, setSwapBalance] = useState<UserAsset[] | null>(null);
  const exchangeRate = useRef<Record<string, number> | null>(null);

  const intent = useRef<OnIntentHookData | null>(null);
  const allowance = useRef<OnAllowanceHookData | null>(null);
  const swapIntent = useRef<OnSwapIntentHookData | null>(null);

  const initChainsAndTokens = useCallback(() => {
    const list = sdk.utils.getSupportedChains(config?.network === 'testnet' ? 0 : undefined);
    supportedChainsAndTokens.current = list ?? null;
    const swapList = sdk.utils.getSwapSupportedChainsAndTokens();
    swapSupportedChainsAndTokens.current = swapList ?? null;
  }, [sdk, config?.network]);

  const initializeNexus = async (provider: EthereumProvider) => {
    setLoading(true);
    try {
      if (sdk.isInitialized()) throw new Error('Nexus is already initialized');
      await sdk.initialize(provider);
      setNexusSDK(sdk);
      initChainsAndTokens();
      const [bridgeAbleBalanceResult, rates] = await Promise.allSettled([
        sdk.getBalancesForBridge(),
        sdk.utils.getCoinbaseRates(),
      ]);

      if (bridgeAbleBalanceResult.status === 'fulfilled') {
        bridgableBalance.current = bridgeAbleBalanceResult.value;
      }

      if (rates?.status === 'fulfilled') {
        const usdPerUnit: Record<string, number> = {};

        for (const [symbol, value] of Object.entries(rates ?? {})) {
          const unitsPerUsd = Number.parseFloat(String(value));
          if (Number.isFinite(unitsPerUsd) && unitsPerUsd > 0) {
            usdPerUnit[symbol.toUpperCase()] = 1 / unitsPerUsd;
          }
        }

        for (const token of ['ETH', 'USDC', 'USDT']) {
          usdPerUnit[token] ??= 1;
        }
        exchangeRate.current = usdPerUnit;
      }
    } catch (error) {
      console.error('Error initializing Nexus:', error);
    } finally {
      setLoading(false);
    }
  };

  const deinitializeNexus = async () => {
    try {
      if (!nexusSDK) throw new Error('Nexus is not initialized');
      await nexusSDK?.deinit();
      setNexusSDK(null);
      supportedChainsAndTokens.current = null;
      swapSupportedChainsAndTokens.current = null;
      bridgableBalance.current = null;
      setSwapBalance(null);
      exchangeRate.current = null;
      intent.current = null;
      swapIntent.current = null;
      allowance.current = null;
      setLoading(false);
    } catch (error) {
      console.error('Error deinitializing Nexus:', error);
    }
  };

  const attachEventHooks = () => {
    sdk.setOnAllowanceHook((data: OnAllowanceHookData) => {
      const { allow, sources } = data;
      allow(new Array(sources.length).fill('min'));
    });
  };

  const handleInit = useCallback(
    async (provider: EthereumProvider) => {
      if (loading) {
        return;
      }
      if (sdk.isInitialized()) {
        console.log('Nexus already initialized');
        return;
      }
      if (!provider || typeof provider.request !== 'function') {
        throw new Error('Invalid EIP-1193 provider');
      }
      await initializeNexus(provider);
      attachEventHooks();
    },
    [sdk, loading, initializeNexus]
  );

  const fetchBridgableBalance = async () => {
    try {
      const updatedBalance = await sdk?.getBalancesForBridge();
      bridgableBalance.current = updatedBalance;
    } catch (error) {
      console.error('Error fetching bridgable balance:', error);
    }
  };

  const fetchSwapBalance = async () => {
    try {
      const updatedBalance = await sdk?.getBalancesForSwap();
      setSwapBalance(updatedBalance);
    } catch (error) {
      console.error('Error fetching swap balance:', error);
    }
  };

  function getFiatValue(amount: number, token: string) {
    const key = token.toUpperCase();
    const rate = exchangeRate.current?.[key] ?? 1;
    return rate * amount;
  }

  useAccountEffect({
    onDisconnect() {
      deinitializeNexus();
    },
  });

  useEffect(() => {
    (async () => {
      if (!isConnected || !connector) return;
      const provider = (await connector.getProvider()) as EthereumProvider;
      handleInit(provider);
    })();
  }, [isConnected, connector, handleInit]);

  const value = useMemo(
    () => ({
      nexusSDK,
      initializeNexus,
      deinitializeNexus,
      attachEventHooks,
      intent,
      allowance,
      handleInit,
      supportedChainsAndTokens: supportedChainsAndTokens.current,
      swapSupportedChainsAndTokens: swapSupportedChainsAndTokens.current,
      bridgableBalance: bridgableBalance.current,
      swapBalance: swapBalance,
      network: config?.network,
      loading,
      fetchBridgableBalance,
      fetchSwapBalance,
      swapIntent,
      exchangeRate: exchangeRate.current,
      getFiatValue,
    }),
    [
      nexusSDK,
      initializeNexus,
      deinitializeNexus,
      attachEventHooks,
      intent.current,
      allowance.current,
      handleInit,
      supportedChainsAndTokens.current,
      swapSupportedChainsAndTokens.current,
      bridgableBalance.current,
      swapBalance,
      config,
      loading,
      fetchBridgableBalance,
      fetchSwapBalance,
      swapIntent.current,
      exchangeRate.current,
      getFiatValue,
    ]
  );
  return <NexusContext.Provider value={value}>{children}</NexusContext.Provider>;
};

export function useNexus() {
  const context = useContext(NexusContext);
  if (!context) {
    throw new Error('useNexus must be used within a NexusProvider');
  }
  return context;
}

export default NexusProvider;
