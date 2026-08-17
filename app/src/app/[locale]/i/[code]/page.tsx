import { redirect } from 'next/navigation';

/**
 * Короткая ссылка приглашения `/i/<code>` (§4.1).
 * Код переносится в форму регистрации query-параметром — состояние
 * не хранится, поэтому ссылка одинаково работает и в инкогнито.
 */
export default async function InviteLinkPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const normalized = code.trim().toUpperCase().slice(0, 10);

  redirect(`/${locale}/register?invite=${encodeURIComponent(normalized)}`);
}
