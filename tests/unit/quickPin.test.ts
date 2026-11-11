import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { generateVek } from '@/modules/cryptography/cryptoEngine';
import {
  disableQuickPinOnDevice,
  enableQuickPinOnDevice,
  hasQuickPinOnDevice,
  isValidFourDigitPin,
  QuickPinWipedError,
  unlockWithQuickPinOnDevice,
} from '@/modules/key-management/quickPin';

describe('Device-Local 4-Digit Quick PIN Unlock', () => {
  it('validates strictly 4-digit PIN format', () => {
    expect(isValidFourDigitPin('1234')).toBe(true);
    expect(isValidFourDigitPin('0007')).toBe(true);
    expect(isValidFourDigitPin('123')).toBe(false);
    expect(isValidFourDigitPin('12345')).toBe(false);
    expect(isValidFourDigitPin('abcd')).toBe(false);
  });

  it('wraps VEK with 4-digit PIN, unwraps correctly, and auto-wipes after 5 wrong attempts', async () => {
    const vek = generateVek();
    const userId = 'pin-user-1';
    const vaultId = 'pin-vault-1';

    await enableQuickPinOnDevice({
      userId,
      vaultId,
      vek,
      pin: '4829',
      kdfProfile: 'interactive',
    });

    expect(await hasQuickPinOnDevice(userId, vaultId)).toBe(true);

    const unwrapped = await unlockWithQuickPinOnDevice({
      userId,
      vaultId,
      pin: '4829',
    });
    expect(Buffer.from(unwrapped).equals(Buffer.from(vek))).toBe(true);

    // 4 wrong attempts warn with remaining count; 5th wrong attempt wipes PIN
    for (let i = 1; i <= 4; i++) {
      await expect(
        unlockWithQuickPinOnDevice({ userId, vaultId, pin: '0000' }),
      ).rejects.toThrow(`${5 - i} attempt`);
    }

    await expect(
      unlockWithQuickPinOnDevice({ userId, vaultId, pin: '0000' }),
    ).rejects.toBeInstanceOf(QuickPinWipedError);

    // PIN must now be wiped even if correct PIN is entered afterwards
    expect(await hasQuickPinOnDevice(userId, vaultId)).toBe(false);
    await expect(
      unlockWithQuickPinOnDevice({ userId, vaultId, pin: '4829' }),
    ).rejects.toBeInstanceOf(QuickPinWipedError);
  });

  it('clears Quick PIN cleanly when disabled manually (e.g. on logout)', async () => {
    const vek = generateVek();
    const userId = 'pin-user-2';
    const vaultId = 'pin-vault-2';

    await enableQuickPinOnDevice({
      userId,
      vaultId,
      vek,
      pin: '7391',
      kdfProfile: 'interactive',
    });
    expect(await hasQuickPinOnDevice(userId, vaultId)).toBe(true);

    await disableQuickPinOnDevice(userId, vaultId);
    expect(await hasQuickPinOnDevice(userId, vaultId)).toBe(false);
  });
});

