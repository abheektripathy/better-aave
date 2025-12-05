'use client';

import type {
  BridgeAndExecuteParams,
  BridgeAndExecuteSimulationResult,
} from '@avail-project/nexus-core';
import { CHAIN_METADATA } from '@avail-project/nexus-core';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNexus } from 'src/libs/web3-data-provider/NexusProvider';
import { CustomMarket, marketsData } from 'src/ui-config/marketsConfig';
import { type Hex, encodeFunctionData, parseUnits } from 'viem';
import { useAccount } from 'wagmi';

interface AaveDepositResult {
  success: boolean;
  error?: string;
  txHash?: string;
  explorerUrl?: string;
}

interface SimulationResult {
  bridgeFee: number;
  executionGas: string;
  gasUsd: number;
  totalCost: string;
  destinationAmount: string;
  simulation: BridgeAndExecuteSimulationResult;
}

const AAVE_POOL_ABI = [
  {
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    name: 'supply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

function parseError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes('rejected') || error.message.includes('denied')) {
      return { type: 'REJECTED', message: 'Transaction rejected by user' };
    }
    if (
      error.message.includes('errUnknownField') ||
      error.message.includes('tx parse error') ||
      error.message.includes('Broadcasting transaction failed')
    ) {
      return {
        type: 'SDK_ERROR',
        message: 'SDK error - check balances and try again',
      };
    }
    if (error.message.includes('insufficient')) {
      return { type: 'INSUFFICIENT', message: 'Insufficient balance' };
    }
    return { type: 'GENERAL', message: error.message };
  }
  return { type: 'UNKNOWN', message: 'Unknown error occurred' };
}

export function useAaveDeposit(
  depositAmount: string,
  //this tells us the asset we're despositing
  assetAddress: string,
  //this tells us the chainID
  market: CustomMarket
) {
  const { nexusSDK, getFiatValue, supportedChainsAndTokens } = useNexus();
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [multiStepResult, setMultiStepResult] = useState<BridgeAndExecuteSimulationResult | null>(
    null
  );

  const findTokenWithChain = (address: Hex) => {
    if (!supportedChainsAndTokens) {
      throw new Error('Supported chains and tokens not loaded');
    }

    for (const chain of supportedChainsAndTokens) {
      const token = chain.tokens.find(
        (t) => t.contractAddress.toLowerCase() === address.toLowerCase()
      );
      if (token) {
        return { chain, token };
      }
    }

    throw new Error(`Token not found for address: ${address}`);
  };

  function buildExecuteParams() {
    if (!address) throw new Error('Wallet not connected');

    const tokenDeets = findTokenWithChain(assetAddress as Hex);
    if (!tokenDeets || !tokenDeets.token) throw new Error('cant fetch token details');

    const amountWei = parseUnits(depositAmount, tokenDeets.token.decimals);

    return {
      to: marketsData[market].addresses.LENDING_POOL as Hex,
      data: encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [assetAddress as Hex, amountWei, address as Hex, 0],
      }),
      value: BigInt(0),
      tokenApproval: {
        token: tokenDeets.token.symbol,
        amount: amountWei,
        spender: marketsData[market].addresses.LENDING_POOL as Hex,
      },
    };
  }

  async function simulateDeposit(): Promise<boolean> {
    if (!nexusSDK || !address) {
      toast.error('Nexus SDK not initialized or wallet not connected');
      return false;
    }

    setIsSimulating(true);
    setCurrentStep('Simulating transaction...');

    try {
      const tokenDeets = findTokenWithChain(assetAddress as Hex);
      const executeParams = buildExecuteParams();

      const params: BridgeAndExecuteParams = {
        token: tokenDeets.token.symbol,
        amount: parseUnits(depositAmount, tokenDeets.token.decimals),
        //verify this chain id actually corresponds to the destination chain id
        toChainId: tokenDeets.chain.id,
        execute: executeParams,
      };

      const simulation = await nexusSDK.simulateBridgeAndExecute(params);
      setMultiStepResult(simulation);

      const native = CHAIN_METADATA[tokenDeets.chain.id].nativeCurrency;
      const nativeSymbol = native.symbol;
      const nativeDecimals = native.decimals;

      if (!simulation.executeSimulation) {
        toast.error('Simulation failed - check console for details');
        setCurrentStep('');
        return false;
      }

      if (!simulation.bridgeSimulation) {
        toast.info('No bridging needed - funds already on destination chain');
      }

      const { gasFee } = simulation.executeSimulation;
      const gasFormatted = nexusSDK.utils.formatTokenBalance(gasFee, {
        symbol: nativeSymbol,
        decimals: nativeDecimals,
      });

      const gasUnits = Number.parseFloat(nexusSDK.utils.formatUnits(gasFee, nativeDecimals));
      const gasUsd = getFiatValue(gasUnits, nativeSymbol);

      let bridgeUsd = 0;
      if (simulation.bridgeSimulation) {
        const { total: bridgeFeeTotal } = simulation.bridgeSimulation.intent.fees;
        bridgeUsd = getFiatValue(Number.parseFloat(bridgeFeeTotal), tokenDeets.token.name);
      }

      setSimulation({
        bridgeFee: bridgeUsd,
        //this is in native symbol
        executionGas: gasFormatted,
        totalCost: (bridgeUsd + gasUsd).toString(),
        gasUsd,
        destinationAmount: depositAmount,
        simulation: simulation,
      });

      setCurrentStep('');
      return true;
    } catch (error) {
      const parsedError = parseError(error);
      toast.error(parsedError.message);
      setCurrentStep('');
      console.error('Simulation error:', error);
      return false;
    } finally {
      setIsSimulating(false);
    }
  }

  async function executeDeposit(): Promise<AaveDepositResult> {
    if (!nexusSDK || !address) {
      return { success: false, error: 'SDK not initialized' };
    }

    setIsLoading(true);
    setCurrentStep('Preparing transaction...');

    try {
      const executeParams = buildExecuteParams();
      const tokenDeets = findTokenWithChain(assetAddress as Hex);

      const params: BridgeAndExecuteParams = {
        token: tokenDeets.token.symbol,
        amount: parseUnits(depositAmount, tokenDeets.token.decimals),
        //verify this chain id actually corresponds to the destination chain id
        toChainId: tokenDeets.chain.id,
        execute: executeParams,
        waitForReceipt: true,
        receiptTimeout: 300000,
      };

      setCurrentStep('Initiating bridge...');

      const result = await nexusSDK.bridgeAndExecute(params);
      setCurrentStep('');

      if (result.executeTransactionHash) {
        toast.success(`Successfully deposited ${depositAmount} ${tokenDeets.token.name} to AAVE!`, {
          duration: 5000,
          action: result.executeExplorerUrl
            ? {
                label: 'View Transaction',
                onClick: () => window.open(result.executeExplorerUrl, '_blank'),
              }
            : undefined,
        });

        return {
          success: true,
          txHash: result.executeTransactionHash,
          explorerUrl: result.executeExplorerUrl,
        };
      } else {
        toast.error('Transaction failed to complete');
        return { success: false, error: 'No transaction hash returned' };
      }
    } catch (error) {
      const parsedError = parseError(error);
      setCurrentStep('');
      toast.error(parsedError.message);
      console.error('Execution error:', error);
      return { success: false, error: parsedError.message };
    } finally {
      setIsLoading(false);
    }
  }

  return {
    executeDeposit,
    simulateDeposit,
    isLoading,
    currentStep,
    simulation,
    isSimulating,
    multiStepResult,
  };
}
