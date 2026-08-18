/**
 * Справочники предметной области (§3, §4.3).
 *
 * Значения совпадают с enum'ами Prisma — они же ключи словарей i18n
 * (`taxonomy.specialization.character` и т. д.), поэтому подписи нигде
 * не хардкодятся.
 */

export const SPECIALIZATIONS = [
  'character',
  'environment',
  'props',
  'weapons',
  'vehicles',
  'animation',
  'rigging',
  'texturing',
  'other',
] as const;
export type Specialization = (typeof SPECIALIZATIONS)[number];

export const ART_STYLES = [
  'realism',
  'stylized',
  'lowpoly',
  'pixel',
  'anime',
  'scifi',
  'fantasy',
  'other',
] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

export const ASSET_TYPES = [
  'character',
  'environment',
  'prop',
  'weapon',
  'vehicle',
  'building',
  'animation',
  'texture',
  'other',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/// Целевые платформы из секции tech (§3). Отдельной константой, потому что
/// список нужен и схеме ТЗ, и подстановке подсказок ИИ в конструкторе.
export const PLATFORMS = ['pc', 'mobile', 'console', 'vr', 'web', 'any'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const AVAILABILITY_STATES = ['open', 'busy', 'closed'] as const;
export type Availability = (typeof AVAILABILITY_STATES)[number];

export const DESIGNER_LEVELS = ['novice', 'verified', 'pro', 'top'] as const;
export type DesignerLevel = (typeof DESIGNER_LEVELS)[number];

export const CUSTOMER_TYPES = ['indie', 'studio', 'server_project', 'other'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const WORK_VISIBILITIES = ['public', 'link_only'] as const;
export type WorkVisibility = (typeof WORK_VISIBILITIES)[number];

export const REPORT_CATEGORIES = [
  'spam',
  'abuse',
  'fraud',
  'nsfw',
  'plagiarism',
  'rules_evasion',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_TARGET_TYPES = ['user', 'work', 'order', 'brief', 'message', 'review'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/**
 * Софт и движки — подсказки, а не закрытый список: дизайнер может вписать своё.
 * Поэтому в БД это String[], а здесь только пресеты для автодополнения.
 */
export const SOFTWARE_PRESETS = [
  'Blender',
  'Maya',
  '3ds Max',
  'ZBrush',
  'Substance Painter',
  'Substance Designer',
  'Marmoset Toolbag',
  'Houdini',
  'Cinema 4D',
  'Marvelous Designer',
  'Photoshop',
  'RizomUV',
] as const;

export const ENGINE_PRESETS = [
  'Unity',
  'Unreal Engine',
  'Godot',
  'Roblox',
  'CryEngine',
  'Source 2',
  'Enfusion (Arma)',
  'Minecraft',
] as const;

export const FILE_FORMAT_PRESETS = [
  'FBX',
  'OBJ',
  'GLTF/GLB',
  'BLEND',
  'MA/MB',
  'USD',
  'DAE',
  'STL',
] as const;

/** Валюты, в которых стороны договариваются. Платформа деньги не проводит. */
export const CURRENCIES = ['USD', 'EUR', 'RUB', 'UAH', 'KZT'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Языки, на которых дизайнер готов общаться (не языки интерфейса). */
export const SPOKEN_LANGUAGES = ['ru', 'en', 'uk', 'kk', 'de', 'es', 'pt', 'zh'] as const;
