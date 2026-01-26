/**
 * Background Task Manager
 * Manages long-running operations like:
 * - Premium name registrations (voting period tracking)
 * - Multi-step workflows
 * - Background operations
 *
 * Features:
 * - Persistent queue (localStorage)
 * - Progress tracking
 * - Status updates
 * - Integration with notification center
 */

import { stateManager } from '../state-manager.js';
import { notifications } from '../components/notifications.js';

export class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.loadTasks();
  }

  /**
   * Create a new background task
   */
  createTask(taskData) {
    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      type: taskData.type, // 'name-registration', 'identity-update', etc.
      title: taskData.title,
      description: taskData.description || '',
      status: 'queued', // queued, in-progress, completed, failed, cancelled
      progress: 0,
      identityId: taskData.identityId,
      data: taskData.data || {},
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      updatedAt: Date.now(),
      error: null
    };

    this.tasks.set(task.id, task);
    this.saveTasks();

    // Emit task created event
    window.dispatchEvent(new CustomEvent('task-created', { detail: task }));

    // Show in notification center
    this.showTaskNotification(task);

    return task;
  }

  /**
   * Update task status and progress
   */
  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    Object.assign(task, updates, { updatedAt: Date.now() });

    // Track state transitions
    if (updates.status === 'in-progress' && !task.startedAt) {
      task.startedAt = Date.now();
    }
    if ((updates.status === 'completed' || updates.status === 'failed') && !task.completedAt) {
      task.completedAt = Date.now();
    }

    this.tasks.set(taskId, task);
    this.saveTasks();

    // Emit task updated event
    window.dispatchEvent(new CustomEvent('task-updated', { detail: task }));

    // Update notification center
    this.updateTaskNotification(task);

    return task;
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks for an identity
   */
  getTasksByIdentity(identityId, limit = null) {
    const identityTasks = Array.from(this.tasks.values())
      .filter(task => task.identityId === identityId)
      .sort((a, b) => b.createdAt - a.createdAt);

    return limit ? identityTasks.slice(0, limit) : identityTasks;
  }

  /**
   * Get active tasks (queued or in-progress)
   */
  getActiveTasks() {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'queued' || task.status === 'in-progress')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    if (task.status === 'completed' || task.status === 'failed') {
      throw new Error('Cannot cancel completed or failed task');
    }

    return this.updateTask(taskId, {
      status: 'cancelled',
      completedAt: Date.now()
    });
  }

  /**
   * Delete a task (removes from queue)
   */
  deleteTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.tasks.delete(taskId);
    this.saveTasks();

    // Emit task deleted event
    window.dispatchEvent(new CustomEvent('task-deleted', { detail: { taskId } }));

    return true;
  }

  /**
   * Process task queue (simulate background processing)
   */
  async processQueue() {
    const queuedTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const task of queuedTasks) {
      await this.processTask(task.id);
    }
  }

  /**
   * Process a single task
   */
  async processTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      this.updateTask(taskId, {
        status: 'in-progress',
        progress: 10
      });

      // Handle different task types
      switch (task.type) {
        case 'name-registration-regular':
          await this.processRegularNameRegistration(task);
          break;
        case 'name-registration-premium':
          await this.processPremiumNameRegistration(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      this.updateTask(taskId, {
        status: 'completed',
        progress: 100
      });

      notifications.success(`Task completed: ${task.title}`);

    } catch (error) {
      console.error('Task processing failed:', error);

      this.updateTask(taskId, {
        status: 'failed',
        error: error.message,
        progress: 0
      });

      notifications.error(`Task failed: ${task.title}`);
    }
  }

  /**
   * Process regular name registration (instant)
   */
  async processRegularNameRegistration(task) {
    const steps = [
      { progress: 20, delay: 500 },
      { progress: 50, delay: 800 },
      { progress: 80, delay: 600 },
      { progress: 100, delay: 400 }
    ];

    for (const step of steps) {
      this.updateTask(task.id, { progress: step.progress });
      await new Promise(r => setTimeout(r, step.delay));
    }

    // Add name to identity
    const identity = stateManager.getState().identities.get(task.identityId);
    if (identity) {
      const fullName = `${task.data.name}.dash`;
      const updatedNames = [...(identity.dpnsNames || []), fullName];
      stateManager.setIdentity(task.identityId, {
        ...identity,
        dpnsNames: updatedNames
      });
    }
  }

  /**
   * Process premium name registration (voting period)
   */
  async processPremiumNameRegistration(task) {
    // Simulate voting period with progress updates
    const votingPeriodDays = 14;
    const totalMs = 10000; // 10 seconds for demo (represents 2 weeks)
    const updateIntervalMs = 1000; // Update every second

    const startTime = Date.now();
    const endTime = startTime + totalMs;

    const updateProgress = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(100, Math.floor((elapsed / totalMs) * 100));

      const remainingDays = Math.ceil((endTime - now) / (totalMs / votingPeriodDays));

      this.updateTask(task.id, {
        progress,
        data: {
          ...task.data,
          votingEndDate: new Date(now + (endTime - now)).toISOString(),
          remainingDays: Math.max(0, remainingDays)
        }
      });

      if (now < endTime) {
        setTimeout(updateProgress, updateIntervalMs);
      }
    };

    updateProgress();

    // Wait for voting period
    await new Promise(r => setTimeout(r, totalMs));

    // Add name to identity
    const identity = stateManager.getState().identities.get(task.identityId);
    if (identity) {
      const fullName = `${task.data.name}.dash`;
      const updatedNames = [...(identity.dpnsNames || []), fullName];
      stateManager.setIdentity(task.identityId, {
        ...identity,
        dpnsNames: updatedNames
      });
    }
  }

  /**
   * Show task in notification center
   */
  showTaskNotification(task) {
    // Add to notification center through stateManager operation
    stateManager.addOperation({
      type: 'background-task',
      identityId: task.identityId,
      amount: 0,
      message: task.title,
      taskId: task.id,
      taskType: task.type
    });
  }

  /**
   * Update task notification
   */
  updateTaskNotification(task) {
    // Find operation in stateManager and update
    const identity = stateManager.getState().identities.get(task.identityId);
    if (!identity) return;

    const operations = stateManager.getIdentityOperations(task.identityId, 100);
    const operation = operations.find(op => op.taskId === task.id);

    if (operation) {
      let message = task.title;
      if (task.type === 'name-registration-premium' && task.data.remainingDays) {
        message += ` - ${task.data.remainingDays} days remaining`;
      }

      stateManager.updateOperation(operation.id, {
        message,
        progress: task.progress,
        status: task.status === 'completed' ? 'completed' :
                task.status === 'failed' ? 'failed' : 'in-progress'
      });
    }
  }

  /**
   * Persist tasks to localStorage
   */
  saveTasks() {
    try {
      const tasksArray = Array.from(this.tasks.entries());
      localStorage.setItem('dashpay-background-tasks', JSON.stringify(tasksArray));
    } catch (error) {
      console.error('Failed to save tasks:', error);
    }
  }

  /**
   * Load tasks from localStorage
   */
  loadTasks() {
    try {
      const saved = localStorage.getItem('dashpay-background-tasks');
      if (saved) {
        const tasksArray = JSON.parse(saved);
        this.tasks = new Map(tasksArray);

        // Resume any in-progress tasks
        const activeTasks = this.getActiveTasks();
        activeTasks.forEach(task => {
          if (task.status === 'in-progress') {
            this.processTask(task.id);
          }
        });
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.tasks = new Map();
    }
  }

  /**
   * Clear all completed tasks
   */
  clearCompletedTasks() {
    const completedCount = Array.from(this.tasks.values())
      .filter(task => task.status === 'completed').length;

    Array.from(this.tasks.entries()).forEach(([id, task]) => {
      if (task.status === 'completed') {
        this.tasks.delete(id);
      }
    });

    this.saveTasks();

    if (completedCount > 0) {
      notifications.success(`Cleared ${completedCount} completed tasks`);
    }
  }
}

// Create singleton instance
export const taskManager = new TaskManager();
