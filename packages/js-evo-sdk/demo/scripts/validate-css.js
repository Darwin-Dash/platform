#!/usr/bin/env node
/**
 * CSS Validation Script
 *
 * Checks for common anti-patterns in styles.css that violate the design system.
 * Run before commits to catch styling inconsistencies early.
 *
 * Usage: node scripts/validate-css.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STYLES_PATH = path.join(__dirname, '../styles.css');
const ISSUES = [];

// Read the CSS file
const css = fs.readFileSync(STYLES_PATH, 'utf8');
const lines = css.split('\n');

// Anti-pattern detection rules
const RULES = [
  {
    name: 'Duplicate card backgrounds',
    pattern: /background:\s*var\(--gray-800\)/,
    allowedClasses: ['.card', '.card-dark', '.card-compact', '.card-adaptive'],
    message: 'Found var(--gray-800) background. Use .card, .card-dark, or .card-compact instead.',
  },
  {
    name: 'Text on dark background',
    pattern: /color:\s*var\(--text-primary\)/,
    checkContext: (lineNum, lines) => {
      // Look back 10 lines for var(--gray-800) background
      for (let i = Math.max(0, lineNum - 10); i < lineNum; i++) {
        if (lines[i].includes('var(--gray-800)')) {
          return true;
        }
      }
      return false;
    },
    message: 'Using var(--text-primary) near var(--gray-800) background. Use .card-title, .card-subtitle, or .card-meta instead.',
  },
  {
    name: 'Duplicate badge styling',
    pattern: /background:\s*rgba\(0,\s*0,\s*0,\s*0\.2\)/,
    allowedClasses: ['.badge', '.badge-large', '.dpns-badge', '.dpns-name-tag'],
    message: 'Found rgba(0, 0, 0, 0.2) background. Use .badge or .badge-large instead.',
  },
];

// Track current class name
let currentClassName = null;
let inComment = false;

// Scan each line
lines.forEach((line, lineNum) => {
  const lineNumber = lineNum + 1; // 1-indexed for display

  // Track multi-line comments
  if (line.includes('/*')) inComment = true;
  if (line.includes('*/')) {
    inComment = false;
    return;
  }
  if (inComment) return;

  // Track current class name
  const classMatch = line.match(/^\s*(\.[a-z-]+)\s*\{/);
  if (classMatch) {
    currentClassName = classMatch[1];
  }

  // Check each rule
  RULES.forEach(rule => {
    if (rule.pattern.test(line)) {
      // Check if current class is allowed
      if (rule.allowedClasses && currentClassName) {
        const isAllowed = rule.allowedClasses.some(allowed =>
          currentClassName.startsWith(allowed)
        );
        if (isAllowed) return;
      }

      // Check context if rule has context check
      if (rule.checkContext && !rule.checkContext(lineNum, lines)) {
        return;
      }

      ISSUES.push({
        rule: rule.name,
        line: lineNumber,
        message: rule.message,
        code: line.trim(),
        className: currentClassName,
      });
    }
  });
});

// Report results
console.log('\n🔍 CSS Validation Results\n');
console.log('='.repeat(60));

if (ISSUES.length === 0) {
  console.log('✅ No issues found! CSS follows design system guidelines.');
  process.exit(0);
}

console.log(`⚠️  Found ${ISSUES.length} potential issue(s):\n`);

ISSUES.forEach((issue, index) => {
  console.log(`${index + 1}. ${issue.rule}`);
  console.log(`   Line ${issue.line}: ${issue.className || '(no class context)'}`);
  console.log(`   ${issue.message}`);
  console.log(`   Code: ${issue.code}`);
  console.log();
});

console.log('='.repeat(60));
console.log('\n💡 These are warnings, not errors. Review each case:');
console.log('   - If intentional, document why in a comment');
console.log('   - If unintentional, refactor to use design system classes');
console.log('   - See STYLING_GUIDE.md for guidelines\n');

// Exit with warning code (not failure)
process.exit(0);
