'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, Download } from 'lucide-react';

export function RecoveryBannerModal({
  recoveryKey,
  email,
  onClose,
}: {
  recoveryKey: string;
  email: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = [
      'KEYNEST NEW RECOVERY KEY',
      `Account: ${email}`,
      `Rotated: ${new Date().toISOString()}`,
      '',
      `Recovery Key: ${recoveryKey}`,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keynest-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs dark:bg-black/75">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#24303F] dark:bg-[#161D26]">
        <div className="mb-3 flex items-center gap-2.5 text-amber-600 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            New Recovery Key Generated
          </h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Your previous recovery key has been invalidated. Save this new key securely — it will not be shown again.
        </p>

        <div className="my-4 rounded-xl border border-teal-300 bg-teal-50/50 p-3.5 font-mono text-xs break-all text-slate-900 select-all dark:border-teal-500/25 dark:bg-[#0F141A] dark:text-slate-100">
          {recoveryKey}
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-[#2C3A4B] dark:bg-[#1E2733] dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5" /> Download .txt
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
        >
          Done
        </button>
      </div>
    </div>
  );
}
