'use client';

interface ExecuteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  simulation: {
    bridgeFee: string;
    executionGas: string;
    totalCost: string;
    destinationAmount: string;
  } | null;
  routeInfo: {
    sources: Array<Record<string, unknown>>;
    allSources?: Array<Record<string, unknown>>;
    destination?: {
      chainLogo: string | undefined;
      chainName: string;
    };
    token?: {
      symbol: string;
    };
  } | null;
  depositAmount: string;
  handleConfirmDeposit: () => Promise<void>;
  isDepositing: boolean;
  totalUSDC?: number;
  availableUSDC?: number;
}

export default function ExecuteModal({
  isOpen,
  onClose,
  simulation,
  routeInfo,
  depositAmount,
  handleConfirmDeposit,
  isDepositing,
}: ExecuteModalProps) {
  if (!isOpen || !simulation) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-lg max-w-2xl w-full p-6 space-y-4">
        <h3 className="text-xl font-semibold text-black dark:text-white">Confirm Deposit</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left side - Transaction details */}
          <div className="space-y-3">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Amount to deposit</div>
              <div className="text-lg font-semibold text-black dark:text-white">
                {depositAmount} USDC
              </div>
            </div>

            <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Bridge Fee</span>
                <span className="font-medium text-black dark:text-white">
                  {parseFloat(simulation.bridgeFee).toFixed(6)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Execution Gas</span>
                <span className="font-medium text-black dark:text-white">
                  {parseFloat(simulation.executionGas).toFixed(6)} USDC
                </span>
              </div>
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="font-semibold text-black dark:text-white">Total Cost</span>
                  <span className="font-semibold text-black dark:text-white">
                    {parseFloat(simulation.totalCost).toFixed(6)} USDC
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {routeInfo && routeInfo.sources.length > 0 ? (
                <>
                  The amount of {parseFloat(simulation.destinationAmount).toFixed(6)} USDC will be
                  bridged to BASE to fullfill your deposit request of {depositAmount} USDC to AAVE.
                </>
              ) : (
                <>
                  {parseFloat(depositAmount).toFixed(6)} USDC will be deposited directly to AAVE on
                  Base (no bridging required).
                </>
              )}
            </div>
          </div>

          {/* Right side - Route visualization */}
          <div className="space-y-3">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
              <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-3">
                Selected Best Route
              </div>

              {routeInfo && routeInfo.sources.length > 0 ? (
                <div className="space-y-3">
                  {/* Source chains (used for bridging fees) */}
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-2">
                      Payment Source
                      {routeInfo.sources.length > 1 ? 's' : ''}:
                    </div>
                    <div className="space-y-2">
                      {routeInfo.sources.map((source: Record<string, unknown>, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700"
                        >
                          <img
                            src={source.chainLogo as string}
                            alt={source.chainName as string}
                            className="w-6 h-6 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23ccc'/%3E%3C/svg%3E";
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-black dark:text-white truncate">
                              {source.chainName as string}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-500">
                              {parseFloat(source.amount as string).toFixed(6)}{' '}
                              {routeInfo.token?.symbol || 'USDC'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* All sources - showing available balances */}
                  {routeInfo.allSources && routeInfo.allSources.length > 1 && (
                    <div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-2">
                        Available on Chains:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {routeInfo.allSources.map(
                          (source: Record<string, unknown>, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700"
                              title={`${source.chainName as string}: ${source.amount as string} ${
                                routeInfo.token?.symbol
                              }`}
                            >
                              <img
                                src={source.chainLogo as string}
                                alt={source.chainName as string}
                                className="w-4 h-4 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23ccc'/%3E%3C/svg%3E";
                                }}
                              />
                              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                                {parseFloat(source.amount as string).toFixed(2)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <svg
                      className="w-6 h-6 text-zinc-400 dark:text-zinc-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>

                  {/* Destination chain */}
                  {routeInfo.destination && (
                    <div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mb-2">
                        Destination:
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-white dark:bg-zinc-900 rounded border-2 border-blue-500 dark:border-blue-600">
                        <img
                          src={routeInfo.destination.chainLogo}
                          alt={routeInfo.destination.chainName}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23ccc'/%3E%3C/svg%3E";
                          }}
                        />
                        <div className="flex-1">
                          <div className="text-xs font-medium text-black dark:text-white">
                            {routeInfo.destination.chainName}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-500">
                            Target for AAVE deposit
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="flex justify-center mb-3">
                    <svg
                      className="w-10 h-10 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="text-sm font-medium text-black dark:text-white mb-1">
                    No Bridging Required
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-500">
                    Funds already on Base chain
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={isDepositing}
            className="flex-1 h-10 rounded-full border border-zinc-300 dark:border-zinc-700 text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDeposit}
            disabled={isDepositing}
            className="flex-1 h-10 rounded-full bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors disabled:opacity-50"
          >
            {isDepositing ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
