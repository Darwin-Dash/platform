# Demo App Scripts

Helper scripts for maintaining the Dash Platform Identity Demo App.

## validate-css.js

Validates styles.css against design system guidelines to catch common anti-patterns.

### Usage

```bash
# Run validation
node scripts/validate-css.js

# Or via npm if added to package.json
npm run validate:css
```

### What It Checks

1. **Duplicate Card Backgrounds**
   - Warns if new classes use `var(--gray-800)` + `var(--gray-700)`
   - Suggests using `.card`, `.card-dark`, or `.card-compact` instead

2. **Text on Dark Backgrounds**
   - Warns if `var(--text-primary)` used near `var(--gray-800)` background
   - Suggests using `.card-title`, `.card-subtitle`, or `.card-meta` instead

3. **Duplicate Badge Styling**
   - Warns if new classes use `rgba(0, 0, 0, 0.2)` background
   - Suggests using `.badge` or `.badge-large` instead

### Exit Codes

- `0`: Validation complete (warnings may exist but don't block)
- Never fails the build - warnings only for developer awareness

### Integration

**Add to package.json:**
```json
{
  "scripts": {
    "validate:css": "node scripts/validate-css.js",
    "precommit": "npm run validate:css && npm test"
  }
}
```

**Add to Git Hook (optional):**
```bash
# .git/hooks/pre-commit
#!/bin/sh
cd packages/js-evo-sdk/demo
node scripts/validate-css.js
```

### Example Output

```
🔍 CSS Validation Results

============================================================
⚠️  Found 2 potential issue(s):

1. Duplicate card backgrounds
   Line 1234: .my-custom-card
   Found var(--gray-800) background. Use .card, .card-dark, or .card-compact instead.
   Code: background: var(--gray-800);

2. Text on dark background
   Line 1240: .my-custom-card
   Using var(--text-primary) near var(--gray-800) background. Use .card-title, .card-subtitle, or .card-meta instead.
   Code: color: var(--text-primary);

============================================================

💡 These are warnings, not errors. Review each case:
   - If intentional, document why in a comment
   - If unintentional, refactor to use design system classes
   - See STYLING_GUIDE.md for guidelines
```

## Future Scripts

Additional helper scripts can be added here:
- `generate-color-palette.js` - Extract color values for documentation
- `check-accessibility.js` - Validate contrast ratios
- `optimize-css.js` - Remove unused styles
