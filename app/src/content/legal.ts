import type { Locale } from '@polyforge/shared';

/**
 * Драфты правовых документов (§2.4, §8.2).
 *
 * Тексты — рабочие черновики: до открытия беты их вычитывает человек, а в фазе 7
 * они переезжают в markdown-редактор админки. Обязательный пункт про то, что
 * платформа не является стороной расчётов, присутствует во всех трёх документах.
 */

export const LEGAL_DOCS = ['terms', 'privacy', 'rules'] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

type LegalContent = Record<LegalDoc, Record<Locale, LegalSection[]>>;

const NOT_A_PARTY_RU =
  'Платформа не является стороной расчётов. Оплаты происходят напрямую между пользователями любым выбранным ими способом; платформа лишь фиксирует предоставленные пользователями подтверждения оплат и не гарантирует возврат средств.';

const NOT_A_PARTY_EN =
  'The platform is not a party to any settlement. Payments happen directly between users by whatever method they choose; the platform only records the payment confirmations users provide and does not guarantee refunds.';

export const LEGAL_CONTENT: LegalContent = {
  terms: {
    ru: [
      {
        heading: 'Предмет соглашения',
        paragraphs: [
          'PolyForge — информационная площадка, которая помогает заказчикам и 3D-дизайнерам найти друг друга, согласовать техническое задание и вести историю сделки по этапам.',
          NOT_A_PARTY_RU,
        ],
      },
      {
        heading: 'Регистрация и доступ',
        paragraphs: [
          'На время закрытой беты регистрация возможна только по действующему инвайт-коду. Подтверждение адреса электронной почты обязательно до совершения любых действий на платформе.',
          'Пользователь отвечает за сохранность своих учётных данных и за все действия, совершённые под его аккаунтом.',
        ],
      },
      {
        heading: 'Сделки между пользователями',
        paragraphs: [
          'Условия работы — объём, сроки, стоимость, количество раундов правок — стороны согласуют самостоятельно и фиксируют в техническом задании и плане этапов.',
          'Обмен контактами между пользователями не запрещён. Платформа не взимает комиссию и не удерживает средства.',
          'Загруженные подтверждения оплат и переписка сохраняются и могут быть использованы при разборе спора.',
        ],
      },
      {
        heading: 'Права на результат',
        paragraphs: [
          'Права на созданные материалы переходят к заказчику в объёме, согласованном сторонами в техническом задании.',
          'Публикация работы в портфолио дизайнера возможна только с согласия заказчика, которое фиксируется при завершении сделки.',
        ],
      },
      {
        heading: 'Ограничение ответственности',
        paragraphs: [
          'Платформа предоставляется «как есть». Администрация не отвечает за качество выполненных работ, за соблюдение сроков и за расчёты между пользователями.',
          'Разбор спора арбитром платформы влечёт только репутационные последствия для сторон и не является финансовым решением.',
        ],
      },
    ],
    en: [
      {
        heading: 'Subject of the agreement',
        paragraphs: [
          'PolyForge is an information platform that helps clients and 3D artists find each other, agree on a brief, and keep a milestone-based record of the deal.',
          NOT_A_PARTY_EN,
        ],
      },
      {
        heading: 'Registration and access',
        paragraphs: [
          'During the closed beta, registration requires a valid invite code. Confirming your email address is mandatory before any action on the platform.',
          'You are responsible for keeping your credentials safe and for everything done under your account.',
        ],
      },
      {
        heading: 'Deals between users',
        paragraphs: [
          'Scope, deadlines, price, and the number of revision rounds are agreed by the parties themselves and recorded in the brief and the milestone plan.',
          'Exchanging contact details is not prohibited. The platform charges no commission and holds no funds.',
          'Uploaded payment confirmations and chat history are retained and may be used when resolving a dispute.',
        ],
      },
      {
        heading: 'Rights to the deliverables',
        paragraphs: [
          'Rights to the created assets transfer to the client to the extent agreed by the parties in the brief.',
          'Publishing work in a designer portfolio requires the client’s consent, recorded when the deal is completed.',
        ],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'The platform is provided “as is”. We are not liable for the quality of delivered work, for missed deadlines, or for settlements between users.',
          'An arbiter’s ruling carries reputational consequences only and is not a financial decision.',
        ],
      },
    ],
  },

  privacy: {
    ru: [
      {
        heading: 'Какие данные мы собираем',
        paragraphs: [
          'Адрес электронной почты, ник, выбранный язык и тема оформления, данные профиля, которые вы заполняете сами, а также технические данные: IP-адрес, User-Agent, время последней активности.',
          'При входе через Discord мы сохраняем идентификатор аккаунта, имя пользователя и аватар.',
        ],
      },
      {
        heading: 'Зачем мы их используем',
        paragraphs: [
          'Для работы аккаунта, показа профиля другим пользователям, ведения сделок, разбора споров, защиты от накруток и злоупотреблений, а также для отправки уведомлений, на которые вы подписаны.',
          'Ключевые действия записываются в аудит-лог: это нужно для расследования жалоб и споров.',
        ],
      },
      {
        heading: 'Кому мы их передаём',
        paragraphs: [
          'Поставщикам инфраструктуры: хостинг, объектное хранилище файлов, сервис отправки писем, сервис защиты от ботов, поставщик ИИ-функций.',
          'Файлы сделок и подтверждения оплат хранятся в приватном хранилище и доступны только участникам сделки и администрации.',
        ],
      },
      {
        heading: 'Ваши права',
        paragraphs: [
          'Вы можете выгрузить свои данные и удалить аккаунт из настроек. При удалении профиль обезличивается: ник заменяется, контакты и медиа стираются.',
          'Сделки, подтверждения оплат и отзывы сохраняются в обезличенном виде — они являются частью истории другой стороны.',
        ],
      },
    ],
    en: [
      {
        heading: 'What we collect',
        paragraphs: [
          'Your email address, nickname, language and theme preference, the profile data you fill in yourself, and technical data: IP address, User-Agent, last activity time.',
          'If you sign in with Discord, we store your account id, username, and avatar.',
        ],
      },
      {
        heading: 'Why we use it',
        paragraphs: [
          'To run your account, show your profile to other users, run deals, resolve disputes, protect against rating manipulation and abuse, and send the notifications you subscribed to.',
          'Key actions are written to an audit log, which we need in order to investigate reports and disputes.',
        ],
      },
      {
        heading: 'Who we share it with',
        paragraphs: [
          'Infrastructure providers: hosting, object storage, transactional email, bot protection, and the AI features provider.',
          'Deal files and payment confirmations live in private storage and are available only to the deal participants and the administration.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can export your data and delete your account from the settings. On deletion the profile is anonymised: the nickname is replaced, contacts and media are erased.',
          'Deals, payment confirmations, and reviews are kept in anonymised form — they are part of the other party’s history.',
        ],
      },
    ],
  },

  rules: {
    ru: [
      {
        heading: 'Общие принципы',
        paragraphs: [
          'Уважайте друг друга. Договорённости фиксируйте в техническом задании и плане этапов, а не «на словах» — так спор можно разобрать.',
          NOT_A_PARTY_RU,
        ],
      },
      {
        heading: 'Что запрещено',
        paragraphs: [
          'Заказы «бесплатно» или «за отзыв»: у заказа должен быть бюджет больше нуля либо статус «жду предложений».',
          'Выдавать чужие работы за свои, публиковать NSFW-контент, спамить, накручивать рейтинг и отзывы, обходить блокировки через новые аккаунты.',
          'Требовать полную предоплату вне логики этапов или давить на снятие спора.',
        ],
      },
      {
        heading: 'Оплаты и подтверждения',
        paragraphs: [
          'Оплачивайте этапы напрямую и загружайте подтверждение с суммой, валютой и способом оплаты. Дизайнер подтверждает получение денег.',
          'Исходники финального этапа открываются заказчику после подтверждения оплаты этого этапа.',
        ],
      },
      {
        heading: 'Санкции',
        paragraphs: [
          'Подтверждённая жалоба даёт страйк. Накопление страйков ведёт к временной блокировке, повторные нарушения — к постоянной.',
          'Проигранные споры отображаются в публичном профиле.',
        ],
      },
    ],
    en: [
      {
        heading: 'General principles',
        paragraphs: [
          'Treat each other with respect. Record what you agreed in the brief and the milestone plan rather than in passing — that is what makes a dispute resolvable.',
          NOT_A_PARTY_EN,
        ],
      },
      {
        heading: 'What is not allowed',
        paragraphs: [
          'Orders offered “for free” or “for a review”: an order must carry a budget above zero or be marked as open to proposals.',
          'Passing someone else’s work off as your own, posting NSFW content, spamming, manipulating ratings and reviews, evading bans with new accounts.',
          'Demanding full prepayment outside the milestone logic, or pressuring the other party to withdraw a dispute.',
        ],
      },
      {
        heading: 'Payments and confirmations',
        paragraphs: [
          'Pay for milestones directly and upload a confirmation with the amount, currency, and payment method. The designer then confirms receipt.',
          'Source files for the final milestone unlock for the client once that milestone’s payment is confirmed.',
        ],
      },
      {
        heading: 'Sanctions',
        paragraphs: [
          'A confirmed report results in a strike. Accumulated strikes lead to a temporary ban; repeated violations lead to a permanent one.',
          'Lost disputes are shown on the public profile.',
        ],
      },
    ],
  },
};
