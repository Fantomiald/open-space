import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tailscaleName } from './tailscale.ts';

describe('tailscaleName', () => {
  it('reads the computer name of a running Tailscale', () => {
    assert.equal(tailscaleName({ BackendState: 'Running', Self: { DNSName: 'juliens-macbook-pro.tail875b6e.ts.net.' } }), 'juliens-macbook-pro.tail875b6e.ts.net');
  });

  it('has none while Tailscale is stopped, signed out or answers oddly', () => {
    assert.equal(tailscaleName({ BackendState: 'Stopped', Self: { DNSName: 'mac.tail1.ts.net.' } }), null);
    assert.equal(tailscaleName({ BackendState: 'NeedsLogin', Self: { DNSName: '' } }), null);
    assert.equal(tailscaleName({ BackendState: 'Running', Self: { DNSName: 'evil.com/x' } }), null);
    assert.equal(tailscaleName(null), null);
  });
});
