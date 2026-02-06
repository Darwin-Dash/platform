/**
 * Result Logger for WASM Concurrency Diagnostics
 *
 * Logs test results to JSON and CSV files for analysis.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface OperationResult {
  operationIndex: number;
  operationType: string;
  success: boolean;
  duration: number;
  error?: string;
  lockDetected?: boolean;
  wasmState: string;
}

export interface TestResult {
  testCase: string;
  description: string;
  scenario: string;
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
  operationDetails: OperationResult[];
  summary: {
    success: boolean;
    locksDetected: number;
  };
}

/**
 * Test Result Logger
 */
export class TestResultLogger {
  private outputDir: string;
  private results: TestResult[] = [];

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (error) {
      console.warn(`Could not create output directory: ${this.outputDir}`, error);
    }
  }

  /**
   * Log a test result
   */
  async logResult(result: TestResult): Promise<void> {
    this.results.push(result);

    // Also log to console for immediate feedback
    const status = result.summary.success ? '✅ PASS' : '❌ FAIL';
    console.log(`[${status}] ${result.testCase}`);
    if (!result.summary.success) {
      console.log(`  Locks detected: ${result.summary.locksDetected}`);
      if (result.lockErrorMessage) {
        console.log(`  Error: ${result.lockErrorMessage.substring(0, 100)}...`);
      }
    }
  }

  /**
   * Export results to JSON
   */
  async exportToJson(): Promise<string> {
    const filePath = path.join(this.outputDir, `results-${Date.now()}.json`);

    try {
      const data = JSON.stringify(this.results, null, 2);
      fs.writeFileSync(filePath, data);
      console.log(`Results exported to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to export results to JSON:', error);
      throw error;
    }
  }

  /**
   * Export results to CSV
   */
  async exportToCsv(): Promise<string> {
    const filePath = path.join(this.outputDir, `results-${Date.now()}.csv`);

    try {
      const headers = [
        'testCase',
        'description',
        'operationCount',
        'successCount',
        'failureCount',
        'lockError',
        'firstLockAtOperation',
        'totalExecutionTime',
        'workerSpawned',
        'resetWasmCalled',
        'timestamp',
      ];

      const rows = this.results.map((result) => [
        `"${result.testCase}"`,
        `"${result.description}"`,
        result.operationCount,
        result.successCount,
        result.failureCount,
        result.lockError,
        result.firstLockAtOperation ?? 'N/A',
        result.totalExecutionTime,
        result.workerSpawned,
        result.resetWasmCalled,
        result.timestamp,
      ]);

      const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

      fs.writeFileSync(filePath, csv);
      console.log(`Results exported to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to export results to CSV:', error);
      throw error;
    }
  }

  /**
   * Get all results
   */
  getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalTests: number;
    passed: number;
    failed: number;
    successRate: number;
  } {
    const totalTests = this.results.length;
    const passed = this.results.filter((r) => r.summary.success).length;
    const failed = totalTests - passed;
    const successRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;

    return {
      totalTests,
      passed,
      failed,
      successRate,
    };
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const summary = this.getSummary();
    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSTIC TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tests: ${summary.totalTests}`);
    console.log(`Passed (no locks): ${summary.passed}`);
    console.log(`Failed (locks detected): ${summary.failed}`);
    console.log(`Success rate: ${summary.successRate.toFixed(1)}%`);
    console.log('='.repeat(60));
  }
}
