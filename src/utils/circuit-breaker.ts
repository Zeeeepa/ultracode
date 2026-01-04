/**
 * Circuit Breaker Pattern Implementation
 *
 * Three-state circuit breaker for protecting against cascading failures.
 * Used by SemanticAgent for 95% reliability improvement.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Failures detected, requests blocked, using fallback
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 *
 * @task_id TASK-004B
 */

import { logger } from "./logger.js";

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time before trying HALF_OPEN (ms) */
  recoveryTimeout: number;
  /** Successes needed to close from HALF_OPEN */
  successThreshold: number;
  /** Time window for failure counting (ms) */
  monitorWindow: number;
  /** Name for logging */
  name?: string;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  successThreshold: 3,
  monitorWindow: 60000,
  name: "CircuitBreaker",
};

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

export class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED;
  private failureWindow: number[] = [];
  private lastFailureTime = 0;
  private successCount = 0;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if circuit breaker allows execution
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (now - this.lastFailureTime >= this.config.recoveryTimeout) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.successCount = 0;
          logger.debug(this.config.name, "Circuit breaker HALF_OPEN");
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.failureWindow = [];
        logger.debug(this.config.name, "Circuit breaker CLOSED", { successes: this.successCount });
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.cleanupFailureWindow();
    }
  }

  /**
   * Record a failure
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failureWindow.push(now);

    this.cleanupFailureWindow();

    const recentFailures = this.failureWindow.length;

    if (recentFailures >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      logger.warn(this.config.name, "Circuit breaker OPENED", { failures: recentFailures });
    }
  }

  /**
   * Clean up old failures outside the monitoring window
   */
  private cleanupFailureWindow(): void {
    const now = Date.now();
    this.failureWindow = this.failureWindow.filter(
      (failureTime) => now - failureTime <= this.config.monitorWindow,
    );
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, fallback: () => T, operationName: string): Promise<T> {
    if (!this.canExecute()) {
      logger.debug(this.config.name, "Circuit open, using fallback", { operation: operationName });
      return fallback();
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      logger.warn(this.config.name, "Operation failed, using fallback", {
        operation: operationName,
        error: (error as Error).message,
      });
      return fallback();
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureWindow = [];
    this.lastFailureTime = 0;
    this.successCount = 0;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): {
    state: CircuitBreakerState;
    recentFailures: number;
    lastFailureTime: number;
    successCount: number;
  } {
    return {
      state: this.state,
      recentFailures: this.failureWindow.length,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
    };
  }
}
