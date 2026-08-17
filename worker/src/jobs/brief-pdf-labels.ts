import type { Locale } from '@polyforge/shared';

/**
 * Подписи PDF-документа.
 *
 * Отдельно от словарей next-intl: воркер работает вне контекста запроса,
 * а набор строк здесь узкий и меняется вместе с самим документом.
 */

export interface PdfLabels {
  untitled: string;
  author: string;
  version: string;
  general: string;
  assetType: string;
  quantity: string;
  style: string;
  styleTags: string;
  reference: string;
  tech: string;
  engine: string;
  platform: string;
  polyBudget: string;
  formats: string;
  textures: string;
  pbrYes: string;
  pbrNo: string;
  rigging: string;
  animations: string;
  lods: string;
  delivery: string;
  deliverables: string;
  sources: string;
  revisionRounds: string;
  terms: string;
  deadline: string;
  budget: string;
  budgetOpen: string;
  yes: string;
  no: string;
  disclaimer: string;
  assetTypes: Record<string, string>;
  styles: Record<string, string>;
  platforms: Record<string, string>;
  riggingValues: Record<string, string>;
}

const RU: PdfLabels = {
  untitled: 'Техническое задание',
  author: 'Автор',
  version: 'версия',
  general: '1. Общее',
  assetType: 'Тип ассета',
  quantity: 'Количество',
  style: '2. Стиль и референсы',
  styleTags: 'Стили',
  reference: 'Референс',
  tech: '3. Технические требования',
  engine: 'Движок',
  platform: 'Платформа',
  polyBudget: 'Полигонаж',
  formats: 'Форматы',
  textures: 'Текстуры',
  pbrYes: 'PBR-комплект',
  pbrNo: 'без PBR',
  rigging: 'Риггинг',
  animations: 'Анимации',
  lods: 'LOD-уровни',
  delivery: '4. Состав сдачи',
  deliverables: 'Что входит',
  sources: 'Исходники включены',
  revisionRounds: 'Раундов правок',
  terms: '5. Условия',
  deadline: 'Срок',
  budget: 'Бюджет',
  budgetOpen: 'жду предложений',
  yes: 'да',
  no: 'нет',
  disclaimer:
    'Документ сформирован на платформе PolyForge. Платформа не является стороной расчётов: оплаты происходят напрямую между пользователями, платформа фиксирует предоставленные ими подтверждения.',
  assetTypes: {
    character: 'Персонаж',
    environment: 'Окружение',
    prop: 'Пропс',
    weapon: 'Оружие',
    vehicle: 'Техника',
    building: 'Здание',
    animation: 'Анимация',
    texture: 'Текстуры',
    other: 'Другое',
  },
  styles: {
    realism: 'Реализм',
    stylized: 'Стилизация',
    lowpoly: 'Лоуполи',
    pixel: 'Пиксель',
    anime: 'Аниме',
    scifi: 'Sci-fi',
    fantasy: 'Фэнтези',
    other: 'Другое',
  },
  platforms: {
    pc: 'ПК',
    mobile: 'Мобильные',
    console: 'Консоли',
    vr: 'VR',
    web: 'Веб',
    any: 'Любая',
  },
  riggingValues: {
    none: 'не нужен',
    basic: 'базовый',
    full: 'полный',
    unknown: 'уточняется',
  },
};

const EN: PdfLabels = {
  untitled: 'Brief',
  author: 'Author',
  version: 'version',
  general: '1. General',
  assetType: 'Asset type',
  quantity: 'Quantity',
  style: '2. Style and references',
  styleTags: 'Styles',
  reference: 'Reference',
  tech: '3. Technical requirements',
  engine: 'Engine',
  platform: 'Platform',
  polyBudget: 'Poly budget',
  formats: 'Formats',
  textures: 'Textures',
  pbrYes: 'PBR set',
  pbrNo: 'no PBR',
  rigging: 'Rigging',
  animations: 'Animations',
  lods: 'LOD levels',
  delivery: '4. Deliverables',
  deliverables: 'Included',
  sources: 'Source files included',
  revisionRounds: 'Revision rounds',
  terms: '5. Terms',
  deadline: 'Deadline',
  budget: 'Budget',
  budgetOpen: 'open to proposals',
  yes: 'yes',
  no: 'no',
  disclaimer:
    'Generated on the PolyForge platform. The platform is not a party to any settlement: users pay each other directly and the platform only records the confirmations they provide.',
  assetTypes: {
    character: 'Character',
    environment: 'Environment',
    prop: 'Prop',
    weapon: 'Weapon',
    vehicle: 'Vehicle',
    building: 'Building',
    animation: 'Animation',
    texture: 'Textures',
    other: 'Other',
  },
  styles: {
    realism: 'Realism',
    stylized: 'Stylized',
    lowpoly: 'Low poly',
    pixel: 'Pixel',
    anime: 'Anime',
    scifi: 'Sci-fi',
    fantasy: 'Fantasy',
    other: 'Other',
  },
  platforms: {
    pc: 'PC',
    mobile: 'Mobile',
    console: 'Console',
    vr: 'VR',
    web: 'Web',
    any: 'Any',
  },
  riggingValues: {
    none: 'not required',
    basic: 'basic',
    full: 'full',
    unknown: 'to be confirmed',
  },
};

export function pdfLabels(locale: Locale): PdfLabels {
  return locale === 'en' ? EN : RU;
}
