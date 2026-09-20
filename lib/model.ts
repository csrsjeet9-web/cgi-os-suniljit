// Which Claude model does what. Override with env vars in Vercel if you want.
//   • CLAUDE_MODEL       — the Telegram bot + email sorting (fast, cheap)
//   • CLAUDE_WATCH_MODEL — the Regulatory Watch web search + the monthly narrative (needs judgement)
export const BOT_MODEL = () => process.env.CLAUDE_MODEL?.trim() || 'claude-haiku-4-5'
export const WATCH_MODEL = () => process.env.CLAUDE_WATCH_MODEL?.trim() || 'claude-sonnet-5'
