'use client';

import {
  Award,
  Trophy,
  Medal,
  Star,
  Crown,
  Flame,
  Target,
  Zap,
  Rocket,
  Gem,
  Shield,
  Scale,
  Handshake,
  HeartHandshake,
  Images,
  Palette,
  Boxes,
  Clock,
  Send,
  FileText,
  ClipboardList,
  Coins,
  Moon,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Иконка достижения по имени из каталога (§3, post-MVP №9).
 *
 * Набор закрытый и импортируется поимённо. Раньше здесь стоял
 * `import * as icons from 'lucide-react'` с выбором по строке: удобно, но
 * тянет в клиентскую сборку всю библиотеку ради одной картинки, а опечатка
 * в имени молча превращается в пустое место.
 */
const ICONS: Record<string, LucideIcon> = {
  Award,
  Trophy,
  Medal,
  Star,
  Crown,
  Flame,
  Target,
  Zap,
  Rocket,
  Gem,
  Shield,
  Scale,
  Handshake,
  HeartHandshake,
  Images,
  Palette,
  Boxes,
  Clock,
  Send,
  FileText,
  ClipboardList,
  Coins,
  Moon,
  Sparkles,
};

export function achievementIcon(name: string): LucideIcon {
  return ICONS[name] ?? Award;
}
