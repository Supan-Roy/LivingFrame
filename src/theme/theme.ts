/**
 * LivingFrame TV Design System
 * Tailored for 10-foot TV viewing experience (1080p standard baseline)
 */

export const colors = {
  // Backgrounds
  background: '#070A11',
  backgroundOverlay: 'rgba(7, 10, 17, 0.82)',
  backgroundGlass: 'rgba(16, 24, 40, 0.72)',
  surface: '#111827',
  surfaceCard: '#151D30',
  surfaceCardElevated: '#1E293B',

  // LivingFrame brand colors
  primary: '#00E5FF',       // Vega / LivingFrame electric cyan
  primaryGlow: 'rgba(0, 229, 255, 0.45)',
  accentGold: '#F59E0B',    // Rating / Warmth
  accentOrange: '#FF6B35',  // Living room ambient tone
  accentEmerald: '#10B981', // Room sensor active status

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Borders & Accents
  borderSubtle: 'rgba(255, 255, 255, 0.10)',
  borderFocus: '#00E5FF',
  borderFocusAlt: '#F59E0B',

  // Status
  badgeBg: 'rgba(255, 255, 255, 0.12)',
  badgeText: '#E2E8F0',
};

export const typography = {
  heroTitle: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  badge: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
};

export const spacing = {
  tvHorizontalPadding: 48,
  tvVerticalPadding: 28,
  cardWidth: 260,
  cardHeight: 146, // 16:9 aspect ratio (260 x 146)
  cardGap: 18,
};
