'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Delete, Grid3X3, ShieldCheck, X } from 'lucide-react';

interface QuickPinModalProps {
  isChanging?: boolean;
  onSave: (pin: string) => Promise<void>;
  onClose: () => void;
}

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function QuickPinModal({
  isChanging = false,
  onSave,
  onClose,
}: QuickPinModalProps) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeValue = step === 'enter' ? firstPin : confirmPin;

  const submitFinalPin = useCallback(
    async (candidate: string) => {
      if (candidate !== firstPin) {
        setError('PINs did not match. Re-enter your confirmation PIN.');
        setConfirmPin('');
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await onSave(candidate);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save Quick PIN.');
        setConfirmPin('');
      } finally {
        setBusy(false);
      }
    },
    [firstPin, onClose, onSave],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (busy) return;
      setError(null);

      if (step === 'enter') {
        if (firstPin.length >= 4) return;
        const next = firstPin + digit;
        setFirstPin(next);
        if (next.length === 4) {
          setStep('confirm');
          setConfirmPin('');
        }
        return;
      }

      if (confirmPin.length >= 4) return;
      const nextConfirm = confirmPin + digit;
      setConfirmPin(nextConfirm);
      if (nextConfirm.length === 4) {
        void submitFinalPin(nextConfirm);
      }
    },
    [busy, confirmPin, firstPin, step, submitFinalPin],
  );

  const handleBackspace = useCallback(() => {
    if (busy) return;
    setError(null);
    if (step === 'enter') {
      setFirstPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  }, [busy, step]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, handleBackspace, handleDigit, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs dark:bg-black/75">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400">
              <Grid3X3 className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isChanging ? 'Change Quick PIN' : 'Set 4-Digit Quick PIN'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 'enter'
                  ? 'Step 1 of 2 · Choose a 4-digit code'
                  : 'Step 2 of 2 · Confirm your 4-digit PIN'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-[#1E2733] dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 4-dot PIN Indicator */}
        <div className="my-5 flex items-center justify-center gap-3.5">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < activeValue.length;
            return (
              <div
                key={idx}
                className={`flex h-12 w-12 items-center justify-center rounded-xl border text-lg font-bold transition ${
                  filled
                    ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-400 dark:bg-teal-500/15 dark:text-teal-300'
                    : 'border-slate-300 bg-slate-50 text-slate-300 dark:border-[#2C3A4B] dark:bg-[#0F141A] dark:text-slate-600'
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full transition ${
                    filled
                      ? 'scale-100 bg-teal-600 dark:bg-teal-400'
                      : 'scale-75 bg-slate-300 dark:bg-slate-700'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Tactile Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {KEYPAD_ROWS.flat().map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={busy}
              onClick={() => handleDigit(digit)}
              className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base font-semibold text-slate-900 transition hover:border-teal-400 hover:bg-white active:scale-95 disabled:opacity-50 dark:border-[#273342] dark:bg-[#0F141A] dark:text-white dark:hover:border-teal-500/50 dark:hover:bg-[#1A222D]"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || step === 'enter'}
            onClick={() => {
              setStep('enter');
              setFirstPin('');
              setConfirmPin('');
              setError(null);
            }}
            className="flex h-12 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-35 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300 dark:hover:bg-[#1E2733]"
          >
            {step === 'confirm' ? (
              <>
                <ArrowLeft className="h-3.5 w-3.5" /> Reset
              </>
            ) : (
              'PIN'
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDigit('0')}
            className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base font-semibold text-slate-900 transition hover:border-teal-400 hover:bg-white active:scale-95 disabled:opacity-50 dark:border-[#273342] dark:bg-[#0F141A] dark:text-white dark:hover:border-teal-500/50 dark:hover:bg-[#1A222D]"
          >
            0
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleBackspace}
            aria-label="Backspace"
            className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50 dark:border-[#273342] dark:bg-[#161D26] dark:text-slate-300 dark:hover:bg-[#1E2733]"
          >
            <Delete className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-[#273342] dark:bg-[#0F141A] dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
          <span>
            {busy
              ? 'Encrypting device Quick PIN envelope with Argon2id...'
              : 'Saved only on this device (never synced to cloud). Auto-clears after 5 wrong attempts.'}
          </span>
        </div>
      </div>
    </div>
  );
}

