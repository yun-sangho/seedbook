// Types
export type { PortfolioAllocation, PortfolioItem, StockSelection } from "./types/types";
export {
  DEFAULT_PORTFOLIO_NAMES,
  DEFAULT_REBALANCE_THRESHOLD_PERCENT,
  MAX_TOTAL_PERCENT,
} from "./types/constants";

// Store
export { usePortfolioStore } from "./stores/portfolio-store";

// Utils
export { computeActualAllocation } from "./utils/compute-actual-allocation";
export type { ActualAllocationResult, ActualHoldingValue } from "./utils/compute-actual-allocation";

export { computeRebalancingGap } from "./utils/compute-rebalancing-gap";
export type {
  RebalancingAction,
  RebalancingGapRow,
  RebalancingSummary,
} from "./utils/compute-rebalancing-gap";

export { validateAllocations } from "./utils/validate-allocations";
export type {
  AllocationValidationCode,
  AllocationValidationResult,
} from "./utils/validate-allocations";
