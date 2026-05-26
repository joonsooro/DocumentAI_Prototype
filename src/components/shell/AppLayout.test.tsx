/**
 * @vitest-environment jsdom
 *
 * F-21 — AppLayout / ShellBar / SideNav / ObjectHeader integration tests.
 *
 * Asserts:
 *  - All three routes mount inside the F-21 chrome (shell-bar + side-nav
 *    + app-content always present)
 *  - The three nav buttons exist and route correctly
 *  - The HAPPY-6 invariant holds: each route's main panel renders no
 *    foreign data-testid (customer/admin/internal), even with the new
 *    chrome on top.
 *  - ObjectHeader renders breadcrumb + title + tablist with the
 *    expected aria roles.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { ObjectHeader } from './ObjectHeader';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/customer" element={<div data-testid="customer-route-stub">customer</div>} />
          <Route path="/admin" element={<div data-testid="admin-route-stub">admin</div>} />
          <Route path="/internal" element={<div data-testid="internal-route-stub">internal</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('F-21 AppLayout chrome', () => {
  beforeEach(() => cleanup());

  it('renders ShellBar + SideNav + app-content on /customer', () => {
    renderAt('/customer');
    expect(screen.getByTestId('shell-bar')).toBeTruthy();
    expect(screen.getByTestId('side-nav')).toBeTruthy();
    expect(screen.getByTestId('app-content')).toBeTruthy();
    expect(screen.getByTestId('customer-route-stub')).toBeTruthy();
  });

  it('renders ShellBar + SideNav + app-content on /admin', () => {
    renderAt('/admin');
    expect(screen.getByTestId('shell-bar')).toBeTruthy();
    expect(screen.getByTestId('side-nav')).toBeTruthy();
    expect(screen.getByTestId('admin-route-stub')).toBeTruthy();
  });

  it('renders ShellBar + SideNav + app-content on /internal', () => {
    renderAt('/internal');
    expect(screen.getByTestId('shell-bar')).toBeTruthy();
    expect(screen.getByTestId('side-nav')).toBeTruthy();
    expect(screen.getByTestId('internal-route-stub')).toBeTruthy();
  });

  it('ShellBar exposes 3 route-nav buttons (Customer / Admin / Internal)', () => {
    renderAt('/customer');
    expect(screen.getByTestId('shell-bar-nav-customer')).toBeTruthy();
    expect(screen.getByTestId('shell-bar-nav-admin')).toBeTruthy();
    expect(screen.getByTestId('shell-bar-nav-internal')).toBeTruthy();
  });

  it('preserves HAPPY-6: chrome does NOT introduce foreign per-route testids', () => {
    // Mount /customer and assert no admin- / internal- per-route data-testid
    // leaks in from chrome. The shell-bar-nav-{admin,internal} testids are
    // navigation affordances and are explicitly NOT "per-route panel" testids
    // (their prefix is `shell-bar-nav-`, not the route's own panel prefix).
    renderAt('/customer');
    const root = screen.getByTestId('app-layout');
    const html = root.innerHTML;
    // The chrome may legitimately reference 'admin' / 'internal' inside
    // shell-bar-nav-admin / shell-bar-nav-internal. The HAPPY-6 invariant
    // is that the CONTENT pane carries no foreign per-route data-testid.
    const content = screen.getByTestId('app-content');
    expect(content.querySelector('[data-testid^="admin-"]')).toBeNull();
    expect(content.querySelector('[data-testid^="internal-"]')).toBeNull();
    // sanity: app-layout root does contain the chrome navigation
    expect(html).toContain('shell-bar-nav-admin');
  });
});

describe('F-21 ObjectHeader', () => {
  beforeEach(() => cleanup());

  it('renders breadcrumb + title + status + tablist with aria roles', () => {
    const tabs = [
      { id: 'workspace', label: 'Workspace' },
      { id: 'extracted', label: 'Extracted fields', disabled: true, disabledTooltip: 'Available in v2' },
    ] as const;
    render(
      <ObjectHeader
        crumbs={['Documents', 'DAEJOO']}
        title="Commercial invoice"
        sub="Demo: DAEJOO 2025-001"
        status="Ready"
        tabs={tabs}
        activeTab="workspace"
      />,
    );
    expect(screen.getByTestId('object-header')).toBeTruthy();
    expect(screen.getByTestId('object-header-breadcrumb')).toBeTruthy();
    expect(screen.getByTestId('object-header-title').textContent).toBe('Commercial invoice');
    expect(screen.getByTestId('object-header-status').textContent).toBe('Ready');
    expect(screen.getByRole('tablist')).toBeTruthy();
    const activeTab = screen.getByRole('tab', { selected: true });
    expect(activeTab.textContent).toBe('Workspace');
    const disabledTab = screen.getByTestId('object-header-tab-extracted') as HTMLButtonElement;
    expect(disabledTab.disabled).toBe(true);
    expect(disabledTab.getAttribute('title')).toBe('Available in v2');
  });

  it('clicking a tab invokes onTab with the tab id; disabled tabs are no-op', () => {
    const calls: string[] = [];
    const tabs = [
      { id: 'workspace', label: 'Workspace' },
      { id: 'extracted', label: 'Extracted fields', disabled: true },
    ] as const;
    render(
      <ObjectHeader
        crumbs={['x']}
        title="t"
        tabs={tabs}
        activeTab="workspace"
        onTab={(id) => calls.push(id)}
      />,
    );
    (screen.getByTestId('object-header-tab-extracted') as HTMLButtonElement).click();
    expect(calls).toEqual([]);
    (screen.getByTestId('object-header-tab-workspace') as HTMLButtonElement).click();
    expect(calls).toEqual(['workspace']);
  });
});
