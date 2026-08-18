import { createAIProvider } from '@polyforge/ai';
import { prisma } from '@polyforge/db';

/**
 * Саммари спора для арбитра (§4.6).
 *
 * Выполняется в воркере: разбор длинной переписки занимает секунды, а арбитр
 * запускает его кнопкой и возвращается к результату позже. Кредиты не
 * списываются — это инструмент модерации, а не пользователя.
 */

export interface DisputeSummaryPayload {
  disputeId: string;
}

export async function summarizeDisputeJob(payload: DisputeSummaryPayload): Promise<void> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: payload.disputeId },
    select: { id: true, dealId: true, reason: true },
  });

  if (!dispute) return;

  const messages = await prisma.dealMessage.findMany({
    where: { dealId: dispute.dealId, kind: 'user' },
    orderBy: { createdAt: 'asc' },
    take: 300,
    select: { text: true, author: { select: { nickname: true } } },
  });

  const settings = await prisma.platformSetting.findMany({
    where: { key: { in: ['ai_model_strong', 'ai_model_cheap'] } },
    select: { key: true, value: true },
  });

  const modelOf = (key: string, fallback: string): string => {
    const value = settings.find((setting) => setting.key === key)?.value;
    return typeof value === 'string' ? value : fallback;
  };

  const provider = createAIProvider({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    strongModel: modelOf('ai_model_strong', 'gpt-4o'),
    cheapModel: modelOf('ai_model_cheap', 'gpt-4o-mini'),
  });

  const summary = await provider.summarizeDispute(
    {
      messages: [
        { author: 'reason', text: dispute.reason },
        ...messages
          .filter((message) => message.text)
          .map((message) => ({ author: message.author?.nickname ?? 'user', text: message.text })),
      ],
    },
    { locale: 'ru' },
  );

  await prisma.dispute.update({ where: { id: dispute.id }, data: { aiSummary: summary } });
}
