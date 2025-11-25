'use client';

import type {
  BridgeAndExecuteParams,
  BridgeAndExecuteSimulationResult,
} from '@avail-project/nexus-core';
import { TOKEN_CONTRACT_ADDRESSES, TOKEN_METADATA } from '@avail-project/nexus-core';
// import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNexus } from 'src/libs/web3-data-provider/NexusProvider';
import { type Hex, encodeFunctionData, formatUnits, parseUnits } from 'viem';
import { useAccount } from 'wagmi';

//const useNexus = dynamic(() => import('src/libs/web3-data-provider/NexusProvider'));

interface AaveDepositResult {
  success: boolean;
  error?: string;
  txHash?: string;
}

interface SimulationResult {
  bridgeFee: string;
  executionGas: string;
  totalCost: string;
  destinationAmount: string;
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

const TOKEN = 'USDC' as const;
const AAVE_POOL_ADDRESS = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const BASE_CHAIN_ID = 8453;

const TOKEN_DECIMALS = TOKEN_METADATA[TOKEN].decimals;
const TOKEN_ADDRESS = TOKEN_CONTRACT_ADDRESSES.USDC[BASE_CHAIN_ID];

export function useAaveDeposit(depositAmount: string) {
  const { nexusSDK } = useNexus();
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [multiStepResult, setMultiStepResult] = useState<BridgeAndExecuteSimulationResult | null>(
    null
  );

  function buildExecuteParams() {
    if (!address) throw new Error('Wallet not connected');

    const amountWei = parseUnits(depositAmount, TOKEN_DECIMALS);

    return {
      to: AAVE_POOL_ADDRESS as Hex,
      data: encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: 'supply',
        args: [TOKEN_ADDRESS as Hex, amountWei, address as Hex, 0],
      }),
      value: BigInt(0),
      tokenApproval: {
        token: TOKEN,
        amount: amountWei,
        spender: AAVE_POOL_ADDRESS as Hex,
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
      const executeParams = buildExecuteParams();

      const params: BridgeAndExecuteParams = {
        token: TOKEN,
        amount: parseUnits(depositAmount, TOKEN_DECIMALS),
        toChainId: BASE_CHAIN_ID,
        execute: executeParams,
      };

      const result = await nexusSDK.simulateBridgeAndExecute(params);
      setMultiStepResult(result);
      console.log(result, 'simulate txn');

      if (!result.bridgeSimulation && result.executeSimulation) {
        toast.info('No bridging needed - funds already on Base');
        const gasFeeUsed = result.executeSimulation?.gasUsed || BigInt(0);
        const gasFee = parseFloat(formatUnits(gasFeeUsed, TOKEN_DECIMALS));

        setSimulation({
          bridgeFee: '0',
          executionGas: formatUnits(gasFeeUsed, TOKEN_DECIMALS),
          totalCost: gasFee.toFixed(6),
          destinationAmount: depositAmount,
        });

        setCurrentStep('');
        return true;
      }

      if (result.bridgeSimulation && result.executeSimulation) {
        const bridgeFeeStr = result.bridgeSimulation?.intent?.fees?.total || '0';
        const gasFeeUsed = result.executeSimulation?.gasUsed || BigInt(0);

        const bridgeFee = parseFloat(bridgeFeeStr);
        const gasFee = parseFloat(formatUnits(gasFeeUsed, TOKEN_DECIMALS));
        const totalCost = (bridgeFee + gasFee).toFixed(3);

        setSimulation({
          bridgeFee: bridgeFee.toFixed(TOKEN_DECIMALS),
          executionGas: formatUnits(result.executeSimulation?.gasUsed || BigInt(0), TOKEN_DECIMALS),
          totalCost,
          destinationAmount:
            //TODO: this needs to be fixed
            result.bridgeSimulation?.intent?.destination?.amount || depositAmount,
        });

        setCurrentStep('');
        return true;
      } else {
        toast.error('Simulation failed - check console for details');
        setCurrentStep('');
        return false;
      }
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

      const params: BridgeAndExecuteParams = {
        token: TOKEN,
        amount: parseUnits(depositAmount, TOKEN_DECIMALS),
        toChainId: BASE_CHAIN_ID,
        execute: executeParams,
        waitForReceipt: true,
        receiptTimeout: 300000,
      };

      setCurrentStep('Initiating bridge...');

      const result = await nexusSDK.bridgeAndExecute(params);
      console.log(result, 'the end');

      setCurrentStep('');

      if (result.executeTransactionHash) {
        toast.success(`Successfully deposited ${depositAmount} ${TOKEN} to AAVE!`, {
          duration: 5000,
          action: result.executeExplorerUrl
            ? {
                label: 'View Transaction',
                onClick: () => window.open(result.executeExplorerUrl, '_blank'),
              }
            : undefined,
        });

        return { success: true, txHash: result.executeTransactionHash };
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
