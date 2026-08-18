/**
 * Стартовый пул тестовых заданий для верификации (§4.9).
 *
 * По одному заданию на специализацию: этого достаточно, чтобы проверка
 * работала с первого дня, а расширять пул админ может из админки.
 *
 * Тексты лежат сразу на двух языках в самой записи, а не в словарях:
 * задания редактирует админ, и i18n-файлы для этого не годятся.
 */

export interface TestTaskSeed {
  specialization: string;
  titleRu: string;
  titleEn: string;
  bodyRu: string;
  bodyEn: string;
  estimateHours: number;
}

export const SYSTEM_TEST_TASKS: TestTaskSeed[] = [
  {
    specialization: 'character',
    titleRu: 'Стилизованный персонаж для мобильной игры',
    titleEn: 'Stylized character for a mobile game',
    bodyRu:
      'Смоделируйте стилизованного персонажа-ремесленника в полный рост. Ограничения: до 12 000 треугольников, текстуры 1K, PBR-комплект. Сдайте три ракурса, вайрфрейм и превью развёртки. В описании процесса расскажите, как строили силуэт и на чём экономили полигоны.',
    bodyEn:
      'Model a stylized full-body craftsman character. Limits: up to 12,000 triangles, 1K textures, PBR set. Deliver three views, a wireframe and a UV preview. In the process note, describe how you built the silhouette and where you saved polygons.',
    estimateHours: 12,
  },
  {
    specialization: 'environment',
    titleRu: 'Небольшая сцена окружения',
    titleEn: 'Small environment scene',
    bodyRu:
      'Соберите сцену «заброшенная мастерская» из собственных ассетов: не менее восьми объектов, общий бюджет 60 000 треугольников. Сдайте рендер сцены, схему модульности и превью атласа текстур.',
    bodyEn:
      'Assemble an "abandoned workshop" scene from your own assets: at least eight objects, 60,000 triangles total. Deliver a scene render, a modularity diagram and a texture atlas preview.',
    estimateHours: 16,
  },
  {
    specialization: 'props',
    titleRu: 'Набор пропсов в едином стиле',
    titleEn: 'A set of props in one style',
    bodyRu:
      'Сделайте пять пропсов кухонной утвари в едином стиле на общем атласе 2K. Сдайте общий рендер набора, вайрфреймы и развёртку. Опишите, как добивались стилевого единства.',
    bodyEn:
      'Create five kitchenware props in a single style sharing one 2K atlas. Deliver a group render, wireframes and the UV layout. Describe how you kept the style consistent.',
    estimateHours: 10,
  },
  {
    specialization: 'weapons',
    titleRu: 'Оружие для шутера от первого лица',
    titleEn: 'Weapon for a first-person shooter',
    bodyRu:
      'Смоделируйте пистолет для вида от первого лица: до 30 000 треугольников, текстуры 4K, PBR. Сдайте рендеры общего вида и крупных планов, вайрфрейм. Отдельно покажите, как решали читаемость мелких деталей вблизи.',
    bodyEn:
      'Model a first-person pistol: up to 30,000 triangles, 4K textures, PBR. Deliver full and close-up renders plus a wireframe. Show separately how you handled readability of small details up close.',
    estimateHours: 14,
  },
  {
    specialization: 'vehicles',
    titleRu: 'Транспорт в лоуполи-стиле',
    titleEn: 'Low-poly vehicle',
    bodyRu:
      'Сделайте лёгкий грузовик в лоуполи-стиле: до 8 000 треугольников, цветовая палитра вместо текстур. Сдайте четыре ракурса и вайрфрейм. Объясните, как держали силуэт узнаваемым при таком бюджете.',
    bodyEn:
      'Build a light truck in low-poly style: up to 8,000 triangles, a colour palette instead of textures. Deliver four views and a wireframe. Explain how you kept the silhouette recognisable on that budget.',
    estimateHours: 8,
  },
  {
    specialization: 'animation',
    titleRu: 'Цикл ходьбы и одна боевая анимация',
    titleEn: 'Walk cycle and one combat animation',
    bodyRu:
      'На предоставленном или собственном риге сделайте цикл ходьбы и одну атаку. Сдайте видео-превью с обеих сторон и таймлайн ключей. Опишите, как работали с весом и таймингом.',
    bodyEn:
      'On a provided or your own rig, make a walk cycle and one attack. Deliver a video preview from two angles and a key timeline. Describe how you handled weight and timing.',
    estimateHours: 12,
  },
  {
    specialization: 'rigging',
    titleRu: 'Риг гуманоида с контролами',
    titleEn: 'Humanoid rig with controls',
    bodyRu:
      'Соберите риг гуманоида: IK/FK на конечностях, контролы лица минимум на пять параметров. Сдайте видео с тестовыми позами и схему иерархии контролов.',
    bodyEn:
      'Build a humanoid rig: IK/FK on limbs, facial controls for at least five parameters. Deliver a video of test poses and a control hierarchy diagram.',
    estimateHours: 14,
  },
  {
    specialization: 'texturing',
    titleRu: 'Текстурирование предоставленной модели',
    titleEn: 'Texturing a provided model',
    bodyRu:
      'Возьмите любую свою нетекстурированную модель и сделайте PBR-комплект 2K. Сдайте рендеры до и после, карты по отдельности и превью развёртки. Опишите порядок слоёв и источники деталей.',
    bodyEn:
      'Take any untextured model of yours and make a 2K PBR set. Deliver before/after renders, the individual maps and a UV preview. Describe your layer order and where the detail came from.',
    estimateHours: 10,
  },
  {
    specialization: 'other',
    titleRu: 'Свободное задание по вашей специализации',
    titleEn: 'Open task in your specialization',
    bodyRu:
      'Выполните работу по своему профилю с нуля и покажите весь путь: от блокинга до финального рендера. Обязательны промежуточные скриншоты — они и подтверждают авторство.',
    bodyEn:
      'Do a piece in your own field from scratch and show the whole path: from blocking to the final render. Intermediate screenshots are required — they are what proves authorship.',
    estimateHours: 12,
  },
];
