# Full @f0rbit/ui Library Migration Plan

## Executive Summary

The project is in a **broken mixed state** where:
1. Legacy button CSS (`.btn-primary`, `.btn-secondary`, `.btn-danger`) was added back to `global.css`
2. Some SolidJS components use the library `Button` component correctly
3. Astro pages use legacy CSS classes because they can't easily use SolidJS components
4. The landing page has a custom "steps" section that should use the `Stepper` component

**Root Cause of "Buttons Without Borders"**: The library is imported correctly, but the Astro pages use `<a>` and `<button>` elements with legacy CSS classes instead of the library's `Button` component. The legacy `.btn-primary` class in global.css was a workaround that creates styling inconsistency.

## Root Cause Analysis

### Why This Happened
1. **Astro + SolidJS Barrier**: Astro files (`.astro`) can use SolidJS components with `client:load`, but this adds hydration overhead for simple elements like buttons. The temptation is to use plain HTML with CSS classes.

2. **Incomplete Migration**: The library components work in SolidJS files (see `settings-page.tsx`, `category-form.tsx`), but Astro pages went the CSS-class route.

3. **Landing Page Challenge**: The landing page (`index.astro`) has many buttons/links that need styling, and using SolidJS components for each would be overkill.

### The Solution
**For Astro pages**: The `@f0rbit/ui` library exposes CSS through `@f0rbit/ui/styles`. Looking at the library, the Button component uses CSS classes that we can apply directly:

The library's Button component renders with these class patterns:
- Base: Uses CSS custom properties (`--bg`, `--border`, etc.)
- The library's CSS is already imported in `base-layout.astro`

**Strategy**: We have two options:
1. Use SolidJS `Button` component everywhere with `client:load` (adds JS overhead)
2. Create CSS-only button classes that match the library's styling (cleaner for static pages)

**Recommended**: **Option 2** - Create utility CSS classes that match the library exactly, using the same CSS variables. This is what the library internally uses anyway.

But wait - let me re-check the library documentation. The library provides:
- **Components** (SolidJS)
- **Utility Classes** (`.stack`, `.row`, etc.)

The Button component doesn't expose its internal CSS classes. So we need to either:
- Use the Button component with `client:load` 
- Create our own CSS that matches the library's design tokens

**Best path forward**: Use the library's Button component in a thin wrapper that can be used in Astro with minimal hydration, OR accept the CSS approach but make it minimal and use library variables.

Actually, looking at the Astro documentation and the current codebase pattern, the cleanest solution is:

1. **Keep minimal CSS button classes** that use the library's CSS variables correctly
2. **Remove the verbose legacy CSS** and replace with compact styles matching library aesthetics
3. **Use SolidJS components** in `.tsx` files (already done mostly)
4. **Convert the Steps section** to use `Stepper` component

## Detailed Changes

### Phase 1: Remove Legacy CSS, Add Library-Aligned Button CSS

**File: `apps/website/src/styles/global.css`**

Delete the entire BUTTONS section (lines 417-507) and replace with minimal CSS that uses library variables:

```css
/* ==========================================================================
   BUTTONS (Library-aligned)
   Using @f0rbit/ui CSS variables for consistency
   ========================================================================== */

/* Primary button - for CTAs and main actions */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg);
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-decoration: none;
}

.btn-primary:hover {
  background: var(--border);
  border-color: var(--fg-subtle);
  filter: none; /* Override global a:hover filter */
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Secondary button - for secondary actions */
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
  text-decoration: none;
}

.btn-secondary:hover {
  background: var(--bg-alt);
  filter: none;
}

/* Size modifier */
.btn-large {
  padding: var(--space-sm) var(--space-md);
  font-size: var(--text-base);
}

/* Reset button for icon buttons */
.button-reset {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  outline: inherit;
}

button.icon-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--fg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

button.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

Also remove the CSS Variable Bridge section (lines 6-19) since we should use library variables directly. Update body styles to use library variables:

```css
body {
  background: var(--bg);
  color: var(--fg-muted);
  margin: unset;
}
```

**Estimated: ~100 lines changed**

### Phase 2: Convert Landing Page Steps to Stepper Component

**File: `apps/website/src/pages/index.astro`**

The "how it works" section currently uses custom HTML:

```html
<section class="landing-steps">
  <h2 class="section-title">how it works</h2>
  <div class="steps-grid">
    <div class="step">
      <span class="step-number">1</span>
      <h3>connect</h3>
      <p>sign in with github</p>
    </div>
    <!-- ... -->
  </div>
</section>
```

**Option A**: Create a SolidJS component for the steps section (adds hydration)
**Option B**: Keep as static HTML but use library CSS patterns

Given this is a static landing page, **Option B is better** - but we can make the CSS match the library's Stepper visual style more closely.

Actually, looking at the Stepper component from the library:
- It's designed for multi-step progress (with "completed", "current", "upcoming" states)
- The landing page steps are more of a "how-to" guide, not a progress indicator

**Recommendation**: Keep the landing page steps as static HTML but improve the CSS to be more consistent with library aesthetics. The Stepper component is semantically wrong for this use case.

**Changes to `index.astro`**:
1. Remove `.btn-primary` references and inline the button styles OR
2. Create a simple SolidJS `LandingButton` component that wraps the library Button

Let's go with option 2 - create reusable button components for Astro:

**New File: `apps/website/src/components/ui/LinkButton.tsx`**

```tsx
import { Button } from "@f0rbit/ui";
import type { Component, JSX } from "solid-js";

interface LinkButtonProps {
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: JSX.Element;
}

const LinkButton: Component<LinkButtonProps> = (props) => {
  return (
    <a href={props.href} style={{ "text-decoration": "none" }}>
      <Button variant={props.variant ?? "primary"} size={props.size ?? "md"}>
        {props.children}
      </Button>
    </a>
  );
};

export default LinkButton;
```

Then in Astro:
```astro
import LinkButton from "@/components/ui/LinkButton";

<LinkButton client:load href="/posts" variant="primary">dashboard</LinkButton>
```

**However**, this adds hydration overhead. For a landing page, we should minimize JS.

**Final Decision**: Keep CSS-based buttons for Astro pages, but ensure they use library CSS variables. The key is consistency in variables, not necessarily using the same components.

### Phase 3: Update All Astro Pages to Use Consistent Patterns

**Files to Update**:

1. **`apps/website/src/pages/index.astro`** - Keep `.btn-primary` class but styles now come from library-aligned CSS
2. **`apps/website/src/pages/posts/index.astro`** - Same
3. **`apps/website/src/pages/posts/[slug].astro`** - Same  
4. **`apps/website/src/pages/posts/[uuid]/versions.astro`** - Same
5. **`apps/website/src/components/post/post-editor.tsx`** - Convert to use `Button` component

### Phase 4: Convert post-editor.tsx to Use Library Button

**File: `apps/website/src/components/post/post-editor.tsx`**

Change:
```tsx
<button type="button" class="btn-primary" onClick={handleSave} disabled={form.submitting()}>
  {form.submitting() ? "Saving..." : isEditing() ? "Update" : "Create"}
</button>
```

To:
```tsx
import { Button } from "@f0rbit/ui";

<Button variant="primary" onClick={handleSave} disabled={form.submitting()} loading={form.submitting()}>
  {isEditing() ? "Update" : "Create"}
</Button>
```

**Estimated: ~10 lines changed**

### Phase 5: Clean Up CSS Variable Bridge

Remove the legacy variable bridge in global.css since we should use library variables directly:

**Remove**:
```css
:root {
  /* Library semantic tokens -> legacy variable names */
  --bg-primary: var(--bg);
  --bg-subtle: var(--bg-alt);
  /* etc */
}
```

**Update all references** throughout the CSS file to use library variables directly:
- `--bg-primary` → `--bg`
- `--bg-subtle` → `--bg-alt`
- `--text-primary` → `--fg`
- `--text-secondary` → `--fg-muted`
- `--text-tertiary` → `--fg-subtle`
- `--text-muted` → `--fg-faint`
- `--input-background` → `--bg-alt`
- `--input-border` → `--border`

**Estimated: ~200 lines changed (find/replace)**

## Task Breakdown

### Phase 1: CSS Cleanup (can run in parallel after base work)

| Task | Est. Lines | Dependencies |
|------|-----------|--------------|
| 1.1 Remove CSS variable bridge | ~15 | None |
| 1.2 Replace legacy button CSS | ~80 | 1.1 |
| 1.3 Find/replace legacy variable names | ~200 | 1.1 |

### Phase 2: Component Updates (depends on Phase 1)

| Task | Est. Lines | Dependencies |
|------|-----------|--------------|
| 2.1 Convert post-editor.tsx button | ~10 | Phase 1 |
| 2.2 Verify Button usage in settings-page.tsx | ~0 (already done) | None |
| 2.3 Verify Button usage in category-form.tsx | ~0 (already done) | None |
| 2.4 Verify Button usage in token-form.tsx | ~0 (already done) | None |
| 2.5 Verify Button usage in token-list.tsx | ~0 (already done) | None |

### Phase 3: Landing Page Refinement (parallel with Phase 2)

| Task | Est. Lines | Dependencies |
|------|-----------|--------------|
| 3.1 Update landing page to use library variables | ~50 | Phase 1 |
| 3.2 Remove redundant `.btn-large` local style | ~10 | Phase 1 |

### Phase 4: Verification

| Task | Est. Lines | Dependencies |
|------|-----------|--------------|
| 4.1 Test all pages visually | ~0 | Phase 1-3 |
| 4.2 Fix any border/styling issues | ~? | 4.1 |

## Execution Order

```
Phase 1 (Critical - DO FIRST)
├── Task 1.1: Remove CSS variable bridge
├── Task 1.2: Replace legacy button CSS with library-aligned version
└── Task 1.3: Global find/replace of variable names
    └── → Verification Agent: typecheck, test, visual check

Phase 2 (Parallel tasks)
├── Agent A: Task 2.1 - Update post-editor.tsx
├── Agent B: Task 3.1 - Update landing page inline styles
└── Agent C: Task 3.2 - Clean up landing page CSS
    └── → Verification Agent: typecheck, test, visual check, commit
```

## Breaking Changes Called Out

1. **CSS Variable Names Change**: Any custom CSS or components using `--bg-primary`, `--text-primary`, etc. will break. Must update all references.

2. **Button Hover Behavior**: The new button CSS removes `filter: var(--hover-filter)` in favor of background color changes. This changes hover appearance.

3. **Landing Page**: The steps section remains as static HTML. If true Stepper semantics are desired later, this is a separate enhancement.

## Files Changed Summary

| File | Type | Changes |
|------|------|---------|
| `apps/website/src/styles/global.css` | Major | Remove legacy CSS, update all variable references |
| `apps/website/src/components/post/post-editor.tsx` | Minor | Import and use Button component |
| `apps/website/src/pages/index.astro` | Minor | Update inline styles to use library variables |

## Total Estimated Effort

- **Lines to change**: ~350-400
- **Files to modify**: 3-4
- **Estimated time**: 1-2 hours of focused work

## Decision: Stepper Component

After analysis, the landing page "how it works" section should **NOT** use the Stepper component because:
1. Stepper is for multi-step **progress indicators** with state (completed/current/upcoming)
2. The landing page steps are informational, not a progress flow
3. Adding SolidJS hydration to a static landing page adds unnecessary overhead

The current static HTML approach is correct; we just need the CSS to be consistent with the library's design system.

## Gotchas

1. **Astro `<style>` blocks are scoped** - Changes to global.css affect all pages, but `<style>` in `.astro` files are component-scoped. The landing page has extensive scoped styles that need updating.

2. **Library CSS Variables** - The library uses `--space-xs`, `--space-sm`, etc. Make sure these are defined. Looking at the library import, these should be included with `@f0rbit/ui/styles`.

3. **Dark Mode** - The library handles dark mode via CSS variables. Ensure the `:root` and `@media (prefers-color-scheme: dark)` sections don't conflict.

4. **Global `a:hover` filter** - There's a global `a:hover { filter: var(--hover-filter) }` that will affect button links. The button CSS needs to override this with `filter: none`.
