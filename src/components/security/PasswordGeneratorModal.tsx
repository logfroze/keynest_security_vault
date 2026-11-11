'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  evaluatePasswordStrength,
  generateStrongPassword,
  type PasswordGeneratorOptions,
} from '@/modules/cryptography/password';

export function PasswordGeneratorModal({
  onCopy,
  onClose,
}: {
  onCopy: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<PasswordGeneratorOptions>({
    length: 22,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: true,
  });
  const [generated, setGenerated] = useState(() =>
    generateStrongPassword({ length: 22 }),
  );
  const [copied, setCopied] = useState(false);

  const strength = useMemo(
    () => evaluatePasswordStrength(generated),
    [generated],
  );

  const regenerate = (nextOpts: PasswordGeneratorOptions = opts) => {
    setOpts(nextOpts);
    setGenerated(generateStrongPassword(nextOpts));
  };

  const handleCopy = async () => {
    await onCopy(generated);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs dark:bg-black/75">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Password Generator
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#273342] dark:bg-[#0F141A]">
          <p className="font-mono text-sm font-semibold break-all text-teal-700 select-all dark:text-teal-300">
            {generated}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300">
              Strength:{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {strength.label}
              </span>
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {strength.entropyBits} bits
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#1E2733]">
            <div
              className={`h-full transition-all ${
                strength.score >= 4
                  ? 'w-full bg-emerald-500'
                  : strength.score === 3
                    ? 'w-3/4 bg-teal-500'
                    : strength.score === 2
                      ? 'w-1/2 bg-amber-500'
                      : 'w-1/4 bg-red-500'
              }`}
            />
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
              <span>Length</span>
              <span className="tabular-nums font-bold text-teal-600 dark:text-teal-400">
                {opts.length}
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={64}
              value={opts.length}
              onChange={(e) =>
                regenerate({ ...opts, length: Number(e.target.value) })
              }
              className="w-full accent-teal-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ['uppercase', 'Uppercase (A-Z)'],
                ['lowercase', 'Lowercase (a-z)'],
                ['numbers', 'Numbers (0-9)'],
                ['symbols', 'Symbols (!@#$)'],
                ['excludeAmbiguous', 'Avoid Ambiguous'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-700 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={opts[key]}
                  onChange={(e) =>
                    regenerate({ ...opts, [key]: e.target.checked })
                  }
                  className="accent-teal-600"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => regenerate()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2.5 text-xs font-semibold text-white hover:bg-teal-500"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
