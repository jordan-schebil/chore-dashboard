import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

if (!globalThis.alert) {
  globalThis.alert = () => {};
}

if (!globalThis.confirm) {
  globalThis.confirm = () => true;
}

vi.spyOn(console, 'warn').mockImplementation(() => {});
