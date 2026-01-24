# UI Library Migration Plan

**Target:** Migrate dev-blog to use `@f0rbit/ui` component library  
**Date:** January 24, 2026  
**Status:** Planning

## Executive Summary

The dev-blog project has a custom set of UI components (`Button`, `Input`, `Modal`, `Textarea`, `Select`) and ~1800 lines of global CSS. The `@f0rbit/ui` library provides direct replacements for most of these components, plus additional components not currently used. This migration will:

1. **Replace 5 custom UI components** with library equivalents
2. **Remove ~1200 lines of CSS** that the library handles
3. **Keep ~600 lines of CSS** for domain-specific styling (posts, categories, tokens, etc.)
4. **Adopt library utility classes** for layout and typography

### Breaking Changes Warning
- **Button API change:** `variant="primary"` maps 1:1, but `ghost` variant is new option
- **Modal API change:** Props rename from `isOpen`/`title` to `open`/sub-components
- **Select API change:** Library uses native `<option>` children instead of `options` prop
- **Input/Textarea API change:** Library expects FormField wrapper for labels

---

## Component Analysis

### 1:1 Direct Replacements

| dev-blog Component | @f0rbit/ui Component | Migration Effort | Notes |
|-------------------|---------------------|------------------|-------|
| `Button` | `Button` | **Easy** | Same API, add `ghost` variant option |
| `Input` | `Input` + `FormField` | **Medium** | Need to wrap with FormField |
| `Textarea` | `Textarea` + `FormField` | **Medium** | Need to wrap with FormField |
| `Modal` | `Modal` + sub-components | **Medium** | Restructure with ModalHeader/Body/Footer |
| `Select` | `Select` + `FormField` | **Medium** | Change from `options` prop to children |

### Components That Need Adaptation

| dev-blog Pattern | @f0rbit/ui Equivalent | Changes Needed |
|-----------------|----------------------|----------------|
| `.tag-badge` | `Badge` | Style may differ, evaluate visual fit |
| `.form-error` / `.form-success` | Custom (keep) | No library equivalent |
| `.empty-state` | `Empty` | Good replacement |
| `.spinner` (CSS animation) | `Spinner` | Direct replacement |
| Editor tabs (custom) | `Tabs` | Can use library Tabs |
| `.card` | `Card` | Different structure (sub-components) |

### Components NOT Migratable (No Library Equivalent)

| Component/Pattern | Reason | Action |
|------------------|--------|--------|
| `TagEditor` | Domain-specific multi-select with inline add | Keep custom |
| `CategoryTree` | Custom tree visualization with guides | Keep custom |
| `ProjectSelector` | Custom dropdown with badges | Keep custom |
| `AuthStatus` | Simple, app-specific | Keep custom |
| `DevpadConnection` | App-specific status display | Keep custom |
| `PostPreview` | Markdown rendering | Keep custom |
| `PostEditor` | Complex form composition | Keep, use library form components |

---

## CSS Analysis

### CSS to REMOVE (Library Handles)

```
Lines to delete: ~1200

Sections:
- CSS VARIABLES (partial) - library has its own theme
- RESET & BASE (partial) - library provides reset
- TYPOGRAPHY text color classes - use .text-primary, .text-muted, etc.
- TYPOGRAPHY size classes - use .text-xs, .text-sm, etc.
- LAYOUT UTILITIES (.flex-col, .flex-row, etc.) - use .stack, .row, etc.
- FORM ELEMENTS (base input/select/textarea styling)
- BUTTONS (.btn-primary, .btn-secondary, .btn-danger)
- MODAL styling
- SPINNER animation
```

### CSS to KEEP (Domain-Specific)

```
Lines to keep: ~600

Sections:
- TAG BADGES (customize on top of Badge)
- POST LIST / POST CARD / POST GRID (domain layout)
- POST EDITOR (complex form layout)
- EDITOR TABS (or replace with library Tabs)
- POST PREVIEW / PROSE (markdown rendering)
- CATEGORY TREE (custom tree visualization)
- CATEGORY FORM (inline fieldset styling)
- FILTERS
- TOKENS PAGE (list styling)
- SETTINGS PAGE (fieldset styling)
- PROJECT SELECTOR (custom dropdown)
- DEVPAD CONNECTION
- AUTH STATUS (minimal, can simplify)
```

### CSS Variable Mapping

| dev-blog Variable | @f0rbit/ui Equivalent |
|------------------|----------------------|
| `--text-primary` | `--fg` |
| `--text-secondary` | `--fg-muted` |
| `--text-tertiary` | `--fg-subtle` |
| `--text-muted` | `--fg-faint` |
| `--bg-primary` | `--bg` |
| `--input-background` | `--bg-subtle` |
| `--input-border` | `--border` |
| `--color-danger` | `--danger` |

---

## Migration Phases

### Phase 1: Setup & Infrastructure (~30 LOC changed)
**Can be done independently**

Tasks:
1. Install `@f0rbit/ui` package
2. Add `import "@f0rbit/ui/styles"` to base layout
3. Create CSS variable bridge (map old vars to new or vice versa)

**Estimated effort:** 30 minutes

---

### Phase 2: Replace UI Components (~200 LOC changed)
**Parallel tasks possible**

#### 2A: Replace Button (~40 LOC)
Files: `button.tsx`, all consumers
- Remove custom Button component
- Update imports to `@f0rbit/ui`
- API is nearly identical

#### 2B: Replace Modal (~80 LOC)
Files: `modal.tsx`, `token-form.tsx`
- Remove custom Modal component
- Restructure to use ModalHeader/ModalTitle/ModalBody/ModalFooter
- Update `isOpen` prop to `open`

#### 2C: Replace Input/Textarea/Select (~80 LOC)
Files: `input.tsx`, `textarea.tsx`, `select.tsx`, all consumers
- Remove custom components
- Add FormField wrappers where labels exist
- Update Select from `options` prop to children

**Estimated effort:** 2-3 hours

---

### Phase 3: Adopt Utility Classes (~150 LOC changed)
**Depends on Phase 1**

Tasks:
1. Replace `.flex-col` with `.stack` / `.stack-lg`
2. Replace `.flex-row` with `.row` / `.row-sm`
3. Replace `.text-sm`, `.text-xs`, etc. (mostly same names)
4. Replace color classes: `.muted` -> `.text-muted`, `.tertiary` -> `.text-subtle`
5. Replace `.hidden` (same), `.truncate` (same)

Files affected:
- `categories-page.tsx`
- `settings-page.tsx`
- `token-form.tsx`
- `token-list.tsx`
- `category-form.tsx`
- `post-editor.tsx`
- Multiple Astro pages

**Estimated effort:** 1-2 hours

---

### Phase 4: Replace Domain Patterns (~100 LOC changed)
**Depends on Phase 2**

#### 4A: Replace Empty State (~20 LOC)
Files: `token-list.tsx`, potentially others
- Replace `.empty-state` div with `<Empty>` component

#### 4B: Replace Spinner (~10 LOC)
Files: Any loading states
- Replace `.spinner` CSS class with `<Spinner>` component

#### 4C: Evaluate Editor Tabs (~50 LOC)
Files: `post-editor.tsx`
- Option A: Replace custom tabs with library `Tabs`
- Option B: Keep custom (simpler, matches current look)
- Recommend: Try library Tabs, revert if too different

#### 4D: Evaluate Card Usage (~20 LOC)
Files: Various
- `.card` class vs `Card` component
- Keep CSS class for simple cases, use component for structured content

**Estimated effort:** 1 hour

---

### Phase 5: CSS Cleanup (~800 LOC removed)
**Depends on Phases 2-4**

Tasks:
1. Remove button CSS (`.btn-primary`, `.btn-secondary`, `.btn-danger`, `button[type="submit"]`)
2. Remove modal CSS (`.modal-overlay`, `.modal-card`, etc.)
3. Remove form element base styling (keep domain-specific)
4. Remove layout utility classes
5. Remove typography classes that duplicate library
6. Remove spinner animation
7. Clean up CSS variables (remove duplicates, keep app-specific)

**Estimated effort:** 1-2 hours

---

### Phase 6: Polish & Test (~50 LOC changed)
**Final phase**

Tasks:
1. Visual QA - check all pages
2. Fix any styling regressions
3. Add any missing utility classes
4. Ensure dark mode works correctly
5. Test all interactive components (modals, buttons, forms)

**Estimated effort:** 1-2 hours

---

## Task Breakdown for Agent Execution

### Phase 1: Setup (Sequential)
```
Task 1.1: Add @f0rbit/ui dependency
- File: package.json
- Command: bun add @f0rbit/ui
- LOC: 1

Task 1.2: Import library styles
- File: apps/website/src/layouts/base-layout.astro (or app entry)
- Add: import "@f0rbit/ui/styles"
- LOC: 1

Task 1.3: Create CSS variable bridge
- File: apps/website/src/styles/global.css
- Map old variables to library variables OR vice versa
- LOC: ~30
```

### Phase 2: Replace Components (Parallel)

```
Task 2A: Replace Button (Agent A)
- Delete: apps/website/src/components/ui/button.tsx
- Update imports in:
  - settings-page.tsx
  - token-form.tsx
  - token-list.tsx
  - category-form.tsx
  - post-editor.tsx (uses btn-primary class directly)
- LOC: ~40

Task 2B: Replace Modal (Agent B)
- Delete: apps/website/src/components/ui/modal.tsx
- Update: token-form.tsx (restructure modal content)
- LOC: ~80

Task 2C: Replace Input/Textarea/Select (Agent C)
- Delete: apps/website/src/components/ui/input.tsx
- Delete: apps/website/src/components/ui/textarea.tsx
- Delete: apps/website/src/components/ui/select.tsx
- Update imports in:
  - token-form.tsx
  - category-form.tsx
  - post-editor.tsx (uses native inputs mostly)
- LOC: ~80
```

→ **Verification Agent**: typecheck, test, commit "feat: replace UI components with @f0rbit/ui"

### Phase 3: Utility Classes (Single Agent)
```
Task 3.1: Update layout classes across all TSX files
- Replace class names according to mapping
- Files: ~10 component files
- LOC: ~100

Task 3.2: Update Astro pages
- Files: ~8 pages
- LOC: ~50
```

→ **Verification Agent**: typecheck, test, commit "refactor: adopt library utility classes"

### Phase 4: Domain Patterns (Parallel)

```
Task 4A: Replace Empty/Spinner (Agent A)
- Update: token-list.tsx
- LOC: ~30

Task 4B: Evaluate Tabs replacement (Agent B)
- Update: post-editor.tsx (try library Tabs)
- LOC: ~50
```

→ **Verification Agent**: typecheck, test, commit "feat: use library Empty and Spinner components"

### Phase 5: CSS Cleanup (Single Agent, careful)
```
Task 5.1: Remove replaced CSS sections
- File: apps/website/src/styles/global.css
- Remove: buttons, modal, form elements base, layout utilities, spinner
- LOC: ~-800 (deletion)
```

→ **Verification Agent**: typecheck, **visual QA**, test, commit "chore: remove CSS replaced by library"

### Phase 6: Polish (Sequential)
```
Task 6.1: Visual QA and fixes
- All pages manual review
- Fix regressions
- LOC: ~50
```

→ Final commit "fix: polish UI migration"

---

## Estimated Total Effort

| Phase | Time | LOC Changed |
|-------|------|-------------|
| Phase 1: Setup | 30 min | +30 |
| Phase 2: Components | 2-3 hrs | ~200 |
| Phase 3: Utilities | 1-2 hrs | ~150 |
| Phase 4: Patterns | 1 hr | ~100 |
| Phase 5: CSS Cleanup | 1-2 hrs | ~-800 |
| Phase 6: Polish | 1-2 hrs | ~50 |
| **Total** | **7-12 hours** | **~-270 net** |

---

## Risks & Mitigations

### Risk 1: Visual Regression
**Impact:** Medium  
**Likelihood:** Medium  
**Mitigation:** Phase 5 (CSS cleanup) should be done carefully with visual QA. Consider taking screenshots before/after.

### Risk 2: Theme Mismatch
**Impact:** High  
**Likelihood:** Low  
**Mitigation:** Phase 1 creates CSS variable bridge. Library theme can be customized via CSS variables.

### Risk 3: Modal Behavior Differences
**Impact:** Medium  
**Likelihood:** Low  
**Mitigation:** Library modal has focus trap and proper accessibility. Test token creation flow thoroughly.

### Risk 4: Form Field Label Association
**Impact:** Low  
**Likelihood:** Medium  
**Mitigation:** Library's FormField component handles label association automatically. Ensure `id` props match.

---

## Files Inventory

### Files to DELETE
```
apps/website/src/components/ui/button.tsx
apps/website/src/components/ui/input.tsx
apps/website/src/components/ui/modal.tsx
apps/website/src/components/ui/textarea.tsx
apps/website/src/components/ui/select.tsx
```

### Files to MODIFY (Component Updates)
```
apps/website/src/components/settings/settings-page.tsx
apps/website/src/components/settings/token-form.tsx
apps/website/src/components/settings/token-list.tsx
apps/website/src/components/category/category-form.tsx
apps/website/src/components/category/categories-page.tsx
apps/website/src/components/post/post-editor.tsx
```

### Files to MODIFY (CSS)
```
apps/website/src/styles/global.css
```

### Files to MODIFY (Entry Point)
```
apps/website/src/layouts/base-layout.astro (or equivalent)
```

### Files to KEEP UNCHANGED
```
apps/website/src/components/post/tag-editor.tsx
apps/website/src/components/post/project-selector.tsx
apps/website/src/components/post/post-preview.tsx
apps/website/src/components/category/category-tree.tsx
apps/website/src/components/layout/auth-status.tsx
apps/website/src/components/settings/devpad-connection.tsx
```

---

## Approval Checklist

Before proceeding with implementation:

- [ ] Confirm `@f0rbit/ui` is the correct package name
- [ ] Confirm library styles import path (`@f0rbit/ui/styles`)
- [ ] Decide on CSS variable strategy (bridge vs full adoption)
- [ ] Decide on Tabs component (library vs keep custom)
- [ ] Review Phase 5 CSS sections to remove

---

## Post-Migration Improvements (Future)

Once migration is complete, consider:

1. **Add more library components:**
   - `Status` for token enabled/disabled states
   - `Timeline` for post version history
   - `Toggle` for settings (e.g., token enable/disable)

2. **Adopt library patterns:**
   - Use `Card` with sub-components for post cards
   - Use `Collapsible` for expandable sections

3. **Remove more custom CSS:**
   - As familiarity with library grows, identify more consolidation opportunities
