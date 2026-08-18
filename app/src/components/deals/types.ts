/**
 * Формы данных панели сделки. Даты приходят строками: серверный компонент
 * не может передать Date в клиентский без сериализации.
 */

export interface DealSummary {
  id: string;
  title: string;
  price: number;
  currency: string;
  status: string;
  revisionRoundsIncluded: number;
  portfolioAllowed: boolean;
  pauseReason: string | null;
  planConfirmedByCustomer: boolean;
  planConfirmedByDesigner: boolean;
  customerNickname: string;
  designerNickname: string;
  orderId: string | null;
  dispute: {
    id: string;
    status: string;
    verdict: string | null;
    openedById: string;
    reason: string;
  } | null;
}

export interface MilestoneView {
  id: string;
  position: number;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  status: string;
  revisionRoundsUsed: number;
  wasLate: boolean;
}

export interface DeliveryFileView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isSource: boolean;
  previewUrl: string | null;
  watermarkedUrl: string | null;
  watermarkPending: boolean;
}

export interface DeliveryView {
  id: string;
  version: number;
  note: string | null;
  createdAt: Date | string;
  files: DeliveryFileView[];
}

export interface PaymentView {
  id: string;
  amount: number;
  currency: string;
  method: string;
  txHash: string | null;
  note: string | null;
  status: string;
  customerClaimedAt: Date | string;
  designerConfirmedAt: Date | string | null;
  files: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

export interface MilestoneDetails {
  milestoneId: string;
  deliveries: DeliveryView[];
  payments: PaymentView[];
}

export interface DealMessageView {
  id: string;
  kind: string;
  text: string;
  systemKey: string | null;
  systemPayload: Record<string, string | number>;
  quotedMessageId: string | null;
  pinned: boolean;
  authorId: string | null;
  createdAt: string;
  author: { nickname: string } | null;
  attachments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    previewUrl: string | null;
  }[];
}

export interface DealChangeRequest {
  id: string;
  description: string;
  status: string;
  authorId: string | null;
  createdAt: string;
  author: { nickname: string } | null;
}
