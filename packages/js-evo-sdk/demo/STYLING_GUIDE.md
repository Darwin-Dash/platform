# Demo App Styling Guide

This guide documents the standardized card and badge system for the Dash Platform Identity Demo App.

## Card Component System

### When to Use Each Card Type

**`.card` - Default Dark Card**
- **Use for**: Most content containers, feature sections, data displays
- **Background**: Always dark (`var(--gray-800)`)
- **Padding**: Standard (`var(--space-6)`)
- **Example**: Settings panels, stat cards, content containers

```html
<div class="card">
  <h2 class="card-title">Identity Overview</h2>
  <p class="card-subtitle">Active identity information</p>
  <div class="card-meta">Last updated: 2 minutes ago</div>
</div>
```

**`.card-dark` - Explicit Dark Card**
- **Use for**: When semantic clarity is important (same styling as `.card`)
- **Background**: Always dark (`var(--gray-800)`)
- **Padding**: Compact (`var(--space-4)`)
- **Example**: Featured content, highlighted sections

```html
<div class="card-dark">
  <h3>Featured Identity</h3>
  <p>Premium features available</p>
</div>
```

**`.card-compact` - List Item Card**
- **Use for**: List items, repeated content, compact displays
- **Background**: Always dark (`var(--gray-800)`)
- **Padding**: Compact (`var(--space-4)`)
- **Shadow**: Subtle (`var(--shadow-sm)`)
- **Example**: Contact lists, document lists, transaction history

```html
<div class="card-compact">
  <div class="contact-info">
    <span class="card-title">John Dash</span>
    <span class="card-meta">john.dash</span>
  </div>
</div>
```

**`.card-adaptive` - Theme-Adaptive Card**
- **Use for**: RARE cases needing system theme following (page containers)
- **Background**: Follows system theme (`var(--surface)`)
- **Padding**: Standard (`var(--space-6)`)
- **Example**: Main page container (rarely needed)

```html
<div class="card-adaptive">
  <p>This card adapts to light/dark system theme</p>
</div>
```

### Text Color Hierarchy

On dark cards (`.card`, `.card-dark`, `.card-compact`), use these text classes:

- **`.card-title`**: Primary headings (`var(--gray-50)`)
- **`.card-subtitle`**: Secondary text (`var(--gray-300)`)
- **`.card-meta`**: Metadata, timestamps, labels (`var(--gray-400)`)

**Example:**
```html
<div class="card">
  <h2 class="card-title">Identity Balance</h2>
  <p class="card-subtitle">Available credits for operations</p>
  <span class="card-meta">Last top-up: 1 hour ago</span>
</div>
```

## Badge System

### When to Use Each Badge Type

**`.badge` - Standard Badge**
- **Use for**: Labels, tags, status indicators, simple badges
- **Background**: Dark semi-transparent (`rgba(0, 0, 0, 0.2)`)
- **Color**: Dash blue (`var(--dash-blue)`)
- **Size**: Small (`var(--text-sm)`)

```html
<span class="badge">DPNS Name</span>
<span class="badge">Verified</span>
<span class="badge">Active</span>
```

**`.badge-large` - Large Badge with Action**
- **Use for**: Badges with buttons, interactive badges, emphasis badges
- **Background**: Dark semi-transparent (`rgba(0, 0, 0, 0.2)`)
- **Color**: Dash blue (`var(--dash-blue)`)
- **Size**: Base (`var(--text-base)`)
- **Layout**: Flexbox with space-between

```html
<div class="badge-large">
  <span>alice.dash</span>
  <button>Copy</button>
</div>
```

## Color Palette Guidelines

### When to Use Semantic Colors

**For theme-adaptive text (rare):**
- `--text-primary`: Main text color (follows system theme)
- `--text-secondary`: Secondary text color (follows system theme)
- `--text-muted`: Muted text color (follows system theme)

**For dark backgrounds (preferred):**
- `--gray-50`: Primary headings on dark backgrounds
- `--gray-300`: Secondary text on dark backgrounds
- `--gray-400`: Metadata, timestamps on dark backgrounds

### Dark Background Text Color Rules

**DO:**
- ✅ Use `var(--gray-50)` for primary text on `var(--gray-800)` backgrounds
- ✅ Use `var(--gray-300)` for secondary text on dark backgrounds
- ✅ Use `var(--gray-400)` for metadata on dark backgrounds

**DON'T:**
- ❌ Don't use `var(--text-primary)` on fixed dark backgrounds (may be invisible)
- ❌ Don't use `var(--surface)` for content cards (use `var(--gray-800)`)
- ❌ Don't mix fixed and semantic colors on same element

## Quick Reference

### Building a List Item?
→ Use `.card-compact`

### Building a Featured Section?
→ Use `.card` or `.card-dark`

### Building a Status Badge?
→ Use `.badge`

### Building a DPNS Name Display with Copy Button?
→ Use `.badge-large`

### Need Theme-Adaptive Container?
→ Use `.card-adaptive` (rare - most content should be dark)

## Common Patterns

### Identity Card Pattern
```html
<div class="identity-card card-dark">
  <div class="identity-card-header">
    <div>
      <div class="card-title">My Identity</div>
      <div class="card-meta">ID: abc123...</div>
    </div>
  </div>
  <div class="identity-card-balance">
    <span class="card-subtitle">1,234,567 credits</span>
  </div>
</div>
```

### Contact Card Pattern
```html
<div class="contact-card card-compact">
  <div class="contact-avatar">
    <img src="..." alt="Avatar">
  </div>
  <div class="contact-info">
    <div class="card-title">Alice Dash</div>
    <div class="card-meta badge">alice.dash</div>
  </div>
</div>
```

### Document Item Pattern
```html
<div class="document-item">
  <div class="document-summary">
    <div class="document-icon">📄</div>
    <div class="document-info">
      <div class="card-title">DPNS Domain</div>
      <div class="card-meta">Created 2 hours ago</div>
    </div>
  </div>
</div>
```

## Anti-Patterns (Don't Do This)

### ❌ Creating Custom Card Classes
```html
<!-- DON'T -->
<div class="my-custom-card">
  <style>
    .my-custom-card {
      background: var(--gray-800);
      border: 1px solid var(--gray-700);
      padding: var(--space-4);
      /* ... duplicating card styles */
    }
  </style>
</div>

<!-- DO -->
<div class="card-compact my-custom-layout">
  <style>
    .my-custom-layout {
      /* Only layout-specific styles */
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  </style>
</div>
```

### ❌ Using var(--text-primary) on Fixed Dark Backgrounds
```html
<!-- DON'T -->
<div style="background: var(--gray-800)">
  <span style="color: var(--text-primary)">Text</span>
  <!-- May be invisible in light mode! -->
</div>

<!-- DO -->
<div class="card">
  <span class="card-title">Text</span>
  <!-- Always visible on dark background -->
</div>
```

### ❌ Mixing Card Backgrounds
```html
<!-- DON'T -->
<div class="card">
  <style>
    .card { background: var(--gray-800); }
  </style>
  <div class="nested-card">
    <style>
      .nested-card { background: var(--surface); }
    </style>
  </div>
</div>

<!-- DO -->
<div class="card">
  <div class="card-compact">
    <!-- Both use consistent dark styling -->
  </div>
</div>
```

## Pre-Commit Checklist

Before committing styling changes, verify:

- [ ] New cards use `.card`, `.card-dark`, or `.card-compact` (not custom classes)
- [ ] Text on dark backgrounds uses `.card-title`, `.card-subtitle`, or `.card-meta`
- [ ] No `var(--text-primary)` on fixed `var(--gray-800)` backgrounds
- [ ] No duplicate card background/border/padding definitions
- [ ] Badges use `.badge` or `.badge-large` (not custom badge classes)
- [ ] Theme-adaptive styling only used where truly needed (`.card-adaptive`)

## Testing Guidelines

After styling changes, test:

1. **Visual Appearance**: Cards display correctly in both light and dark system themes
2. **Text Contrast**: All text is readable on dark backgrounds (use DevTools contrast checker)
3. **Hover States**: Interactive cards have proper hover effects
4. **Responsive Layout**: Cards adapt properly to different screen sizes
5. **Browser Compatibility**: Test in Chrome, Firefox, and Safari

## Need Help?

If you're unsure which card or badge class to use:

1. Check existing similar components in the demo app
2. Refer to this guide's "Quick Reference" section
3. When in doubt, use `.card` for containers and `.badge` for labels
4. Avoid creating new card/badge classes unless absolutely necessary

---

**Last Updated:** 2025-10-16
**Applies To:** packages/js-evo-sdk/demo/styles.css
