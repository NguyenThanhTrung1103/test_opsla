# -*- coding: utf-8 -*-
"""
Patch oops_la_book_store_uxui_fixed.html to align with BRD-OLS-002 v2.0
and user decisions:
- OD-01: Cancel rights (Staff & Owner before confirmed; only Owner after confirmed)
- OD-02: Option A (Stock verification >= 1 before CONFIRMED; block if stock < 1 or unverified)
- Expiration: 48h timeout indicator on stale requests
- OD-03: Option B (Offline refund, no CMS button)
- Remove prototype demo bloat (A/B lab & fake USD toggle)
- Add Owner vs Staff dual-role selector in Admin CMS
- Prevent eager inventory deduction on storefront submit; deduct only upon Owner CONFIRMED
"""
import sys
import re

with open('oops_la_book_store_uxui_fixed.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Header: remove A/B review lab and lock currency to VND
header_old = '''<div class="flex items-center gap-4 sm:gap-6 text-neutral-400">
<button class="text-neutral-300 hover:text-white underline transition cursor-pointer" onclick="openShippingPolicyModal()">ARCHIVAL PACKAGING &amp; POLICY</button>
<button class="admin-only-cta bg-neutral-800 text-taschenGold border border-neutral-600 px-2 py-0.5 hover:bg-white hover:text-inkBlack transition cursor-pointer" onclick="toggleDesignReviewDrawer()">UX REVIEW LAB (A/B)</button>
<button class="text-white underline hover:text-taschenGold transition cursor-pointer" id="currencyBtn" onclick="toggleCurrency()">CURRENCY: VNĐ / USD</button>
</div>'''

header_new = '''<div class="flex items-center gap-4 sm:gap-6 text-neutral-400">
<button class="text-neutral-300 hover:text-white underline transition cursor-pointer" onclick="openShippingPolicyModal()">ARCHIVAL PACKAGING &amp; POLICY</button>
<span class="text-taschenGold font-mono text-[11px] font-semibold tracking-wider flex items-center gap-1.5">
  <span class="w-1.5 h-1.5 rounded-full bg-taschenGold inline-block"></span>
  TIỀN TỆ: VNĐ
</span>
</div>'''

if header_old in html:
    html = html.replace(header_old, header_new, 1)
    print("Step 1: Header currency & review lab updated.")
else:
    print("Warning: Step 1 target not found.")

# 2. Hide floating design review button as per BRD §15
floating_old = 'id="designReviewFloatingTrigger" onclick="toggleDesignReviewDrawer()"'
floating_new = 'id="designReviewFloatingTrigger" style="display:none;" onclick="toggleDesignReviewDrawer()"'
if floating_old in html:
    html = html.replace(floating_old, floating_new, 1)
    print("Step 2: Floating review drawer hidden.")

# 3. Add Dual-Role Selector to Admin Sidebar
sidebar_old = '''<div class="font-serif text-2xl font-semibold tracking-wide mb-8">Admin Portal</div>
<nav class="space-y-1 font-mono text-xs uppercase tracking-wider">'''

sidebar_new = '''<div class="font-serif text-2xl font-semibold tracking-wide mb-4">Admin Portal</div>

<!-- BRD-OLS-002 Dual Role Control Panel -->
<div class="mb-6 p-3 bg-neutral-900 border border-neutral-700">
  <div class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
    <span>VAI TRÒ (BRD §3)</span>
    <span id="adminRoleCurrentLabel" class="text-taschenGold font-bold">OWNER</span>
  </div>
  <div class="grid grid-cols-2 gap-1.5">
    <button id="btnRoleOwner" type="button" onclick="switchAdminRole('OWNER')" class="py-1.5 px-2 text-[10px] font-mono uppercase font-bold transition bg-taschenRed text-white">Owner</button>
    <button id="btnRoleStaff" type="button" onclick="switchAdminRole('STAFF')" class="py-1.5 px-2 text-[10px] font-mono uppercase transition bg-neutral-800 text-neutral-400 hover:text-white">Staff</button>
  </div>
  <div id="adminRoleExplanation" class="text-[10px] text-neutral-400 mt-2 font-mono leading-tight">
    Owner: Toàn quyền duyệt CONFIRMED &amp; trừ kho.
  </div>
</div>

<nav class="space-y-1 font-mono text-xs uppercase tracking-wider">'''

if sidebar_old in html:
    html = html.replace(sidebar_old, sidebar_new, 1)
    print("Step 3: Admin role selector added to sidebar.")
else:
    print("Warning: Step 3 target not found.")

# 4. Remove DRAFT from Admin Order Status Filter
filter_old = '''<select class="border border-gridLine bg-white px-3 py-2 text-xs font-mono uppercase focus:border-inkBlack focus:outline-none" id="adminOrderStatusFilter" onchange="renderAdminOrdersTable()">
<option value="ALL">All Statuses</option>
<option value="DRAFT">DRAFT</option>
<option value="PENDING_CONTACT">PENDING_CONTACT</option>'''

filter_new = '''<select class="border border-gridLine bg-white px-3 py-2 text-xs font-mono uppercase focus:border-inkBlack focus:outline-none" id="adminOrderStatusFilter" onchange="renderAdminOrdersTable()">
<option value="ALL">All Statuses</option>
<option value="PENDING_CONTACT">PENDING_CONTACT</option>'''

if filter_old in html:
    html = html.replace(filter_old, filter_new, 1)
    print("Step 4: DRAFT removed from order filter.")
else:
    print("Warning: Step 4 target not found.")

# 5. Add ROLE to STORAGE_KEYS and adminRole to state
storage_old = '''      CART: 'oopsla_bookstore_cart_v2',
      ORDERS: 'oopsla_bookstore_orders_v2',
      CURRENCY: 'oopsla_bookstore_currency_v2',
      MIGRATED: 'oopsla_bookstore_migrated_v2'
    };

    let state = {
      mode: 'storefront', // 'storefront' | 'admin'
      adminTab: 'dashboard',
      currency: 'VND', // 'VND' | 'USD' '''

storage_new = '''      CART: 'oopsla_bookstore_cart_v2',
      ORDERS: 'oopsla_bookstore_orders_v2',
      CURRENCY: 'oopsla_bookstore_currency_v2',
      ROLE: 'oopsla_bookstore_role_v2',
      MIGRATED: 'oopsla_bookstore_migrated_v2'
    };

    let state = {
      mode: 'storefront', // 'storefront' | 'admin'
      adminTab: 'dashboard',
      adminRole: 'OWNER', // 'OWNER' | 'STAFF' (BRD-OLS-002 Dual Role Governance)
      currency: 'VND', // 'VND' '''

if storage_old in html:
    html = html.replace(storage_old, storage_new, 1)
    print("Step 5: state.adminRole and STORAGE_KEYS.ROLE added.")
else:
    print("Warning: Step 5 target not found.")

# 6. Update loadState & saveState for adminRole
state_io_old = '''        state.articles = savedArticles ? JSON.parse(savedArticles) : [...INITIAL_ARTICLES];
        // Requirement 5.3: First-time visitors start with an empty cart []
        state.cart = savedCart ? JSON.parse(savedCart) : [];
        state.orders = savedOrders ? JSON.parse(savedOrders) : [];
        if (savedCurrency === 'USD' || savedCurrency === 'VND') {
          state.currency = savedCurrency;
        }'''

state_io_new = '''        state.articles = savedArticles ? JSON.parse(savedArticles) : [...INITIAL_ARTICLES];
        // Requirement 5.3: First-time visitors start with an empty cart []
        state.cart = savedCart ? JSON.parse(savedCart) : [];
        const savedRole = localStorage.getItem(STORAGE_KEYS.ROLE);
        if (savedRole === 'OWNER' || savedRole === 'STAFF') {
          state.adminRole = savedRole;
        }
        state.orders = savedOrders ? JSON.parse(savedOrders) : seedInitialDemoOrders();
        state.currency = 'VND';'''

if state_io_old in html:
    html = html.replace(state_io_old, state_io_new, 1)
    print("Step 6: loadState updated with adminRole and seedInitialDemoOrders.")
else:
    print("Warning: Step 6 target not found.")

save_old = '''        localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(state.cart));
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(state.orders));
        localStorage.setItem(STORAGE_KEYS.CURRENCY, state.currency);'''

save_new = '''        localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(state.cart));
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(state.orders));
        localStorage.setItem(STORAGE_KEYS.CURRENCY, state.currency);
        localStorage.setItem(STORAGE_KEYS.ROLE, state.adminRole || 'OWNER');'''

if save_old in html:
    html = html.replace(save_old, save_new, 1)
    print("Step 7: saveState updated with adminRole.")
else:
    print("Warning: Step 7 target not found.")

# 8. Fix submitCollectorOrder: DO NOT eagerly deduct stock!
submit_stock_old = '''        // Deduct mock inventory consistently once per order confirmation
        if (b.availabilityStatus !== 'PRE_ORDER' && b.availabilityStatus !== 'COMING_SOON') {
          b.stockQuantity = Math.max(0, (Number(b.stockQuantity) || 0) - finalQty);
          if (b.stockQuantity === 0) b.availabilityStatus = 'SOLD_OUT';
          else if (b.stockQuantity === 1) b.availabilityStatus = 'ONE_COPY_LEFT';
          else b.availabilityStatus = 'AVAILABLE';
        }'''

submit_stock_new = '''        // BRD §7 & §11 AC-15: Storefront orders DO NOT deduct or reserve stock upon submission!
        // Inventory is ONLY decremented once Owner moves status to CONFIRMED.'''

if submit_stock_old in html:
    html = html.replace(submit_stock_old, submit_stock_new, 1)
    print("Step 8: Removed eager stock deduction in submitCollectorOrder.")
else:
    print("Warning: Step 8 target not found.")

order_record_old = '''      const orderCode = `OOPS-${nextSeq}`;
      const orderRecord = {
        orderId: orderCode,
        createdAt: new Date().toLocaleString('vi-VN'),
        customerName: name,
        customerPhone: phone,
        shippingAddress: address,
        notes: notes || 'Standard reinforced architectural packaging',
        items: orderedItems,
        totalUsd: totalUsd,
        totalDisplayed: formatPrice(totalUsd),
        totalWeightKg: Number(totalKg.toFixed(2)),
        orderType: hasPreOrder ? 'PRE_ORDER_REQUEST' : 'STANDARD_ORDER',
        status: 'PENDING_CONTACT',
        stockDeducted: true,
        isSimulatedDemo: true
      };'''

order_record_new = '''      const orderCode = `OOPS-${nextSeq}`;
      const orderRecord = {
        orderId: orderCode,
        createdAt: new Date().toLocaleString('vi-VN'),
        createdAtTimestamp: Date.now(),
        customerName: name,
        customerPhone: phone,
        shippingAddress: address,
        notes: notes || 'Standard reinforced architectural packaging',
        items: orderedItems,
        totalUsd: totalUsd,
        totalDisplayed: formatPrice(totalUsd),
        totalWeightKg: Number(totalKg.toFixed(2)),
        orderType: hasPreOrder ? 'PRE_ORDER_REQUEST' : 'STANDARD_ORDER',
        status: 'PENDING_CONTACT',
        stockDeducted: false, // BRD §7: Storefront submission does not decrement stock
        isSimulatedDemo: true
      };'''

if order_record_old in html:
    html = html.replace(order_record_old, order_record_new, 1)
    print("Step 9: orderRecord updated with stockDeducted: false and createdAtTimestamp.")
else:
    print("Warning: Step 9 target not found.")

# 10. Update Section 11: ADMIN ORDER MANAGER with Dual-Role, OD-01, OD-02, OD-03 & 48h timeout
orders_mgr_old = '''    // -----------------------------------------------------------------------
    // 11. ADMIN ORDER MANAGER (FEATURE C.4.5)
    // -----------------------------------------------------------------------
    const ORDER_STATUS_BADGES = {
      DRAFT: 'bg-neutral-200 text-neutral-800',
      PENDING_CONTACT: 'bg-taschenGold text-white',
      CONTACTED: 'bg-bowwowBlue text-white',
      CONFIRMED: 'bg-emerald-800 text-white',
      CANCELLED: 'bg-neutral-500 text-white'
    };

    function renderAdminOrdersTable() {
      const tbody = document.getElementById('adminOrdersTableBody');
      if (!tbody) return;

      const searchVal = (document.getElementById('adminOrderSearchInput')?.value || '').toLowerCase().trim();
      const statusFilter = document.getElementById('adminOrderStatusFilter')?.value || 'ALL';

      const filtered = state.orders.filter(ord => {
        const status = ord.status || 'PENDING_CONTACT';
        const matchStatus = statusFilter === 'ALL' || status === statusFilter;
        const matchQuery = !searchVal ||
          (ord.orderId && ord.orderId.toLowerCase().includes(searchVal)) ||
          (ord.customerName && ord.customerName.toLowerCase().includes(searchVal)) ||
          (ord.customerPhone && ord.customerPhone.toLowerCase().includes(searchVal));
        return matchStatus && matchQuery;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="py-12 text-center font-mono text-xs text-neutral-400">
              No demo orders matching current filter. Create an order from Storefront Checkout to inspect it here.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(ord => {
        const st = ord.status || 'PENDING_CONTACT';
        const badgeCls = ORDER_STATUS_BADGES[st] || 'bg-inkBlack text-white';
        const itemCount = (ord.items || []).reduce((acc, i) => acc + i.qty, 0);

        return `
          <tr class="hover:bg-galleryBg">
            <td class="py-3.5 px-4 font-mono font-bold text-inkBlack">${escapeHtml(ord.orderId)}</td>
            <td class="py-3.5 px-4">
              <div class="font-semibold">${escapeHtml(ord.customerName)}</div>
              <div class="font-mono text-[11px] text-neutral-500">${escapeHtml(ord.customerPhone)}</div>
            </td>
            <td class="py-3.5 px-4 font-mono text-[11px] text-neutral-500">${escapeHtml(ord.createdAt)}</td>
            <td class="py-3.5 px-4 font-mono text-[11px]">
              <div>${itemCount} edition(s) (${escapeHtml(ord.totalWeightKg || 0)} kg)</div>
              <div class="text-neutral-400 truncate max-w-[200px]">${escapeHtml((ord.items || []).map(i => `${i.qty}× ${i.title}`).join(', '))}</div>
            </td>
            <td class="py-3.5 px-4 font-mono font-bold">${formatPrice(ord.totalUsd || 0)}</td>
            <td class="py-3.5 px-4 font-mono">
              <select onchange="updateOrderStatus('${escapeHtml(ord.orderId)}', this.value)" class="${badgeCls} px-2 py-1 text-[10px] font-mono uppercase cursor-pointer focus:outline-none">
                ${['DRAFT', 'PENDING_CONTACT', 'CONTACTED', 'CONFIRMED', 'CANCELLED'].map(opt =>
                  `<option value="${opt}" class="bg-white text-inkBlack" ${st === opt ? 'selected' : ''}>${opt}</option>`
                ).join('')}
              </select>
            </td>
            <td class="py-3.5 px-4 text-right font-mono space-x-1.5 whitespace-nowrap">
              <button onclick="openOrderDetailModal('${escapeHtml(ord.orderId)}')" class="border border-inkBlack px-2.5 py-1 text-[10px] uppercase hover:bg-inkBlack hover:text-white transition">View</button>
              <button onclick="updateOrderStatus('${escapeHtml(ord.orderId)}', 'CANCELLED')" class="border border-gridLine bg-white hover:border-inkBlack px-2.5 py-1 text-[10px] uppercase">Cancel</button>
              <button onclick="requestConfirmDeleteOrder('${escapeHtml(ord.orderId)}')" class="border border-gridLine bg-white hover:bg-taschenRed hover:text-white px-2.5 py-1 text-[10px] uppercase">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function updateOrderStatus(orderId, newStatus) {
      const ord = state.orders.find(o => o.orderId === orderId);
      if (!ord) return;
      ord.status = newStatus;
      saveState();
      renderAdminOrdersTable();
      showToast(`Order ${orderId} status → ${newStatus}`);
    }

    function openOrderDetailModal(orderId) {
      const ord = state.orders.find(o => o.orderId === orderId);
      if (!ord) return;

      document.getElementById('orderDetailModalTitle').textContent = `Order Details — ${ord.orderId}`;
      const fbText = formatOrderFacebookMessage(ord);

      document.getElementById('orderDetailModalBody').innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-galleryBg p-4 border border-gridLine">
          <div>
            <div class="text-[10px] text-neutral-400">CUSTOMER INFO</div>
            <div class="font-semibold text-sm mt-0.5">${escapeHtml(ord.customerName)}</div>
            <div>Phone: ${escapeHtml(ord.customerPhone)}</div>
            <div>Address: ${escapeHtml(ord.shippingAddress)}</div>
          </div>
          <div>
            <div class="text-[10px] text-neutral-400">ORDER METADATA</div>
            <div>Order ID: <strong>${escapeHtml(ord.orderId)}</strong></div>
            <div>Date: ${escapeHtml(ord.createdAt)}</div>
            <div>Type: ${escapeHtml(ord.orderType || 'STANDARD_ORDER')}</div>
            <div class="mt-1">
              Status:
              <select onchange="updateOrderStatus('${escapeHtml(ord.orderId)}', this.value); openOrderDetailModal('${escapeHtml(ord.orderId)}');" class="border border-inkBlack bg-white px-2 py-0.5 text-[11px] font-mono uppercase ml-1">
                ${['DRAFT', 'PENDING_CONTACT', 'CONTACTED', 'CONFIRMED', 'CANCELLED'].map(opt =>
                  `<option value="${opt}" ${(ord.status || 'PENDING_CONTACT') === opt ? 'selected' : ''}>${opt}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="border border-gridLine">
          <div class="bg-galleryBg px-4 py-2 border-b border-gridLine text-[10px] uppercase text-neutral-500 font-semibold">Ordered Editions</div>
          <div class="divide-y divide-gridLine">
            ${(ord.items || []).map(item => `
              <div class="p-3 flex justify-between items-center">
                <div>
                  <div class="font-semibold">${escapeHtml(item.title)}</div>
                  <div class="text-[10px] text-neutral-500">${escapeHtml(item.editionSize)} • Qty: ${item.qty}</div>
                </div>
                <div class="font-bold">${formatPrice((item.unitPriceUsd || 0) * item.qty)}</div>
              </div>
            `).join('')}
          </div>
          <div class="bg-galleryBg px-4 py-3 border-t border-gridLine flex justify-between items-center font-bold">
            <span>TOTAL (${escapeHtml(ord.totalWeightKg || 0)} kg)</span>
            <span class="text-sm text-taschenRed">${formatPrice(ord.totalUsd || 0)}</span>
          </div>
        </div>

        <div>
          <label class="block text-[10px] uppercase text-neutral-400 mb-1">FACEBOOK ORDER MESSAGE COPY:</label>
          <textarea id="adminOrderFbCopyBox" readonly rows="6" class="w-full border border-gridLine bg-galleryBg p-3 text-[11px] font-mono select-all">${escapeHtml(fbText)}</textarea>
        </div>

        <div class="flex flex-wrap justify-between gap-2 pt-2">
          <button type="button" onclick="copyTextareaContent('adminOrderFbCopyBox', 'Copied Order Message!')" class="bg-inkBlack text-white hover:bg-taschenRed px-4 py-2.5 text-xs font-mono uppercase">
            Copy Facebook Message
          </button>
          <button type="button" onclick="closeOrderDetailModal()" class="border border-gridLine px-5 py-2.5 text-xs font-mono uppercase hover:border-inkBlack">
            Close
          </button>
        </div>
      `;

      document.getElementById('orderDetailModal').classList.remove('hidden');
    }'''

orders_mgr_new = '''    // -----------------------------------------------------------------------
    // 11. ADMIN ORDER MANAGER (BRD-OLS-002 v2.0 & DECISION ENFORCEMENT)
    // -----------------------------------------------------------------------
    const ORDER_STATUS_BADGES = {
      PENDING_CONTACT: 'bg-taschenGold text-white',
      CONTACTED: 'bg-bowwowBlue text-white',
      CONFIRMED: 'bg-emerald-800 text-white',
      CANCELLED: 'bg-neutral-500 text-white'
    };

    function seedInitialDemoOrders() {
      const now = Date.now();
      return [
        {
          orderId: 'OLS-260401',
          createdAt: new Date(now - 2 * 3600 * 1000).toLocaleString('vi-VN'),
          createdAtTimestamp: now - 2 * 3600 * 1000,
          customerName: 'KTS. Lê Hoàng Quân',
          customerPhone: '0903123456',
          shippingAddress: 'Tòa nhà Landmark 81, P.22, Bình Thạnh, TP.HCM',
          notes: 'Giao giờ hành chính, bọc kỹ góc sách để sưu tầm.',
          items: [{ bookId: 'book-bowwow-1', title: 'Graphic Anatomy — Atelier Bow-Wow', editionSize: 'Standard', qty: 1, unitPriceUsd: 250 }],
          totalUsd: 250,
          totalDisplayed: formatPrice(250),
          totalWeightKg: 2.2,
          orderType: 'STANDARD_ORDER',
          status: 'PENDING_CONTACT',
          stockDeducted: false,
          isSimulatedDemo: true
        },
        {
          orderId: 'OLS-260388',
          createdAt: new Date(now - 52 * 3600 * 1000).toLocaleString('vi-VN'),
          createdAtTimestamp: now - 52 * 3600 * 1000,
          customerName: 'Trần Minh Đức',
          customerPhone: '0918765432',
          shippingAddress: '48 Tràng Tiền, Hoàn Kiếm, Hà Nội',
          notes: 'Cần xác minh cọc trước khi ship.',
          items: [{ bookId: 'book-zumthor-std', title: 'Peter Zumthor: Buildings and Projects', editionSize: 'Standard', qty: 1, unitPriceUsd: 280 }],
          totalUsd: 280,
          totalDisplayed: formatPrice(280),
          totalWeightKg: 3.1,
          orderType: 'STANDARD_ORDER',
          status: 'PENDING_CONTACT',
          stockDeducted: false,
          isSimulatedDemo: true
        },
        {
          orderId: 'OLS-260350',
          createdAt: new Date(now - 24 * 3600 * 1000).toLocaleString('vi-VN'),
          createdAtTimestamp: now - 24 * 3600 * 1000,
          customerName: 'Vũ Thảo Vy',
          customerPhone: '0988112233',
          shippingAddress: 'Phố cổ Hội An, Quảng Nam',
          notes: 'Đã nhận chuyển khoản cọc 50%.',
          items: [{ bookId: 'book-piano-sumo', title: 'Renzo Piano Building Workshop (Complete Works)', editionSize: 'SUMO', qty: 1, unitPriceUsd: 1500 }],
          totalUsd: 1500,
          totalDisplayed: formatPrice(1500),
          totalWeightKg: 14.5,
          orderType: 'STANDARD_ORDER',
          status: 'CONFIRMED',
          stockDeducted: true,
          isSimulatedDemo: true
        }
      ];
    }

    function switchAdminRole(newRole) {
      state.adminRole = newRole;
      saveState();
      updateAdminRoleUI();
      renderAdminOrdersTable();
      showToast(`Đã chuyển vai trò: ${newRole === 'OWNER' ? 'OWNER (Chủ tiệm)' : 'STAFF (Nhân viên)'}`);
    }

    function updateAdminRoleUI() {
      const role = state.adminRole || 'OWNER';
      const btnOwner = document.getElementById('btnRoleOwner');
      const btnStaff = document.getElementById('btnRoleStaff');
      const lbl = document.getElementById('adminRoleCurrentLabel');
      const exp = document.getElementById('adminRoleExplanation');

      if (btnOwner && btnStaff) {
        if (role === 'OWNER') {
          btnOwner.className = 'py-1.5 px-2 text-[10px] font-mono uppercase font-bold transition bg-taschenRed text-white';
          btnStaff.className = 'py-1.5 px-2 text-[10px] font-mono uppercase transition bg-neutral-800 text-neutral-400 hover:text-white';
          if (lbl) lbl.textContent = 'OWNER (Chủ tiệm)';
          if (exp) exp.innerHTML = 'Owner: Toàn quyền xác minh thanh toán/cọc, quyết định <strong class="text-white">CONFIRMED</strong> và trừ kho đúng 1 lần.';
        } else {
          btnStaff.className = 'py-1.5 px-2 text-[10px] font-mono uppercase font-bold transition bg-taschenRed text-white';
          btnOwner.className = 'py-1.5 px-2 text-[10px] font-mono uppercase transition bg-neutral-800 text-neutral-400 hover:text-white';
          if (lbl) lbl.textContent = 'STAFF (Nhân viên)';
          if (exp) exp.innerHTML = 'Staff: Quản lý sách/kho, tiếp nhận đơn (PENDING_CONTACT/CONTACTED/CANCELLED). <span class="text-taschenRed font-bold">CẤM CONFIRMED</span>.';
        }
      }
    }

    function renderAdminOrdersTable() {
      const tbody = document.getElementById('adminOrdersTableBody');
      if (!tbody) return;

      const currentRole = state.adminRole || 'OWNER';
      const searchVal = (document.getElementById('adminOrderSearchInput')?.value || '').toLowerCase().trim();
      const statusFilter = document.getElementById('adminOrderStatusFilter')?.value || 'ALL';

      const filtered = state.orders.filter(ord => {
        const status = ord.status || 'PENDING_CONTACT';
        const matchStatus = statusFilter === 'ALL' || status === statusFilter;
        const matchQuery = !searchVal ||
          (ord.orderId && ord.orderId.toLowerCase().includes(searchVal)) ||
          (ord.customerName && ord.customerName.toLowerCase().includes(searchVal)) ||
          (ord.customerPhone && ord.customerPhone.toLowerCase().includes(searchVal));
        return matchStatus && matchQuery;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="py-12 text-center font-mono text-xs text-neutral-400">
              Chưa có đơn hàng nào khớp với bộ lọc. Gửi yêu cầu mua từ Storefront để kiểm tra tại đây.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(ord => {
        const st = ord.status || 'PENDING_CONTACT';
        const badgeCls = ORDER_STATUS_BADGES[st] || 'bg-inkBlack text-white';
        const itemCount = (ord.items || []).reduce((acc, i) => acc + i.qty, 0);

        // 48-Hour Stale Timeout Check (Question 3)
        const isStale = (st === 'PENDING_CONTACT' || st === 'CONTACTED') && ord.createdAtTimestamp && (Date.now() - ord.createdAtTimestamp > 48 * 3600 * 1000);
        const staleBadge = isStale
          ? `<div class="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-amber-500 text-white animate-pulse">⚠️ QUÁ 48H CHỜ CỌC</div>`
          : '';

        // Role-based option rendering for select
        const statusOptions = ['PENDING_CONTACT', 'CONTACTED', 'CONFIRMED', 'CANCELLED'].map(opt => {
          const isConfirmedOpt = opt === 'CONFIRMED';
          const disabled = isConfirmedOpt && currentRole !== 'OWNER';
          const label = isConfirmedOpt && currentRole !== 'OWNER' ? 'CONFIRMED (Chỉ Owner)' : opt;
          return `<option value="${opt}" ${st === opt ? 'selected' : ''} ${disabled ? 'disabled class="bg-neutral-200 text-neutral-400"' : 'class="bg-white text-inkBlack"'}>${label}</option>`;
        }).join('');

        // Cancel action button permission (OD-01 Option A)
        const canCancel = !(st === 'CONFIRMED' && currentRole !== 'OWNER');
        const cancelBtn = canCancel
          ? `<button onclick="updateOrderStatus('${escapeHtml(ord.orderId)}', 'CANCELLED')" class="border border-gridLine bg-white hover:border-inkBlack px-2.5 py-1 text-[10px] uppercase">Cancel</button>`
          : `<button disabled title="Đơn đã CONFIRMED chỉ Owner mới được hủy" class="border border-neutral-200 text-neutral-300 cursor-not-allowed px-2.5 py-1 text-[10px] uppercase">Cancel</button>`;

        return `
          <tr class="hover:bg-galleryBg">
            <td class="py-3.5 px-4 font-mono font-bold text-inkBlack">
              ${escapeHtml(ord.orderId)}
              ${staleBadge}
            </td>
            <td class="py-3.5 px-4">
              <div class="font-semibold">${escapeHtml(ord.customerName)}</div>
              <div class="font-mono text-[11px] text-neutral-500">${escapeHtml(ord.customerPhone)}</div>
            </td>
            <td class="py-3.5 px-4 font-mono text-[11px] text-neutral-500">${escapeHtml(ord.createdAt)}</td>
            <td class="py-3.5 px-4 font-mono text-[11px]">
              <div>${itemCount} cuốn (${escapeHtml(ord.totalWeightKg || 0)} kg)</div>
              <div class="text-neutral-400 truncate max-w-[200px]">${escapeHtml((ord.items || []).map(i => `${i.qty}× ${i.title}`).join(', '))}</div>
            </td>
            <td class="py-3.5 px-4 font-mono font-bold">${formatPrice(ord.totalUsd || 0)}</td>
            <td class="py-3.5 px-4 font-mono">
              <select onchange="updateOrderStatus('${escapeHtml(ord.orderId)}', this.value)" class="${badgeCls} px-2 py-1 text-[10px] font-mono uppercase cursor-pointer focus:outline-none">
                ${statusOptions}
              </select>
            </td>
            <td class="py-3.5 px-4 text-right font-mono space-x-1.5 whitespace-nowrap">
              <button onclick="openOrderDetailModal('${escapeHtml(ord.orderId)}')" class="border border-inkBlack px-2.5 py-1 text-[10px] uppercase hover:bg-inkBlack hover:text-white transition">View</button>
              ${cancelBtn}
              <button onclick="requestConfirmDeleteOrder('${escapeHtml(ord.orderId)}')" class="border border-gridLine bg-white hover:bg-taschenRed hover:text-white px-2.5 py-1 text-[10px] uppercase">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function updateOrderStatus(orderId, newStatus) {
      const ord = state.orders.find(o => o.orderId === orderId);
      if (!ord) return;
      const currentRole = state.adminRole || 'OWNER';
      const prevStatus = ord.status || 'PENDING_CONTACT';

      // Quy tắc AC-11 & BR-05: Staff KHÔNG được chuyển đơn sang CONFIRMED
      if (newStatus === 'CONFIRMED' && currentRole !== 'OWNER') {
        showToast('⚠️ Từ chối: Theo BRD §3 & AC-11, chỉ OWNER mới có quyền chuyển đơn sang CONFIRMED!', 'error');
        renderAdminOrdersTable();
        return;
      }

      // Quy tắc OD-01 (Option A): Khi đơn đã CONFIRMED, chỉ OWNER mới được quyền CANCELLED
      if (prevStatus === 'CONFIRMED' && newStatus === 'CANCELLED' && currentRole !== 'OWNER') {
        showToast('⚠️ Từ chối: Theo quy định OD-01, đơn đã CONFIRMED chỉ OWNER mới có quyền Hủy (CANCELLED)!', 'error');
        renderAdminOrdersTable();
        return;
      }

      // Quy tắc OD-02 (Option A): Chuyển sang CONFIRMED bắt buộc kiểm tra tồn kho >= 1
      if (newStatus === 'CONFIRMED' && prevStatus !== 'CONFIRMED') {
        let unverifiedItem = null;
        for (const item of (ord.items || [])) {
          const b = state.books.find(x => x.id === (item.bookId || item.id));
          const stock = b ? (Number(b.stockQuantity) || 0) : 0;
          if (!b || b.availabilityStatus === 'SOLD_OUT' || stock < item.qty) {
            unverifiedItem = { item, currentStock: stock };
            break;
          }
        }

        if (unverifiedItem) {
          openConfirmDialog(
            '⚠️ Tồn Kho Chưa Xác Minh / Hết Hàng (OD-02 Option A)',
            `Sách <strong>"${escapeHtml(unverifiedItem.item.title)}"</strong> hiện có tồn kho = ${unverifiedItem.currentStock} (yêu cầu: ${unverifiedItem.item.qty}).<br><br>
            Theo quy định OD-02 (Option A), đơn phải được <strong>giữ ở trạng thái Chờ (Pending Verification)</strong> cho đến khi Nhân viên kiểm đếm và xác nhận chắc chắn tồn kho &ge; 1.<br><br>
            <span class="text-taschenRed font-bold">Hành động bị chặn: Không thể CONFIRMED.</span>`,
            () => {},
            ''
          );
          renderAdminOrdersTable();
          return;
        }

        // Nếu tồn kho hợp lệ: Trừ tồn kho ĐÚNG MỘT LẦN (AC-15)
        if (!ord.stockDeducted) {
          for (const item of (ord.items || [])) {
            const b = state.books.find(x => x.id === (item.bookId || item.id));
            if (b && b.availabilityStatus !== 'PRE_ORDER' && b.availabilityStatus !== 'COMING_SOON') {
              b.stockQuantity = Math.max(0, (Number(b.stockQuantity) || 0) - item.qty);
              if (b.stockQuantity === 0) b.availabilityStatus = 'SOLD_OUT';
              else if (b.stockQuantity === 1) b.availabilityStatus = 'ONE_COPY_LEFT';
              else b.availabilityStatus = 'AVAILABLE';
            }
          }
          ord.stockDeducted = true;
        }
      }

      // Cập nhật trạng thái
      ord.status = newStatus;
      saveState();
      renderAdminOrdersTable();
      renderAdminProductsTable(); // đồng bộ tồn kho hiển thị
      showToast(`Đơn ${orderId} đã cập nhật → ${newStatus}`);
    }

    function openOrderDetailModal(orderId) {
      const ord = state.orders.find(o => o.orderId === orderId);
      if (!ord) return;
      const currentRole = state.adminRole || 'OWNER';
      const st = ord.status || 'PENDING_CONTACT';

      document.getElementById('orderDetailModalTitle').textContent = `Chi tiết yêu cầu — ${ord.orderId}`;
      const fbText = formatOrderFacebookMessage(ord);

      // Status select in modal
      const statusOptions = ['PENDING_CONTACT', 'CONTACTED', 'CONFIRMED', 'CANCELLED'].map(opt => {
        const isConfirmedOpt = opt === 'CONFIRMED';
        const disabled = isConfirmedOpt && currentRole !== 'OWNER';
        const label = isConfirmedOpt && currentRole !== 'OWNER' ? 'CONFIRMED (Chỉ Owner)' : opt;
        return `<option value="${opt}" ${st === opt ? 'selected' : ''} ${disabled ? 'disabled class="text-neutral-400 bg-neutral-100"' : ''}>${label}</option>`;
      }).join('');

      // 48h stale note (Question 3)
      const isStale = (st === 'PENDING_CONTACT' || st === 'CONTACTED') && ord.createdAtTimestamp && (Date.now() - ord.createdAtTimestamp > 48 * 3600 * 1000);
      const staleNotice = isStale
        ? `<div class="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono mb-3">⚠️ <strong>Cảnh báo quá hạn:</strong> Yêu cầu này đã gửi quá 48 giờ chưa xác minh được tiền cọc. Đề xuất nhân viên liên hệ lần cuối hoặc hủy đơn (CANCELLED) để giải phóng lưu vết.</div>`
        : '';

      // Cancelled note (OD-03 Option B)
      const cancelledNotice = st === 'CANCELLED'
        ? `<div class="p-2.5 bg-neutral-100 border border-neutral-300 text-neutral-700 text-xs font-mono mb-3">ℹ️ <strong>Đơn đã CANCELLED (Hủy):</strong> Theo quy định OD-03 (MVP), việc hoàn cọc hoặc xử lý tiền thực hiện thủ công ngoài hệ thống qua trao đổi riêng.</div>`
        : '';

      document.getElementById('orderDetailModalBody').innerHTML = `
        ${staleNotice}
        ${cancelledNotice}
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-galleryBg p-4 border border-gridLine">
          <div>
            <div class="text-[10px] text-neutral-400 font-mono">THÔNG TIN KHÁCH HÀNG</div>
            <div class="font-semibold text-sm mt-0.5">${escapeHtml(ord.customerName)}</div>
            <div>Số điện thoại: <strong>${escapeHtml(ord.customerPhone)}</strong></div>
            <div>Địa chỉ: ${escapeHtml(ord.shippingAddress)}</div>
            <div class="mt-1 text-neutral-500 text-[11px]">Ghi chú: ${escapeHtml(ord.notes || 'Không có')}</div>
          </div>
          <div>
            <div class="text-[10px] text-neutral-400 font-mono">METADATA ĐƠN HÀNG</div>
            <div>Mã đơn: <strong>${escapeHtml(ord.orderId)}</strong></div>
            <div>Ngày tạo: ${escapeHtml(ord.createdAt)}</div>
            <div>Loại đơn: ${escapeHtml(ord.orderType || 'STANDARD_ORDER')}</div>
            <div>Trừ tồn kho: <span class="font-mono font-bold ${ord.stockDeducted ? 'text-emerald-700' : 'text-neutral-500'}">${ord.stockDeducted ? 'ĐÃ TRỪ TỒN' : 'CHƯA TRỪ TỒN'}</span></div>
            <div class="mt-2 flex items-center gap-2">
              <span class="text-xs font-mono uppercase text-neutral-500">TRẠNG THÁI:</span>
              <select onchange="updateOrderStatus('${escapeHtml(ord.orderId)}', this.value); openOrderDetailModal('${escapeHtml(ord.orderId)}');" class="border border-inkBlack bg-white px-2 py-1 text-xs font-mono uppercase">
                ${statusOptions}
              </select>
            </div>
            ${currentRole === 'STAFF' ? '<div class="text-[10px] font-mono text-taschenRed mt-1">※ Vai trò Staff: Không thể chuyển CONFIRMED (cần Owner xác minh cọc).</div>' : ''}
          </div>
        </div>

        <div class="border border-gridLine">
          <div class="bg-galleryBg px-4 py-2 border-b border-gridLine text-[10px] uppercase text-neutral-500 font-semibold">Danh sách sách trong yêu cầu</div>
          <div class="divide-y divide-gridLine">
            ${(ord.items || []).map(item => `
              <div class="p-3 flex justify-between items-center">
                <div>
                  <div class="font-semibold">${escapeHtml(item.title)}</div>
                  <div class="text-[10px] text-neutral-500">${escapeHtml(item.editionSize || 'Standard')} • Số lượng: ${item.qty}</div>
                </div>
                <div class="font-bold">${formatPrice((item.unitPriceUsd || 0) * item.qty)}</div>
              </div>
            `).join('')}
          </div>
          <div class="bg-galleryBg px-4 py-3 border-t border-gridLine flex justify-between items-center font-bold">
            <span>TỔNG CỘNG (${escapeHtml(ord.totalWeightKg || 0)} kg)</span>
            <span class="text-sm text-taschenRed">${formatPrice(ord.totalUsd || 0)}</span>
          </div>
        </div>

        <div>
          <label class="block text-[10px] uppercase text-neutral-400 mb-1">NỘI DUNG TIN NHẮN FACEBOOK MESSENGER:</label>
          <textarea id="adminOrderFbCopyBox" readonly rows="6" class="w-full border border-gridLine bg-galleryBg p-3 text-[11px] font-mono select-all">${escapeHtml(fbText)}</textarea>
        </div>

        <div class="flex flex-wrap justify-between gap-2 pt-2">
          <button type="button" onclick="copyTextareaContent('adminOrderFbCopyBox', 'Đã sao chép tin nhắn Messenger!')" class="bg-inkBlack text-white hover:bg-taschenRed px-4 py-2.5 text-xs font-mono uppercase">
            Sao Chép Tin Nhắn Messenger
          </button>
          <button type="button" onclick="closeOrderDetailModal()" class="border border-gridLine px-5 py-2.5 text-xs font-mono uppercase hover:border-inkBlack">
            Đóng
          </button>
        </div>
      `;

      document.getElementById('orderDetailModal').classList.remove('hidden');
    }'''

if orders_mgr_old in html:
    html = html.replace(orders_mgr_old, orders_mgr_new, 1)
    print("Step 10: Section 11 Admin Order Manager updated with Dual-Role, OD-01, OD-02, OD-03.")
else:
    print("Warning: Step 10 target not found.")

# 11. Call updateAdminRoleUI() inside renderAdminAll()
admin_all_old = '''      renderAdminProductsTable('');
      const currentEditArtId = document.getElementById('editArticleId')?.value;
      const editingArt = currentEditArtId ? state.articles.find(a => a.id === currentEditArtId) : null;
      renderAdminEditorialSection(editingArt ? (editingArt.relatedBookIds || []) : []);
      renderAdminOrdersTable();
      lucide.createIcons();'''

admin_all_new = '''      renderAdminProductsTable('');
      const currentEditArtId = document.getElementById('editArticleId')?.value;
      const editingArt = currentEditArtId ? state.articles.find(a => a.id === currentEditArtId) : null;
      renderAdminEditorialSection(editingArt ? (editingArt.relatedBookIds || []) : []);
      updateAdminRoleUI();
      renderAdminOrdersTable();
      lucide.createIcons();'''

if admin_all_old in html:
    html = html.replace(admin_all_old, admin_all_new, 1)
    print("Step 11: updateAdminRoleUI hooked into renderAdminAll.")
else:
    print("Warning: Step 11 target not found.")

with open('oops_la_book_store_uxui_fixed.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("SUCCESS: oops_la_book_store_uxui_fixed.html updated successfully!")

