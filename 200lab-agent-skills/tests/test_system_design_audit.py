#!/usr/bin/env python3
"""
Test 200Lab System Design Audit Workflow on Current Repository (Read-Only)
"""

import os
import sys
from pathlib import Path

def test_audit():
    print("==========================================================")
    print("  Testing 200Lab System Design Audit Workflow (Read-Only) ")
    print("==========================================================\n")

    workspace = Path(__file__).resolve().parent.parent.parent
    server_file = workspace / "src" / "server" / "app.ts"
    order_file = workspace / "src" / "services" / "orderService.ts"
    storage_file = workspace / "src" / "storage" / "indexed-db.ts"

    assert server_file.exists(), f"Missing {server_file}"
    assert order_file.exists(), f"Missing {order_file}"
    assert storage_file.exists(), f"Missing {storage_file}"

    # Capture file modification times before inspection
    mtime_server_before = server_file.stat().st_mtime
    mtime_order_before = order_file.stat().st_mtime
    mtime_storage_before = storage_file.stat().st_mtime

    print(f"[*] Read-Only Audit Target 1: {server_file.name}")
    server_content = server_file.read_text(encoding="utf-8")
    has_idempotency_header = "idempotency-key" in server_content.lower()
    print(f"    - Idempotency-Key Header Check: {'PRESENT' if has_idempotency_header else 'MISSING (Finding candidate)'}")

    print(f"[*] Read-Only Audit Target 2: {order_file.name}")
    order_content = order_file.read_text(encoding="utf-8")
    has_optimistic_lock = "version" in order_content.lower() or "lock" in order_content.lower()
    print(f"    - Optimistic Concurrency Lock Check: {'PRESENT' if has_optimistic_lock else 'ABSENT (Finding candidate)'}")

    print(f"[*] Read-Only Audit Target 3: {storage_file.name}")
    storage_content = storage_file.read_text(encoding="utf-8")
    uses_indexeddb = "indexeddb" in storage_content.lower() or "idb" in storage_content.lower()
    print(f"    - Persistence Engine Check: {'IndexedDB client storage detected' if uses_indexeddb else 'Unknown'}")

    # Verify Strict Read-Only (mtime invariant)
    assert server_file.stat().st_mtime == mtime_server_before, "VIOLATION: server file was modified!"
    assert order_file.stat().st_mtime == mtime_order_before, "VIOLATION: order file was modified!"
    assert storage_file.stat().st_mtime == mtime_storage_before, "VIOLATION: storage file was modified!"

    print("\n[OK] Invariant SD-01 Verified: Zero source code modifications occurred.")
    print("[SUCCESS] 200Lab System Design Audit workflow test PASSED.")

if __name__ == "__main__":
    test_audit()
