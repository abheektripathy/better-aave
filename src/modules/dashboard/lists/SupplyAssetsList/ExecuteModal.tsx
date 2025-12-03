/* eslint-disable simple-import-sort/imports */
import { Trans } from '@lingui/macro';
import { Box, Button, InputBase, Modal, Typography, useTheme } from '@mui/material';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TokenIcon } from 'src/components/primitives/TokenIcon';
import { useAaveDeposit } from 'src/hooks/useNexusDeposit';
import { CustomMarket } from 'src/ui-config/marketsConfig';
/* eslint-enable simple-import-sort/imports */

interface ExecuteModalProps {
  underlyingAsset: string;
  currentMarket: string;
  name: string;
  disableSupply: boolean;
  walletBalance: string;
  symbol: string;
}

export const ExecuteModal = ({
  underlyingAsset,
  currentMarket,
  disableSupply,
  symbol,
  walletBalance,
}: ExecuteModalProps) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');

  // References to prevent unnecessary re-renders
  const amountRef = useRef(amount);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevSimulationRef = useRef<string | null>(null);
  const isFirstRenderRef = useRef(true);

  // UI state
  const [showSourcesDropdown, setShowSourcesDropdown] = useState(false);
  const [showFeesDropdown, setShowFeesDropdown] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Check if amount exceeds wallet balance
  const isInsufficientBalance =
    amount && walletBalance ? parseFloat(amount) > parseFloat(walletBalance) : false;

  // Get deposit API functionality
  const {
    executeDeposit,
    simulateDeposit,
    isLoading,
    // currentStep is received but not used
    simulation,
    isSimulating,
    multiStepResult,
  } = useAaveDeposit(amount, underlyingAsset, currentMarket as CustomMarket);

  // Set the ref value when amount changes
  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);

  // Debounced simulation logic
  const debouncedSimulation = useCallback(() => {
    // Only simulate if there's an amount and it's changed
    if (amount && amount !== '0' && prevSimulationRef.current !== amount) {
      setIsDebouncing(true);

      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Set a new timer
      timerRef.current = setTimeout(() => {
        // Only simulate if the modal is still open and the amount hasn't changed
        if (isOpen && amountRef.current === amount) {
          simulateDeposit();
          prevSimulationRef.current = amount;
          setIsDebouncing(false);
        }
      }, 1000);
    }
  }, [amount, simulateDeposit, isOpen]);

  // Run simulation when amount changes
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    debouncedSimulation();

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [amount, debouncedSimulation]);

  // Reset the state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Clear any pending simulation
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      // Reset state on modal close
      prevSimulationRef.current = null;
      setIsDebouncing(false);
    }
  }, [isOpen]);

  const handleChange = (value: string) => {
    // Validate input is a number
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const handleSetMax = () => {
    setAmount(walletBalance);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setAmount('');
    setShowSourcesDropdown(false);
    setShowFeesDropdown(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setAmount('');
    setShowSourcesDropdown(false);
    setShowFeesDropdown(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleConfirmDeposit = async () => {
    const result = await executeDeposit();
    if (result.success) {
      handleClose();
    }
  };

  // Show sources dropdown automatically when we get simulation data with sources
  useEffect(() => {
    const hasSources =
      multiStepResult?.bridgeSimulation?.intent?.sources &&
      multiStepResult.bridgeSimulation.intent.sources.length > 0;
    if (hasSources) {
      setShowSourcesDropdown(true);
    }
  }, [multiStepResult]);

  // Helper to render the loading placeholder
  const LoadingPlaceholder = () => (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: '60px',
        height: '16px',
        bgcolor: 'rgba(255,255,255,0.1)',
        borderRadius: '4px',
      }}
    />
  );

  return (
    <>
      <Button disabled={disableSupply} variant="contained" onClick={handleOpen}>
        <Trans>Supply</Trans>
      </Button>

      <Modal
        open={isOpen}
        onClose={handleClose}
        aria-labelledby="execute-modal-title"
        aria-describedby="execute-modal-description"
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: { xs: '90%', sm: 450 },
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 24,
            p: 0,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          {/* Modal header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 4, pb: 2 }}>
            <Typography variant="h4" component="h2">
              <Trans>Supply {symbol}</Trans>
            </Typography>
            <Button onClick={handleClose} sx={{ minWidth: 'auto', p: 0, fontSize: '24px' }}>
              ×
            </Button>
          </Box>

          <Box sx={{ px: 4, py: 2 }}>
            {/* Amount input section */}
            <Typography component="div" sx={{ mb: 1 }}>
              <Trans>Amount</Trans>{' '}
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                ⓘ
              </Box>
            </Typography>
            <Box
              sx={{
                p: 2,
                border: `1px solid ${
                  isInsufficientBalance ? theme.palette.error.main : theme.palette.divider
                }`,
                borderRadius: 1,
                mb: 1,
                bgcolor: theme.palette.background.surface,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <InputBase
                  sx={{
                    flex: 1,
                    fontSize: '21px',
                    fontWeight: 400,
                    '&.Mui-focused': { fontWeight: 500 },
                    color: isInsufficientBalance ? theme.palette.error.main : 'inherit',
                  }}
                  placeholder="0.00"
                  value={amount}
                  autoFocus
                  onChange={(e) => handleChange(e.target.value)}
                  inputProps={{
                    'aria-label': 'amount input',
                    style: { padding: 0 },
                  }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <TokenIcon symbol={symbol} sx={{ mr: 1 }} />
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 400 }}>{symbol}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography
                  variant="caption"
                  color={isInsufficientBalance ? 'error.main' : 'text.secondary'}
                  sx={{ mr: 1 }}
                >
                  {isInsufficientBalance ? (
                    <Trans>Insufficient balance</Trans>
                  ) : (
                    <>
                      <Trans>Wallet Balance</Trans> {parseFloat(walletBalance).toFixed(8)}
                    </>
                  )}
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={handleSetMax}
                  sx={{ minWidth: 'auto', fontSize: '0.75rem', fontWeight: 'normal', padding: 0 }}
                >
                  <Trans>MAX</Trans>
                </Button>
              </Box>
            </Box>

            {/* Transaction overview section */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mt: 3,
                mb: 1,
              }}
            >
              <Typography component="div" sx={{ fontWeight: 'medium' }}>
                <Trans>Transaction overview</Trans>
              </Typography>
              {multiStepResult?.bridgeSimulation?.intent?.sources &&
                multiStepResult.bridgeSimulation.intent.sources.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Button
                      size="small"
                      onClick={() => setShowSourcesDropdown(!showSourcesDropdown)}
                      sx={{ minWidth: 'auto', p: 0 }}
                    >
                      <Typography variant="caption" color="primary">
                        <Trans>View Sources</Trans> {showSourcesDropdown ? '▲' : '▼'}
                      </Typography>
                    </Button>
                  </Box>
                )}
            </Box>
            <Box
              sx={{
                p: 2,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                bgcolor: theme.palette.background.surface,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography color="text.secondary">
                  <Trans>Supply APY</Trans>
                </Typography>
                <Typography>
                  {/*this should come from the actual supply number currently it's hardcoded*/}
                  {isDebouncing || isSimulating ? <LoadingPlaceholder /> : '1.44%'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography color="text.secondary">
                  <Trans>Collateralization</Trans>
                </Typography>
                <Typography sx={{ color: 'error.main' }}>
                  <Trans>Disabled</Trans>
                </Typography>
              </Box>
              {simulation?.bridgeFee ? (
                <>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography color="text.secondary">
                      <Trans>Fees</Trans>
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography sx={{ mr: 1 }}>
                        {isDebouncing ? (
                          <LoadingPlaceholder />
                        ) : (
                          `${simulation.bridgeFee.toFixed(6)} USD`
                        )}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => setShowFeesDropdown(!showFeesDropdown)}
                        sx={{ minWidth: 'auto', p: 0 }}
                      >
                        <Typography variant="caption" color="primary">
                          {showFeesDropdown ? '▲' : '▼'}
                        </Typography>
                      </Button>
                    </Box>
                  </Box>

                  {showFeesDropdown && (
                    <Box sx={{ pl: 2, mb: 1, borderLeft: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography color="text.secondary" variant="caption">
                          <Trans>Bridge Fee</Trans>
                        </Typography>
                        <Typography variant="caption">
                          {simulation.bridgeFee.toFixed(6)} USD
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="text.secondary" variant="caption">
                          <Trans>Execution Gas</Trans>
                        </Typography>
                        <Typography variant="caption">
                          {simulation.executionGas.slice(0, 8)} ETH
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </>
              ) : (
                ''
                // we can add a some text here
                // <Typography color="text.secondary" padding={3}>
                //   <Trans>No bridging required, directly moving with supply</Trans>
                // </Typography>
              )}

              {showSourcesDropdown && multiStepResult?.bridgeSimulation?.intent?.sources && (
                <Box sx={{ mt: 2, mb: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)', pt: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 1, display: 'block' }}
                  >
                    <Trans>Source Chains</Trans>
                  </Typography>

                  <Box sx={{ pl: 2, borderLeft: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    {multiStepResult.bridgeSimulation.intent.sources.map(
                      (
                        source: {
                          chainName?: string;
                          chainLogo?: string;
                          amount: string;
                        },
                        index: number
                      ) => (
                        <Box
                          key={index}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            mb:
                              index <
                              (multiStepResult.bridgeSimulation?.intent?.sources?.length ?? 0) - 1
                                ? 1
                                : 0,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ display: 'flex', alignItems: 'center' }}
                          >
                            {source.chainLogo ? (
                              <img
                                src={source.chainLogo}
                                alt={source.chainName || 'Chain'}
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  marginRight: 8,
                                  objectFit: 'contain',
                                }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  bgcolor: source.chainName?.includes('Base')
                                    ? '#0052FF'
                                    : '#627EEA',
                                  mr: 1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontSize: '10px',
                                  fontWeight: 'bold',
                                }}
                              >
                                {(source.chainName || 'X').charAt(0)}
                              </Box>
                            )}
                            <Trans>{source.chainName || 'Unknown Chain'}</Trans>
                          </Typography>
                          <Typography variant="caption">
                            {source.amount} {symbol}
                          </Typography>
                        </Box>
                      )
                    )}
                  </Box>
                </Box>
              )}
            </Box>

            {/* Button */}
            <Box sx={{ mt: 4 }}>
              {isDebouncing || isSimulating ? (
                <Button
                  disabled
                  variant="contained"
                  fullWidth
                  size="large"
                  sx={{
                    height: 44,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        mr: 1,
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: 'white',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    <Trans>Loading...</Trans>
                  </Box>
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmDeposit}
                  disabled={
                    !amount ||
                    amount === '0' ||
                    isLoading ||
                    isInsufficientBalance ||
                    parseFloat(amount) <= 0 ||
                    parseFloat(amount) > parseFloat(walletBalance)
                  }
                  variant="contained"
                  fullWidth
                  size="large"
                  sx={{
                    height: 44,
                  }}
                >
                  {isLoading ? <Trans>Processing...</Trans> : <Trans>Supply</Trans>}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Modal>
    </>
  );
};
