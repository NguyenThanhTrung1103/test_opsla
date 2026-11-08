# Active Plan: Premium UX/UI Redesign — Claude Design Implementation

- **Task**: Implement the approved Claude Design UX/UI mockup into `oops_la_book_store_uxui_fixed.html` and production build.
- **Reference**: Approved mockup in `design-preview/index.html`, `dashboard.html`, `components.html`, `styles.css`.
- **Mode**: `/ak:cook APPROVED — IMPLEMENT UI`.
- **Governance**: Tri-Pillar Architecture, Non-Destructive principle, 100% business logic & API preservation.

## 1. Objectives & Boundaries
- **In Scope**:
  - Update CSS styling, design tokens, color palette, typography scale, radii, and shadows in `oops_la_book_store_uxui_fixed.html` to match the approved Claude Design.
  - Upgrade presentation layers: Header, Hero Showcase, Filter Pills, Product Cards, Look Inside Continuous Viewer, Bag Drawer, Checkout Modal, Messenger Export, and Admin CMS.
  - Re-run `npm run build` to update `dist/index.html`.
  - Validate against all 68 tests (`npm test`).
  - Update `docs/ai-memory/Journal.md` and `docs/ai-memory/handoff.md`.
- **Out of Scope (Strict Non-Goals)**:
  - No changes to API routes, database adapters, service logic, role permission rules (AC-11, AC-15, OD-01, BD-04).
  - No multi-currency (CURR-01 strictly preserved in VNĐ).

## 2. Implementation Steps
1. **Step 1: Backup & Safety Check**: Verify git status and create backup.
2. **Step 2: Apply Claude Design Tokens & Styles**: Replace harsh 0px radius reset and heavy red with refined Claude palette, typography, and shadow tokens.
3. **Step 3: Update Presentation Layer Markup**: Refine classes on Storefront, Hero, Catalog Grid, Modals, and Admin CMS while preserving all element IDs and event handlers.
4. **Step 4: Build & Test Verification**: Execute `npm run build` and `npm test`. Verify 68/68 tests pass.
5. **Step 5: Review & Documentation**: Record technical decision in `docs/ai-memory/Journal.md` and prepare handoff.
