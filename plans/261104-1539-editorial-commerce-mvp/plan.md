---
title: "editorial-commerce-mvp"
description: "Implementation plan for Oops La Book Store - Editorial Commerce MVP based on BRIEF.md, INTENT.md, and BRD-OLS-002"
status: pending
priority: P1
effort: "3-4 days"
tags: ["editorial-commerce", "mvp", "bookstore", "zero-trust", "dual-role", "look-inside"]
created: 2026-11-04
blockedBy: []
blocks: []
---

# Oops La Book Store — Editorial Commerce MVP Implementation Plan

## Overview

Oops La Book Store is an editorial commerce platform for monographs, sumo editions, and architectural technical drawings (1:20 Atelier Bow-Wow) embracing **"Content First, Commerce Second"**. This plan establishes the end-to-end production architecture, storefront curation, continuous vertical "Look Inside" viewer with blueprint zoom, request-based checkout without auto-reservation, and an Admin CMS enforcing strict Dual-Role permissions (`Owner` vs. `Staff`) and core inventory invariants (`OD-01`, `OD-02`, `OD-03 Option B`, `AC-11`, `AC-15`).

## Goals

| # | Goal | Priority | Authority |
|---|------|----------|-----------|
| 1 | Production Architecture & IndexedDB Storage Baseline | P1 | INTENT.md, BRD §5 |
| 2 | Editorial Storefront, Catalog Filtering & Instant Search (VNĐ Only) | P1 | BRIEF §3, CURR-01 |
| 3 | "Look Inside" Continuous Vertical Viewer & 1:20 Blueprint Zoom | P1 | BRIEF §5.1, INTENT §Journey |
| 4 | Collector Request Flow & Messenger Export (Zero Auto-Reservation) | P1 | BRIEF §5.2, BD-04 |
| 5 | Admin CMS with Dual-Role Permissions & Inventory Decrement Invariants | P1 | auth-roles, payments, OD-01, OD-02, AC-11, AC-15 |
| 6 | End-to-End Invariants, TDD Verification & g8s Zero-Trust Compliance | P1 | Tri-Pillar Architecture, BRIEF §5 |

## Phases

| # | Phase | Status | Priority | Effort | Dependencies |
|---|-------|--------|----------|--------|--------------|
| 1 | [Phase 1: Core Architecture & Storage Foundations](./phase-01-start.md) | pending | P1 | 4h | [] |
| 2 | [Phase 2: Storefront Catalog & Instant Search](./phase-02-storefront-catalog-search.md) | pending | P1 | 6h | [1] |
| 3 | [Phase 3: Look Inside Viewer & 1:20 Blueprint Zoom](./phase-03-look-inside-viewer-zoom.md) | pending | P1 | 6h | [1, 2] |
| 4 | [Phase 4: Collector Request Flow & Messenger Export](./phase-04-collector-request-flow.md) | pending | P1 | 5h | [1, 2] |
| 5 | [Phase 5: Admin CMS & Dual-Role Permission Engine](./phase-05-admin-dual-role-cms.md) | pending | P1 | 8h | [1, 4] |
| 6 | [Phase 6: Invariants Verification & g8s Gatekeeper](./phase-06-invariants-tdd-gatekeeper.md) | pending | P1 | 5h | [1, 2, 3, 4, 5] |

## Success Criteria

- [ ] **SC-1 (Look Inside)**: Continuous vertical scroll of architectural spreads with responsive pan/zoom at 1:20 scale without image distortion.
- [ ] **SC-2 (Zero Auto-Reservation)**: Customer requests generate code `OLS-xxxxxx` and empty the bag without locking or reducing book inventory (BD-04).
- [ ] **SC-3 (Messenger Export)**: One-click formatted template generation for direct customer-to-bookstore Facebook Messenger paste.
- [ ] **SC-4 (Staff Gate)**: Staff cannot transition orders to `CONFIRMED` (AC-11) and cannot cancel `CONFIRMED` orders (OD-01).
- [ ] **SC-5 (Owner Gate & Single Decrement)**: Owner can only confirm orders with inventory $\ge 1$ (OD-02); confirmation reduces inventory exactly once (AC-15).
- [ ] **SC-6 (48-Hour Stale Badge)**: Uncontacted orders older than 48 hours show amber alert `⚠️ QUÁ 48H CHỜ CỌC`.
- [ ] **SC-7 (Single Currency)**: All prices strictly formatted in `VNĐ` with zero currency switches (CURR-01).
- [ ] **SC-8 (Zero-Trust Gate)**: Pass `g8s doctor`, zero anti-patterns, and 100% invariant tests passing.

<!-- slug: editorial-commerce-mvp -->
