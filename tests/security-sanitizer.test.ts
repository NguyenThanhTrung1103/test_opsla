import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/utils/sanitizer.ts';
import { renderOrderWorkflowTable } from '../src/components/admin/OrderWorkflowTable.ts';
import type { Order } from '../src/types/domain.ts';

describe('Security & XSS Protection Audit', () => {
  test('escapeHtml neutralizes dangerous script tags and characters', () => {
    const malicious = '<script>alert("XSS")</script>&"\'';
    const escaped = escapeHtml(malicious);
    assert.equal(escaped, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;&amp;&quot;&#39;');
    assert.ok(!escaped.includes('<script>'));
  });

  test('renderOrderWorkflowTable escapes malicious customer names and addresses', () => {
    const maliciousOrder: Order = {
      id: 'OLS-999999',
      items: [{
        bookId: 'b-01',
        bookTitle: 'Architectural Graphic <img src=x onerror=alert(1)>',
        isbn: '978-4-88706-338-9',
        unitPriceVND: 1200000,
        quantity: 1
      }],
      subtotalVND: 1200000,
      customer: {
        fullName: '<script>stealCookie()</script>',
        phone: '0901234567"><svg onload=alert(2)>',
        address: '123 Fake St <iframe src="evil.com"></iframe>',
        note: '<style>body{display:none}</style>'
      },
      status: 'PENDING_CONTACT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const rendered = renderOrderWorkflowTable([maliciousOrder], 'OWNER');
    assert.ok(!rendered.includes('<script>stealCookie()</script>'));
    assert.ok(rendered.includes('&lt;script&gt;stealCookie()&lt;/script&gt;'));
    assert.ok(!rendered.includes('<img src=x onerror=alert(1)>'));
    assert.ok(rendered.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!rendered.includes('<iframe'));
  });
});
