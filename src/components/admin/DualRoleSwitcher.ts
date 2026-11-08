/**
 * Oops La Book Store — Dual-Role Switcher Component
 * Admin navigation bar component enabling instant switching between
 * Owner (Chủ tiệm) and Staff (Nhân viên) with explicit permission status.
 */

import type { UserRole } from '../../types/domain.ts';

export function renderDualRoleSwitcher(currentRole: UserRole): string {
  const isOwner = currentRole === 'OWNER';

  return `
    <div id="dual-role-switcher" class="flex items-center gap-3 bg-[#FAF7F2] border border-[#111111] p-1.5 font-mono text-xs">
      <span class="text-[#777777] uppercase tracking-wider text-[10px] pl-2 font-semibold">Vai trò CMS:</span>
      
      <div class="inline-flex">
        <button 
          id="role-switch-owner-btn" 
          data-role="OWNER"
          class="px-3 py-1.5 flex items-center gap-1.5 transition-all ${isOwner ? 'bg-[#111111] text-white font-semibold' : 'bg-transparent text-[#555555] hover:text-[#111111]'}"
        >
          <span>👑</span>
          <span>Chủ tiệm (Owner)</span>
        </button>

        <button 
          id="role-switch-staff-btn" 
          data-role="STAFF"
          class="px-3 py-1.5 flex items-center gap-1.5 transition-all ${!isOwner ? 'bg-[#0080C6] text-white font-semibold' : 'bg-transparent text-[#555555] hover:text-[#111111]'}"
        >
          <span>👤</span>
          <span>Nhân viên (Staff)</span>
        </button>
      </div>

      <div class="border-l border-[#D5D0C7] pl-3 pr-2 text-[10px] text-[#555555]">
        ${isOwner ? `
          <span class="text-[#15803D] font-medium">Toàn quyền: Duyệt CONFIRMED & Hủy đơn</span>
        ` : `
          <span class="text-[#D97706] font-medium">Giới hạn: Khóa CONFIRMED (AC-11), Khóa Hủy đơn đã duyệt (OD-01)</span>
        `}
      </div>
    </div>
  `;
}
