'use client';

import React from 'react';
import {
  Code2,
  CreditCard,
  FileLock2,
  Globe,
  Landmark,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import type { VaultCategory } from '@/types/vault';

export function CategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category: VaultCategory;
  className?: string;
}) {
  switch (category) {
    case 'login':
      return <Globe className={className} />;
    case 'developer_secret':
      return <Code2 className={className} />;
    case 'financial':
      return <Landmark className={className} />;
    case 'personal':
      return <User className={className} />;
    case 'payment':
      return <CreditCard className={className} />;
    case 'secure_note':
      return <FileLock2 className={className} />;
    case 'custom':
    default:
      return <SlidersHorizontal className={className} />;
  }
}

const MONOGRAM_COLORS = [
  'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/20 dark:text-teal-300 dark:ring-teal-500/30',
  'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:ring-sky-500/30',
  'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30',
  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30',
  'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
  'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:ring-violet-500/30',
];

export function ServiceMonogram({
  title,
  size = 'md',
}: {
  title: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const clean = title.trim() || 'K';
  const letter = clean.charAt(0).toUpperCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) % MONOGRAM_COLORS.length;
  }
  const colorClass = MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];

  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-xs rounded-lg'
      : size === 'lg'
        ? 'h-11 w-11 text-base rounded-xl'
        : 'h-9 w-9 text-sm rounded-xl';

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-bold ring-1 ${sizeClass} ${colorClass}`}
    >
      {letter}
    </div>
  );
}
