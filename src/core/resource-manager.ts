/**
 * Resource Manager for commodity hardware optimization
 * Monitors and manages CPU, memory, and I/O resources
 */

import { EventEmitter } from "node:events";
import os from "node:os";
import { log } from "../logging/index.js";
import type { ResourceConstraints } from "../types/agent.js";
import { knowledgeBus } from "./knowledge-bus.js";

// Event-driven architecture: resource monitoring uses setInterval for Node.js, disabled for Bun

/** Check if running in Bun */
function isBunRuntime(): boolean {
  return typeof (globalThis as any).Bun !== "undefined";
}

export interface ResourceSnapshot {
  timestamp: number;
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpu: {
    cores: number;
    usage: number;
    loadAverage: number[];
  };
  io: {
    pendingReads: number;
    pendingWrites: number;
  };
}

export interface ResourceAllocation {
  agentId: string;
  memoryMB: number;
  cpuPercent: number;
  priority: number;
}

export class ResourceManager extends EventEmitter {
  private constraints: ResourceConstraints;
  private allocations: Map<string, ResourceAllocation> = new Map();
  private snapshots: ResourceSnapshot[] = [];
  private maxSnapshots = 60; // Keep 1 minute of history at 1 second intervals
  private monitoringRunning = false;

  // Adaptive monitoring state
  private adaptiveMonitoringInterval = 1000; // Start with 1 second
  private readonly MIN_MONITORING_INTERVAL = 1000; // Minimum 1 second
  private readonly MAX_MONITORING_INTERVAL = 10000; // Maximum 10 seconds

  // Throttling state
  private isThrottled = false;
  private throttleThreshold = 0.8; // Throttle at 80% resource usage

  constructor(constraints?: ResourceConstraints) {
    super();

    // Default constraints - scale generously based on system memory
    // OpenVINO and embedding generation need significant memory
    const totalMemoryGB = os.totalmem() / (1024 * 1024 * 1024);
    const defaultMemoryMB = Math.min(
      Math.max(4096, Math.floor(totalMemoryGB * 512)), // 50% of system memory
      16384, // Cap at 16GB
    );

    this.constraints = constraints || {
      maxMemoryMB: defaultMemoryMB,
      maxCpuPercent: 95, // Allow higher CPU usage
      maxConcurrentAgents: Math.min(20, os.cpus().length * 3), // Scale with CPU cores
      maxTaskQueueSize: 200,
    };

    log.i("RESOURCEMGR", "init", {
      memMB: this.constraints.maxMemoryMB,
      maxAgents: this.constraints.maxConcurrentAgents,
    });
  }

  /** Timer handle for Node.js setInterval */
  private monitoringTimer?: ReturnType<typeof setInterval> | undefined;

  /**
   * Start adaptive resource monitoring
   * Event-driven: uses setInterval for Node.js, disabled for Bun
   */
  startMonitoring(): void {
    if (this.monitoringRunning) return;
    this.monitoringRunning = true;
    this.emit("monitoring:started");

    // For Bun: skip monitoring loop to avoid CPU spinning
    if (isBunRuntime()) return;

    // For Node.js: use setInterval with adaptive interval
    const runMonitoringCycle = () => {
      if (!this.monitoringRunning) return;

      this.captureSnapshot();
      const pressure = this.checkResourcePressure();

      // Adapt monitoring frequency based on resource pressure
      if (pressure > 0.8) {
        this.adaptiveMonitoringInterval = this.MIN_MONITORING_INTERVAL;
      } else if (pressure < 0.3) {
        this.adaptiveMonitoringInterval = Math.min(this.MAX_MONITORING_INTERVAL, this.adaptiveMonitoringInterval * 1.5);
      } else {
        this.adaptiveMonitoringInterval = 2000;
      }
    };

    // Run initial capture
    runMonitoringCycle();

    // Use setInterval with base interval (adaptive logic inside callback)
    this.monitoringTimer = setInterval(runMonitoringCycle, 2000); // Check every 2 seconds
  }

  /**
   * Stop resource monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringRunning) {
      this.monitoringRunning = false;
      this.adaptiveMonitoringInterval = 1000;

      // Clear timer
      if (this.monitoringTimer) {
        clearInterval(this.monitoringTimer);
        this.monitoringTimer = undefined;
      }

      this.emit("monitoring:stopped");
    }
  }

  /**
   * Request resource allocation for an agent
   */
  requestAllocation(agentId: string, memoryMB: number, cpuPercent: number, priority = 5): boolean {
    const currentTotal = this.getTotalAllocated();

    // Check if allocation would exceed constraints
    if (currentTotal.memory + memoryMB > this.constraints.maxMemoryMB) {
      this.emit("allocation:denied", {
        agentId,
        reason: "memory_exceeded",
        requested: memoryMB,
        available: this.constraints.maxMemoryMB - currentTotal.memory,
      });
      return false;
    }

    if (currentTotal.cpu + cpuPercent > this.constraints.maxCpuPercent) {
      this.emit("allocation:denied", {
        agentId,
        reason: "cpu_exceeded",
        requested: cpuPercent,
        available: this.constraints.maxCpuPercent - currentTotal.cpu,
      });
      return false;
    }

    // Grant allocation
    this.allocations.set(agentId, {
      agentId,
      memoryMB,
      cpuPercent,
      priority,
    });

    this.emit("allocation:granted", { agentId, memoryMB, cpuPercent });
    return true;
  }

  /**
   * Release resources allocated to an agent
   */
  releaseAllocation(agentId: string): void {
    if (this.allocations.has(agentId)) {
      const allocation = this.allocations.get(agentId)!;
      this.allocations.delete(agentId);
      this.emit("allocation:released", allocation);
    }
  }

  /**
   * Get current resource usage
   */
  getCurrentUsage(): ResourceSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  /**
   * Get resource usage history
   */
  getHistory(seconds = 60): ResourceSnapshot[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.snapshots.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Check if system should be throttled
   */
  isSystemThrottled(): boolean {
    return this.isThrottled;
  }

  /**
   * Get available resources
   */
  getAvailableResources(): {
    memoryMB: number;
    cpuPercent: number;
  } {
    const allocated = this.getTotalAllocated();
    return {
      memoryMB: Math.max(0, this.constraints.maxMemoryMB - allocated.memory),
      cpuPercent: Math.max(0, this.constraints.maxCpuPercent - allocated.cpu),
    };
  }

  /**
   * Suggest optimal allocation for a new agent
   */
  suggestAllocation(priority: number): {
    memoryMB: number;
    cpuPercent: number;
  } | null {
    const available = this.getAvailableResources();

    if (available.memoryMB < 50 || available.cpuPercent < 5) {
      return null; // Not enough resources
    }

    // Allocate based on priority (0-10 scale)
    const memoryFactor = priority / 10;
    const cpuFactor = priority / 10;

    return {
      memoryMB: Math.min(
        Math.floor(available.memoryMB * memoryFactor * 0.5), // Use up to 50% of available
        256, // Cap at 256MB per agent
      ),
      cpuPercent: Math.min(
        Math.floor(available.cpuPercent * cpuFactor * 0.5), // Use up to 50% of available
        25, // Cap at 25% per agent
      ),
    };
  }

  /**
   * Force garbage collection if available
   */
  requestGarbageCollection(): void {
    if (global.gc) {
      log.i("RESOURCEMGR", "gc_forced");
      global.gc();
      this.emit("gc:completed");
    } else {
      log.w("RESOURCEMGR", "gc_not_exposed", { hint: "run with --expose-gc" });
    }
  }

  // Private methods

  private captureSnapshot(): void {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const snapshot: ResourceSnapshot = {
      timestamp: Date.now(),
      memory: {
        total: Math.round(totalMem / 1024 / 1024),
        used: Math.round(usedMem / 1024 / 1024),
        free: Math.round(freeMem / 1024 / 1024),
        percentage: (usedMem / totalMem) * 100,
      },
      cpu: {
        cores: os.cpus().length,
        usage: this.calculateCpuUsage(),
        loadAverage: os.loadavg(),
      },
      io: {
        pendingReads: 0, // Would need actual I/O monitoring
        pendingWrites: 0,
      },
    };

    this.snapshots.push(snapshot);

    // Maintain snapshot limit
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    this.emit("snapshot:captured", snapshot);
  }

  private calculateCpuUsage(): number {
    // Simplified CPU usage calculation
    // In production, would track actual CPU time
    // Guard load average as it may return [0,0,0] or be unsupported in some envs
    const loadAvgArr = os.loadavg();
    const loadAvg = Array.isArray(loadAvgArr) && typeof loadAvgArr[0] === "number" ? loadAvgArr[0] : 0;
    const cores = os.cpus().length || 1;
    return Math.min(100, (loadAvg / cores) * 100);
  }

  /**
   * Check resource pressure and return normalized value (0-1)
   * Returns the maximum pressure from memory and CPU usage
   */
  private checkResourcePressure(): number {
    const current = this.getCurrentUsage();
    if (!current) return 0;

    // Calculate normalized pressure (0-1)
    const memoryPressureValue = current.memory.percentage / 100;
    const cpuPressureValue = current.cpu.usage / 100;
    const pressure = Math.max(memoryPressureValue, cpuPressureValue);

    // Check if we should throttle
    const memoryPressure = current.memory.percentage > this.throttleThreshold * 100;
    const cpuPressure = current.cpu.usage > this.throttleThreshold * 100;

    const wasThrottled = this.isThrottled;
    this.isThrottled = memoryPressure || cpuPressure;

    if (this.isThrottled && !wasThrottled) {
      log.w("RESOURCEMGR", "throttle_on", { mem: memoryPressure, cpu: cpuPressure });
      this.emit("throttle:enabled", { memory: memoryPressure, cpu: cpuPressure });

      // Try to free up memory
      if (memoryPressure) {
        this.requestGarbageCollection();
      }
    } else if (!this.isThrottled && wasThrottled) {
      log.i("RESOURCEMGR", "throttle_off");
      this.emit("throttle:disabled");
    }

    // Emit warnings for critical levels
    if (current.memory.percentage > 90) {
      this.emit("memory:critical", current.memory);
    }

    if (current.cpu.usage > 90) {
      this.emit("cpu:critical", current.cpu);
    }

    return pressure;
  }

  private getTotalAllocated(): { memory: number; cpu: number } {
    let totalMemory = 0;
    let totalCpu = 0;

    for (const allocation of this.allocations.values()) {
      totalMemory += allocation.memoryMB;
      totalCpu += allocation.cpuPercent;
    }

    return { memory: totalMemory, cpu: totalCpu };
  }

  /**
   * Adjust resources based on codebase size for large projects
   */
  adjustForCodebaseSize(fileCount: number, projectSizeMB: number): void {
    let adjustedMemoryMB = this.constraints.maxMemoryMB;
    let adjustedConcurrentAgents = this.constraints.maxConcurrentAgents;

    // Large codebase (>2000 files) adjustments
    if (fileCount > 2000) {
      adjustedMemoryMB = Math.min(this.constraints.maxMemoryMB * 1.5, 8192); // Increase by 50%, cap at 8GB
      log.i("RESOURCEMGR", "large_codebase", { files: fileCount, memMB: adjustedMemoryMB });
    }

    // Very large codebase (>5000 files) adjustments
    if (fileCount > 5000) {
      adjustedMemoryMB = Math.min(this.constraints.maxMemoryMB * 2, 12288); // Double memory, cap at 12GB
      adjustedConcurrentAgents = Math.max(4, Math.floor(adjustedConcurrentAgents / 2)); // Keep some concurrency
      log.i("RESOURCEMGR", "vlarge_codebase", {
        files: fileCount,
        memMB: adjustedMemoryMB,
        agents: adjustedConcurrentAgents,
      });
    }

    // Extremely large codebase (>10000 files) adjustments
    if (fileCount > 10000) {
      adjustedMemoryMB = Math.min(this.constraints.maxMemoryMB * 3, 16384); // Triple memory, cap at 16GB
      adjustedConcurrentAgents = 2; // Minimum 2 agents for stability
      log.i("RESOURCEMGR", "xlarge_codebase", {
        files: fileCount,
        memMB: adjustedMemoryMB,
        agents: adjustedConcurrentAgents,
      });
    }

    // Apply adjustments
    this.constraints.maxMemoryMB = adjustedMemoryMB;
    this.constraints.maxConcurrentAgents = adjustedConcurrentAgents;

    this.emit("resources:adjusted", {
      fileCount,
      projectSizeMB,
      newMemoryLimit: adjustedMemoryMB,
      newAgentLimit: adjustedConcurrentAgents,
    });

    knowledgeBus.publish(
      "resources:adjusted",
      {
        fileCount,
        projectSizeMB,
        newMemoryLimit: adjustedMemoryMB,
        newAgentLimit: adjustedConcurrentAgents,
      },
      "resource-manager",
      60000,
    );
  }

  /**
   * Get current resource constraints
   */
  getConstraints(): ResourceConstraints {
    return { ...this.constraints };
  }
}

// Singleton instance
export const resourceManager = new ResourceManager();
