/**
 * Contested Names Viewer Component
 * Displays contested names (voting) for an identity
 */

import { mockContestedNames } from '../mock-data.js';
import { formatTimestamp } from '../utils/formatter.js';
import { notifications } from './notifications.js';

export class ContestedNamesViewer {
  constructor(containerElement, platformOps) {
    this.container = containerElement;
    this.platformOps = platformOps;
    this.identityId = null;
    this.contests = [];
  }

  async loadContests(identityId) {
    this.identityId = identityId;

    try {
      // Get contested names for this identity
      this.contests = await this.platformOps.getContestedNamesForIdentity(identityId);

      // Render the view
      this.render();
    } catch (error) {
      console.error('Failed to load contested names:', error);
      notifications.error('Failed to load contested names');
    }
  }

  render() {
    if (!this.contests || this.contests.length === 0) {
      this.container.innerHTML = `
        <div class="empty-message">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin: 0 auto var(--space-3); opacity: 0.3;">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p>No contested names</p>
          <p class="empty-subtext">You are not participating in any name auctions</p>
        </div>
      `;
      return;
    }

    const contestCards = this.contests.map(contest => this.renderContest(contest)).join('');

    this.container.innerHTML = `
      <div class="contested-names-list">
        ${contestCards}
      </div>
    `;
  }

  renderContest(contest) {
    const isActive = contest.status === 'active';
    const voteEndDate = new Date(contest.voteEndDate);
    const now = new Date();
    const timeRemaining = voteEndDate - now;
    const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

    // Find this identity's position
    const userContender = contest.contenders.find(c => c.identityId === this.identityId);
    const userPosition = contest.contenders
      .sort((a, b) => b.votes - a.votes)
      .findIndex(c => c.identityId === this.identityId) + 1;

    const statusInfo = this.getContestStatus(contest, userContender, userPosition);

    return `
      <div class="contest-card ${isActive ? 'contest-active' : 'contest-completed'}">
        <div class="contest-header">
          <div class="contest-name-info">
            <h4 class="contest-name">${contest.name}</h4>
            <span class="contest-normalized">Normalized: ${contest.normalizedName}</span>
          </div>
          <span class="contest-status-badge ${isActive ? 'status-active' : 'status-completed'}">
            ${isActive ? '🗳️ Voting' : contest.winner === this.identityId ? '🏆 Won' : '❌ Lost'}
          </span>
        </div>

        ${isActive ? `
          <div class="contest-timer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>Vote ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</span>
            <span class="timer-date">${formatTimestamp(contest.voteEndDate)}</span>
          </div>
        ` : `
          <div class="contest-completed-info">
            <span>Voting ended: ${formatTimestamp(contest.voteEndDate)}</span>
          </div>
        `}

        <div class="contest-stats">
          <div class="contest-stat">
            <span class="stat-label">Your Position</span>
            <span class="stat-value">#${userPosition}</span>
          </div>
          <div class="contest-stat">
            <span class="stat-label">Your Votes</span>
            <span class="stat-value">${userContender?.votes || 0}</span>
          </div>
          <div class="contest-stat">
            <span class="stat-label">Contenders</span>
            <span class="stat-value">${contest.contenders.length}</span>
          </div>
          <div class="contest-stat">
            <span class="stat-label">Total Votes</span>
            <span class="stat-value">${contest.totalVotes}</span>
          </div>
        </div>

        <div class="contest-status-message ${statusInfo.class}">
          ${statusInfo.icon} ${statusInfo.message}
        </div>
      </div>
    `;
  }

  getContestStatus(contest, userContender, userPosition) {
    if (contest.status === 'completed') {
      if (contest.winner === this.identityId) {
        return {
          icon: '🎉',
          message: 'Congratulations! You won this name auction',
          class: 'status-won'
        };
      } else {
        return {
          icon: '😔',
          message: 'This auction has ended. You did not win.',
          class: 'status-lost'
        };
      }
    }

    // Active contest
    if (userPosition === 1) {
      return {
        icon: '🥇',
        message: 'You are currently in the lead!',
        class: 'status-leading'
      };
    } else if (userPosition === 2) {
      return {
        icon: '🥈',
        message: 'You are in 2nd place. Keep campaigning!',
        class: 'status-close'
      };
    } else {
      return {
        icon: '📊',
        message: `You are in position #${userPosition}. Rally for more votes!`,
        class: 'status-behind'
      };
    }
  }
}
