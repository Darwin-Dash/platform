/**
 * Test Result Logger for WASM Concurrency Diagnostics
 *
 * Logs all diagnostic test results to JSON for analysis and pattern identification
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Structure for a single test result
 */
export interface TestResult {
  testCase: string;
  description: string;
  scenario: string; // JSON stringified configuration
  operationCount: number;
  successCount: number;
  failureCount: number;
  firstLockAtOperation: number | null;
  totalExecutionTime: number;
  lockError: boolean;
  lockErrorMessage: string | null;
  workerSpawned: boolean;
  wasmInitialized: boolean;
  resetWasmCalled: boolean;
  timestamp: string;
  operationDetails?: Array<{
    operationIndex: number;
    operationType: string;
    success: boolean;
    duration: number;
    error?: string;
    lockDetected?: boolean;
    wasmState?: string;
  }>;
}

/**
 * Test Result Logger
 */
export class TestResultLogger {
  private outputDir: string;
  private resultsFile: string;
  private summaryFile: string;
  private results: TestResult[] = [];

  constructor(outputDir: string = './test-results/wasm-diagnostics') {
    this.outputDir = outputDir;
    this.resultsFile = path.join(outputDir, 'results.json');
    this.summaryFile = path.join(outputDir, 'summary.json');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Load existing results if any
    this.loadExistingResults();
  }

  /**
   * Log a test result
   */
  async logResult(result: TestResult): Promise<void> {
    this.results.push(result);
    await this.writeResults();
    await this.updateSummary();
  }

  /**
   * Write results to file
   */
  private async writeResults(): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.writeFile(
        this.resultsFile,
        JSON.stringify(this.results, null, 2),
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
  }

  /**
   * Update summary file with aggregate data
   */
  private async updateSummary(): Promise<void> {
    const summary = {
      totalTests: this.results.length,
      totalWithLocks: this.results.filter(r => r.lockError).length,
      totalWithoutLocks: this.results.filter(r => !r.lockError).length,
      lockRate: (this.results.filter(r => r.lockError).length / this.results.length) * 100,
      averageExecutionTime:
        this.results.reduce((sum, r) => sum + r.totalExecutionTime, 0) / this.results.length,
      scenariosWithoutLocks: this.results
        .filter(r => !r.lockError)
        .map(r => ({
          testCase: r.testCase,
          scenario: r.scenario,
          executionTime: r.totalExecutionTime
        })),
      scenariosWithLocks: this.results
        .filter(r => r.lockError)
        .map(r => ({
          testCase: r.testCase,
          scenario: r.scenario,
          firstLockAtOp: r.firstLockAtOperation,
          executionTime: r.totalExecutionTime
        })),
      generatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      fs.writeFile(
        this.summaryFile,
        JSON.stringify(summary, null, 2),
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
  }

  /**
   * Load existing results from file
   */
  private loadExistingResults(): void {
    if (fs.existsSync(this.resultsFile)) {
      try {
        const content = fs.readFileSync(this.resultsFile, 'utf-8');
        this.results = JSON.parse(content);
      } catch (error) {
        console.warn('Could not load existing results:', error);
        this.results = [];
      }
    }
  }

  /**
   * Get all results
   */
  getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Get results by lock status
   */
  getResultsByLockStatus(lockError: boolean): TestResult[] {
    return this.results.filter(r => r.lockError === lockError);
  }

  /**
   * Export results to CSV for analysis
   */
  async exportToCsv(): Promise<void> {
    const csvPath = path.join(this.outputDir, 'results.csv');
    const headers = [
      'TestCase',
      'Description',
      'OperationCount',
      'SuccessCount',
      'FailureCount',
      'FirstLockAtOp',
      'TotalTime(ms)',
      'LockError',
      'WorkerSpawned',
      'ResetWasm',
      'Timestamp'
    ];

    const rows = this.results.map(r => [
      r.testCase,
      r.description,
      r.operationCount,
      r.successCount,
      r.failureCount,
      r.firstLockAtOperation ?? 'N/A',
      r.totalExecutionTime,
      r.lockError ? 'Yes' : 'No',
      r.workerSpawned ? 'Yes' : 'No',
      r.resetWasmCalled ? 'Yes' : 'No',
      r.timestamp
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    return new Promise((resolve, reject) => {
      fs.writeFile(csvPath, csv, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
