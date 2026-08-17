import { emptyBriefSections, type BriefSections } from '@polyforge/shared';

/**
 * Девять системных пресетов ТЗ (§4.4).
 *
 * Подписи — ключи словаря i18n (`briefTemplates.<key>.title`), поэтому пресет
 * одинаково читается на обоих языках. Секции заполнены разумными значениями
 * по умолчанию: смысл пресета в том, чтобы заказчику осталось дописать
 * специфику, а не собирать ТЗ с нуля.
 */

interface TemplateSeed {
  key: string;
  order: number;
  build: () => BriefSections;
}

function make(mutate: (sections: BriefSections) => void): () => BriefSections {
  return () => {
    const sections = emptyBriefSections();
    mutate(sections);
    return sections;
  };
}

export const SYSTEM_BRIEF_TEMPLATES: TemplateSeed[] = [
  {
    key: 'mobile_character',
    order: 10,
    build: make((s) => {
      s.general.assetType = 'character';
      s.general.quantity = 1;
      s.style.styleTags = ['stylized', 'lowpoly'];
      s.tech.platform = 'mobile';
      s.tech.engine = 'Unity';
      s.tech.polyBudget = 8000;
      s.tech.formats = ['FBX'];
      s.tech.textures = { resolution: '1k', pbrSet: true, note: '' };
      s.tech.rigging = 'basic';
      s.tech.lods = 2;
      s.delivery.deliverables = ['Модель', 'Текстуры', 'Превью-рендеры'];
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'pc_character_unreal',
    order: 20,
    build: make((s) => {
      s.general.assetType = 'character';
      s.general.quantity = 1;
      s.style.styleTags = ['realism'];
      s.tech.platform = 'pc';
      s.tech.engine = 'Unreal Engine';
      s.tech.polyBudget = 80000;
      s.tech.formats = ['FBX'];
      s.tech.textures = { resolution: '4k', pbrSet: true, note: 'Albedo / Normal / Roughness / Metallic' };
      s.tech.rigging = 'full';
      s.tech.lods = 3;
      s.delivery.deliverables = ['Модель', 'Текстуры', 'Риг', 'Превью-рендеры'];
      s.delivery.revisionRounds = 3;
    }),
  },
  {
    key: 'fps_weapon',
    order: 30,
    build: make((s) => {
      s.general.assetType = 'weapon';
      s.general.quantity = 1;
      s.style.styleTags = ['realism'];
      s.tech.platform = 'pc';
      s.tech.polyBudget = 30000;
      s.tech.formats = ['FBX'];
      s.tech.textures = { resolution: '4k', pbrSet: true, note: '' };
      s.tech.rigging = 'basic';
      s.tech.animationsList = ['Idle', 'Reload', 'Fire'];
      s.delivery.deliverables = ['Модель', 'Текстуры', 'Анимации'];
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'environment_props',
    order: 40,
    build: make((s) => {
      s.general.assetType = 'prop';
      s.general.quantity = 10;
      s.style.styleTags = ['stylized'];
      s.tech.platform = 'pc';
      s.tech.polyBudget = 5000;
      s.tech.formats = ['FBX', 'OBJ'];
      s.tech.textures = { resolution: '2k', pbrSet: true, note: 'Общий атлас на набор' };
      s.tech.rigging = 'none';
      s.delivery.deliverables = ['Набор моделей', 'Атлас текстур', 'Превью-рендеры'];
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'lowpoly_vehicle',
    order: 50,
    build: make((s) => {
      s.general.assetType = 'vehicle';
      s.general.quantity = 1;
      s.style.styleTags = ['lowpoly'];
      s.tech.platform = 'mobile';
      s.tech.polyBudget = 6000;
      s.tech.formats = ['FBX'];
      s.tech.textures = { resolution: '1k', pbrSet: false, note: 'Цветовая палитра' };
      s.tech.rigging = 'none';
      s.delivery.deliverables = ['Модель', 'Текстуры'];
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'stylized_building',
    order: 60,
    build: make((s) => {
      s.general.assetType = 'building';
      s.general.quantity = 1;
      s.style.styleTags = ['stylized', 'fantasy'];
      s.tech.platform = 'pc';
      s.tech.polyBudget = 25000;
      s.tech.formats = ['FBX'];
      s.tech.textures = { resolution: '2k', pbrSet: true, note: '' };
      s.tech.rigging = 'none';
      s.tech.lods = 2;
      s.delivery.deliverables = ['Модель', 'Текстуры', 'Интерьер по согласованию'];
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'animation_set',
    order: 70,
    build: make((s) => {
      s.general.assetType = 'animation';
      s.style.styleTags = ['realism'];
      s.tech.platform = 'pc';
      s.tech.engine = 'Unity';
      s.tech.rigging = 'full';
      s.tech.formats = ['FBX'];
      s.tech.animationsList = ['Idle', 'Walk', 'Run', 'Jump', 'Attack', 'Death'];
      s.delivery.deliverables = ['Набор анимаций', 'Исходники сцены'];
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'retexture',
    order: 80,
    build: make((s) => {
      s.general.assetType = 'texture';
      s.general.quantity = 1;
      s.tech.platform = 'any';
      s.tech.textures = { resolution: '2k', pbrSet: true, note: 'Модель предоставляет заказчик' };
      s.tech.rigging = 'none';
      s.tech.formats = ['PNG'];
      s.delivery.deliverables = ['Комплект текстур', 'Превью на модели'];
      s.delivery.sourcesIncluded = true;
      s.delivery.revisionRounds = 2;
    }),
  },
  {
    key: 'mod_content',
    order: 90,
    build: make((s) => {
      s.general.assetType = 'other';
      s.style.styleTags = ['realism'];
      s.tech.platform = 'pc';
      s.tech.engine = 'Enfusion (Arma)';
      s.tech.polyBudget = 40000;
      s.tech.formats = ['FBX', 'OBJ'];
      s.tech.textures = { resolution: '2k', pbrSet: true, note: '' };
      s.tech.rigging = 'basic';
      s.tech.lods = 3;
      s.delivery.deliverables = ['Модель', 'Текстуры', 'LOD-уровни', 'Конфиг мода'];
      s.delivery.revisionRounds = 2;
    }),
  },
];
