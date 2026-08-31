// Types
export type {
  FillSide,
  TradePositionSide,
  TradePositionStatus,
  OrderEventStatus,
  Fill,
  OrderEvent,
  TradePosition,
  CompletedTradeLifecycle,
  TradeMarketContext,
} from "./types";
export { TRADE_LIFECYCLE_SCHEMA_VERSION } from "./types";

// Engine
export { TradeLifecycleEngine, computeWeightedAverage, computeGrossPnl } from "./TradeLifecycleEngine";
export type { FillProcessingResult } from "./TradeLifecycleEngine";

// Raw repository interfaces
export type { RawFillRepository, RawFillQuery } from "./raw/RawFillRepository";
export type { RawOrderRepository, RawOrderQuery } from "./raw/RawOrderRepository";

// Raw repository implementations
export { MemoryRawFillRepository } from "./raw/MemoryRawFillRepository";
export { MemoryRawOrderRepository } from "./raw/MemoryRawOrderRepository";

// Derived repository interface
export type { TradeLifecycleRepository, LifecycleQuery } from "./derived/TradeLifecycleRepository";

// Derived repository implementation
export { MemoryTradeLifecycleRepository } from "./derived/MemoryTradeLifecycleRepository";
