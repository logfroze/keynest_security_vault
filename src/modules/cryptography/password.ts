export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  entropyBits: number;
  feedback: string[];
}

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?';
const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'I', '|']);

function filterAmbiguous(chars: string, exclude: boolean): string {
  if (!exclude) return chars;
  return Array.from(chars)
    .filter((c) => !AMBIGUOUS.has(c))
    .join('');
}

/**
 * Uniform random integer in [0, max) without modulo bias using CSPRNG rejection sampling.
 */
function randomInt(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      return buf[0] % max;
    }
  }
}

export function generateStrongPassword(
  options: Partial<PasswordGeneratorOptions> = {},
): string {
  const opts: PasswordGeneratorOptions = {
    length: Math.max(8, Math.min(128, options.length ?? 20)),
    uppercase: options.uppercase ?? true,
    lowercase: options.lowercase ?? true,
    numbers: options.numbers ?? true,
    symbols: options.symbols ?? true,
    excludeAmbiguous: options.excludeAmbiguous ?? true,
  };

  const pools: string[] = [];
  if (opts.uppercase) pools.push(filterAmbiguous(UPPERCASE, opts.excludeAmbiguous));
  if (opts.lowercase) pools.push(filterAmbiguous(LOWERCASE, opts.excludeAmbiguous));
  if (opts.numbers) pools.push(filterAmbiguous(NUMBERS, opts.excludeAmbiguous));
  if (opts.symbols) pools.push(filterAmbiguous(SYMBOLS, opts.excludeAmbiguous));

  if (pools.length === 0) {
    pools.push(filterAmbiguous(LOWERCASE, opts.excludeAmbiguous));
  }

  const combinedPool = pools.join('');
  const result: string[] = [];

  // Ensure at least one character from each enabled pool
  for (const pool of pools) {
    if (result.length < opts.length) {
      result.push(pool[randomInt(pool.length)]);
    }
  }

  while (result.length < opts.length) {
    result.push(combinedPool[randomInt(combinedPool.length)]);
  }

  // Fisher-Yates shuffle using unbiased CSPRNG
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }

  return result.join('');
}

const COMMON_PASSWORDS = new Set([
  'password',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'letmein',
  'admin',
  'welcome',
  'mypassword123',
  'password123',
]);

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { score: 0, label: 'Weak', entropyBits: 0, feedback: ['Password is empty'] };
  }

  const lower = password.toLowerCase();
  const feedback: string[] = [];
  let charsetSize = 0;

  if (/[a-z]/.test(password)) charsetSize += 26;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) charsetSize += 26;
  else feedback.push('Add uppercase letters');

  if (/[0-9]/.test(password)) charsetSize += 10;
  else feedback.push('Add numbers');

  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;
  else feedback.push('Add special characters');

  if (password.length < 12) {
    feedback.push('Use at least 12 characters');
  }

  // Penalize repeated sequences or common dictionary passwords
  const uniqueChars = new Set(password).size;
  const varietyRatio = uniqueChars / password.length;
  let entropyBits = Math.round(password.length * Math.log2(Math.max(charsetSize, 1)));

  if (varietyRatio < 0.45 && password.length >= 6) {
    entropyBits = Math.round(entropyBits * 0.65);
    feedback.push('Avoid repeated characters');
  }

  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) {
    entropyBits = Math.min(entropyBits, 18);
    feedback.push('Avoid commonly guessed passwords');
  }

  let score: 0 | 1 | 2 | 3 | 4;
  let label: PasswordStrengthResult['label'];

  if (entropyBits < 36 || password.length < 8) {
    score = 1;
    label = 'Weak';
  } else if (entropyBits < 55) {
    score = 2;
    label = 'Fair';
  } else if (entropyBits < 75) {
    score = 3;
    label = 'Good';
  } else {
    score = 4;
    label = 'Strong';
  }

  return {
    score,
    label,
    entropyBits,
    feedback: feedback.slice(0, 2),
  };
}

