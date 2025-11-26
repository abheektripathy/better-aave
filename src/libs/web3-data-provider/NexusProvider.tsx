'use client';

import {
  type EthereumProvider,
  type NexusNetwork,
  type OnAllowanceHookData,
  type OnIntentHookData,
  type SupportedChainsResult,
  type UserAsset,
  NexusSDK,
  SupportedChainsAndTokensResult,
} from '@avail-project/nexus-core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useAccount, useWalletClient } from 'wagmi';

interface NexusContextType {
  nexusSDK: NexusSDK | null;
  unifiedBalance: UserAsset[] | null;
  initializeNexus: () => Promise<void>;
  deinitializeNexus: () => Promise<void>;
  attachEventHooks: () => void;
  intent: OnIntentHookData | null;
  setIntent: React.Dispatch<React.SetStateAction<OnIntentHookData | null>>;
  allowance: OnAllowanceHookData | null;
  setAllowance: React.Dispatch<React.SetStateAction<OnAllowanceHookData | null>>;
  supportedChainsAndTokens: SupportedChainsAndTokensResult | null;
  swapSupportedChainsAndTokens: SupportedChainsResult | null;
  network?: NexusNetwork;
  loading: boolean;
  fetchUnifiedBalance: () => Promise<void>;
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
  network: 'devnet',
  debug: false,
};

const NexusProvider = ({ children, config = defaultConfig }: NexusProviderProps) => {
  const { isConnected, connector } = useAccount();
  const { data: walletClient } = useWalletClient();

  const stableConfig = useMemo(
    () => ({ ...defaultConfig, ...config }),
    [config?.network, config?.debug]
  );

  const sdkRef = useRef<NexusSDK | null>(null);
  if (sdkRef.current === null) {
    sdkRef.current = new NexusSDK(stableConfig);
  }
  const sdk = sdkRef.current;

  const [nexusSDK, setNexusSDK] = useState<NexusSDK | null>(null);
  const [supportedChainsAndTokens, setSupportedChainsAndTokens] =
    useState<SupportedChainsAndTokensResult | null>(null);
  const [swapSupportedChainsAndTokens, setSwapSupportedChainsAndTokens] =
    useState<SupportedChainsResult | null>(null);
  const [unifiedBalance, setUnifiedBalance] = useState<UserAsset[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [intent, setIntent] = useState<OnIntentHookData | null>(null);
  const [allowance, setAllowance] = useState<OnAllowanceHookData | null>(null);

  const attachEventHooks = useCallback(() => {
    if (!sdk) return;

    console.log('Attaching event hooks to Nexus SDK');

    sdk.setOnAllowanceHook((data: OnAllowanceHookData) => {
      console.log('🔔 Allowance hook triggered:', data);

      //this extra approval is not needed at all, but here for the sake of example on how to check extra conditions on the hook level
      const toastId = toast.info('Token approval required', {
        duration: 10000,
        description: 'You need to approve access to your tokens',
        action: {
          label: 'Approve',
          onClick: async () => {
            try {
              data.allow(['max']);
              console.log('Allowance approved successfully');
              toast.success('Tokens approved');
            } catch (error) {
              console.error('Error approving allowance:', error);
              toast.error('Failed to approve tokens');
            } finally {
              if (toastId) toast.dismiss(toastId);
              setAllowance(null);
            }
          },
        },
      });

      setTimeout(() => {
        if (data && typeof data.deny === 'function') {
          try {
            data.deny();
            console.log('Allowance automatically denied (timeout)');
          } catch (error) {
            console.error('Error auto-denying allowance:', error);
          }
        }
      }, 12000);

      setAllowance(data);
    });

    sdk.setOnIntentHook((data: OnIntentHookData) => {
      console.log('🔔 Intent hook triggered:', data);

      const toastId = toast.info('Transaction confirmation needed', {
        duration: 10000,
        description: 'Please confirm your transaction',
        action: {
          label: 'Confirm',
          onClick: async () => {
            try {
              data.allow();
              console.log('Transaction approved successfully');
              toast.success('Transaction confirmed');
            } catch (error) {
              console.error('Error approving transaction:', error);
              toast.error('Failed to approve transaction');
            } finally {
              if (toastId) toast.dismiss(toastId);
              setIntent(null);
            }
          },
        },
      });

      setTimeout(() => {
        if (data && typeof data.deny === 'function') {
          try {
            data.deny();
            console.log('Transaction automatically denied (timeout)');
          } catch (error) {
            console.error('Error auto-denying transaction:', error);
          }
        }
      }, 1200000);

      setIntent(data);
    });

    console.log('Event hooks attached successfully');
  }, [sdk]);

  const initializeNexus = useCallback(async () => {
    if (!sdk || !isConnected || !connector || !walletClient) return;
    if (sdk.isInitialized()) return;

    setLoading(true);
    try {
      const provider = (await connector.getProvider()) as EthereumProvider;

      console.log('Initializing Nexus SDK with provider');
      await sdk.initialize(provider);
      console.log('Nexus SDK initialized successfully');
      setNexusSDK(sdk);

      attachEventHooks();
      const balances = await sdk.getUnifiedBalances(true);
      setUnifiedBalance(balances);

      const chains = sdk.utils?.getSupportedChains(
        stableConfig.network === 'testnet' ? 0 : undefined
      );
      setSupportedChainsAndTokens(chains);

      const swapList = sdk.utils?.getSwapSupportedChainsAndTokens();
      setSwapSupportedChainsAndTokens(swapList ?? null);

      console.log('Nexus initialization completed successfully');
    } catch (error) {
      console.error('Error initializing Nexus:', error);
      toast.error('Failed to initialize Nexus');
    } finally {
      setLoading(false);
    }
  }, [sdk, isConnected, connector, walletClient, stableConfig.network, attachEventHooks]);

  const deinitializeNexus = useCallback(async () => {
    try {
      if (!sdk || !sdk.isInitialized()) throw new Error('Nexus is not initialized');
      await sdk.deinit();
      setNexusSDK(null);
      setUnifiedBalance(null);
    } catch (error) {
      console.error('Error deinitializing Nexus:', error);
    }
  }, [sdk]);

  const fetchUnifiedBalance = useCallback(async () => {
    try {
      if (!sdk || !sdk.isInitialized()) return;
      const balances = await sdk.getUnifiedBalances(true);
      setUnifiedBalance(balances);
    } catch (error) {
      console.error('Error fetching unified balance:', error);
    }
  }, [sdk]);

  useEffect(() => {
    if (!isConnected) return;
    initializeNexus();
  }, [isConnected, initializeNexus]);

  useEffect(() => {
    if (!(sdk && sdk.isInitialized() && isConnected)) return;

    fetchUnifiedBalance();

    const interval = setInterval(() => {
      fetchUnifiedBalance();
    }, 100_000);

    return () => clearInterval(interval);
  }, [sdk, isConnected, fetchUnifiedBalance]);

  const value = useMemo(
    () => ({
      nexusSDK,
      initializeNexus,
      deinitializeNexus,
      attachEventHooks,
      intent,
      setIntent,
      allowance,
      setAllowance,
      supportedChainsAndTokens,
      swapSupportedChainsAndTokens,
      unifiedBalance,
      network: stableConfig.network,
      loading,
      fetchUnifiedBalance,
    }),
    [
      nexusSDK,
      initializeNexus,
      deinitializeNexus,
      attachEventHooks,
      intent,
      allowance,
      supportedChainsAndTokens,
      swapSupportedChainsAndTokens,
      unifiedBalance,
      stableConfig.network,
      loading,
      fetchUnifiedBalance,
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
