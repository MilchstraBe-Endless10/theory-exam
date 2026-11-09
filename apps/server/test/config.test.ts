import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPrivateLanIPv4 } from '../src/config.js';

test('LAN listener accepts only RFC1918 IPv4 addresses', () => {
  for (const address of ['10.0.0.2', '172.16.0.1', '172.31.255.254', '192.168.1.50']) {
    assert.equal(isPrivateLanIPv4(address), true, address);
  }
  for (const address of ['127.0.0.1', '172.32.0.1', '192.169.0.1', '8.8.8.8', '::1', 'not-an-ip']) {
    assert.equal(isPrivateLanIPv4(address), false, address);
  }
});
