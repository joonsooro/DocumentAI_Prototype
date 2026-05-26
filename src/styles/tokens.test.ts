/**
 * @vitest-environment jsdom
 *
 * F-26 — design-token CSS-variable snapshot.
 *
 * Asserts that the tokens.css file declares the canonical CSS variables
 * F-21/F-22/F-23/F-24/F-27 read by name. jsdom's getComputedStyle does
 * not pick up CSS imported through Vite's module-side-effect channel, so
 * the test loads tokens.css as a string via Node fs and injects it into
 * a real <style> element — that path jsdom does parse, and the assertion
 * still fails if the file drifts away from the app-spec.json#design_tokens
 * source of truth (the literal hex values are pinned in both places).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('F-26 design-token CSS variables', () => {
  beforeAll(() => {
    // tokens.css ships beside this test in src/styles/. Vitest runs with
    // process.cwd() === repo root, so the path resolves deterministically
    // without depending on import.meta.url (jsdom rewrites that to a
    // non-file URL).
    const tokensCssPath = resolve(process.cwd(), 'src/styles/tokens.css');
    const css = readFileSync(tokensCssPath, 'utf8');
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  });

  it('exposes --brand === #0A5FFF on the root element (F-26 acceptance)', () => {
    const styles = getComputedStyle(document.documentElement);
    expect(styles.getPropertyValue('--brand').trim()).toBe('#0A5FFF');
  });

  it('exposes --shell-bg === #0B1421 (F-21 ShellBar background)', () => {
    const styles = getComputedStyle(document.documentElement);
    expect(styles.getPropertyValue('--shell-bg').trim()).toBe('#0B1421');
  });

  it('exposes --sidenav-bg === #0F1B2E (F-21 SideNav background)', () => {
    const styles = getComputedStyle(document.documentElement);
    expect(styles.getPropertyValue('--sidenav-bg').trim()).toBe('#0F1B2E');
  });

  it('exposes the canonical sidenav width tokens (F-21 collapse/expand)', () => {
    const styles = getComputedStyle(document.documentElement);
    expect(styles.getPropertyValue('--sidenav-w-collapsed').trim()).toBe('56px');
    expect(styles.getPropertyValue('--sidenav-w-expanded').trim()).toBe('236px');
  });

  it('declares every spec-pinned palette colour (drift guard)', () => {
    const styles = getComputedStyle(document.documentElement);
    expect(styles.getPropertyValue('--brand-700').trim()).toBe('#0848C7');
    expect(styles.getPropertyValue('--brand-50').trim()).toBe('#EBF2FF');
    expect(styles.getPropertyValue('--ok').trim()).toBe('#107E3E');
    expect(styles.getPropertyValue('--warn').trim()).toBe('#B8590A');
    expect(styles.getPropertyValue('--err').trim()).toBe('#BB1F1F');
  });
});
