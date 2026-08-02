import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsentGate, ConsentProvider, PreferencesButton, useConsent } from '../src/react/index.js';
import { createMemoryUi, type MemoryUi } from '../src/testing.js';
import type { TrackerDefinition } from '../src/types.js';

const GA: TrackerDefinition = {
  id: 'google-analytics',
  category: 'analytics',
  src: 'https://www.googletagmanager.com/gtag/js?id=G-REACT',
};

function scripts(id = 'google-analytics'): Element[] {
  return [...document.querySelectorAll(`script[data-consent-tracker="${id}"]`)];
}

function Probe() {
  const { isGranted, hasLoaded, ready } = useConsent();
  return (
    <output data-testid="probe">
      {`ready=${ready} analytics=${isGranted('analytics')} ga=${hasLoaded('google-analytics')}`}
    </output>
  );
}

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
});

describe('React wrapper', () => {
  it('does not load a declared tracker before consent, and does after', async () => {
    const ui: MemoryUi = createMemoryUi();

    render(
      <ConsentProvider isolated trackers={[GA]} ui={ui} reloadOnRevoke={false}>
        <Probe />
        <ConsentGate category="analytics" fallback={<span data-testid="gate">blocked</span>}>
          <span data-testid="gate">allowed</span>
        </ConsentGate>
      </ConsentProvider>,
    );

    expect(scripts()).toHaveLength(0);
    expect(screen.getByTestId('gate').textContent).toBe('blocked');
    expect(screen.getByTestId('probe').textContent).toContain('analytics=false');

    await act(async () => {
      ui.grant(['analytics']);
    });

    expect(scripts()).toHaveLength(1);
    expect(screen.getByTestId('gate').textContent).toBe('allowed');
    expect(screen.getByTestId('probe').textContent).toContain('analytics=true');
    expect(screen.getByTestId('probe').textContent).toContain('ga=true');
  });

  it('survives StrictMode double-mounting without injecting twice', async () => {
    const ui: MemoryUi = createMemoryUi();

    render(
      <StrictMode>
        <ConsentProvider isolated trackers={[GA]} ui={ui} reloadOnRevoke={false}>
          <Probe />
        </ConsentProvider>
      </StrictMode>,
    );

    await act(async () => {
      ui.grant(['analytics']);
    });

    expect(scripts()).toHaveLength(1);
  });

  it('re-hides gated content when consent is withdrawn', async () => {
    const ui: MemoryUi = createMemoryUi();

    render(
      <ConsentProvider isolated trackers={[GA]} ui={ui} reloadOnRevoke={false}>
        <ConsentGate category="marketing" fallback={<span data-testid="embed">placeholder</span>}>
          <span data-testid="embed">youtube</span>
        </ConsentGate>
      </ConsentProvider>,
    );

    await act(async () => {
      ui.grant(['marketing']);
    });
    expect(screen.getByTestId('embed').textContent).toBe('youtube');

    await act(async () => {
      ui.grant([]);
    });
    expect(screen.getByTestId('embed').textContent).toBe('placeholder');
  });

  it('PreferencesButton opens the preference centre', async () => {
    const ui: MemoryUi = createMemoryUi();

    render(
      <ConsentProvider isolated ui={ui} reloadOnRevoke={false}>
        <PreferencesButton>Cookie preferences</PreferencesButton>
      </ConsentProvider>,
    );

    expect(ui.preferencesShown).toBe(0);
    await act(async () => {
      screen.getByText('Cookie preferences').click();
    });
    expect(ui.preferencesShown).toBe(1);
  });

  it('useConsent() throws outside the provider', () => {
    expect(() => render(<Probe />)).toThrow(/must be used inside <ConsentProvider>/);
  });
});
