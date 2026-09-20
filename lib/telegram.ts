// 🔒 Don't edit — this keeps your robot safe.
// Minimal Telegram helpers. Read the bot token from env at call time (never
// inline it on a command line). Safe to call even before the token is set — they
// just no-op with a warning so the app doesn't crash.

const api = (method: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  return token ? `https://api.telegram.org/bot${token}/${method}` : null
}

// A single inline-keyboard button. `callback_data` is what the webhook receives
// when the user taps it — e.g. "apr:42" (approve action 42) / "rej:42".
export type InlineButton = { text: string; callback_data: string }
export type InlineKeyboard = InlineButton[][]

export async function sendMessage(chatId: string | number, text: string) {
  const url = api('sendMessage')
  if (!url) {
    console.warn('[CGI] TELEGRAM_BOT_TOKEN not set yet — skipping sendMessage.')
    return
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error('[CGI] Telegram sendMessage failed:', body.description || res.status)
  }
}

// Send a message with Approve/Reject (or any) inline buttons. RETURNS the sent
// message_id so the caller can store it on the agent_actions row — the in-app
// approve path needs it to strip these same buttons via editMessageReplyMarkup.
// Returns null if the send failed or the token isn't set (caller degrades calmly).
export async function sendWithButtons(
  chatId: string | number,
  text: string,
  inlineKeyboard: InlineKeyboard,
): Promise<number | null> {
  const url = api('sendMessage')
  if (!url) {
    console.warn('[CGI] TELEGRAM_BOT_TOKEN not set yet — skipping sendWithButtons.')
    return null
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) {
    console.error('[CGI] Telegram sendWithButtons failed:', body.description || res.status)
    return null
  }
  return body.result?.message_id ?? null
}

// Acknowledge a button tap so Telegram stops the little spinner on the user's
// button. Optional toast text. Never throws.
export async function answerCallbackQuery(callbackId: string, text?: string) {
  const url = api('answerCallbackQuery')
  if (!url) return
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text: text ?? '' }),
  }).catch(e => console.error('[CGI] answerCallbackQuery failed:', e))
}

// Strip (or replace) the inline buttons on an already-sent message. Pass no
// keyboard to remove them entirely — used after an action is decided so the same
// message can't be tapped twice. UX only; the CAS claim is the real guarantee.
export async function editMessageReplyMarkup(
  chatId: string | number,
  messageId: number,
  keyboard?: InlineKeyboard,
) {
  const url = api('editMessageReplyMarkup')
  if (!url) return
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: keyboard ? { inline_keyboard: keyboard } : {},
    }),
  }).catch(e => console.error('[CGI] editMessageReplyMarkup failed:', e))
}
