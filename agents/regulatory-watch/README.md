# 📡 Regulatory Watch

The only robot that looks **outside** your registers.

**LOOK** — two sources, one destination:
- **Mondays**, inside the 08:30 cron, Claude runs up to 8 web searches over the watch list
  in `agents/regwatch.ts`: SSM, JPDP, MCMC, RMCD, LHDN, DOSH, DOE, MACC, PERKESO, JTK,
  BOMBA, NACSA, the ISO standards, CMMI and Bursa NSRF.
- **Every morning at 08:00**, the mailbox watch reads circulars forwarded to the connected
  Gmail account.

**ASSESS** — your existing obligation register is put in the prompt, so a duty you already
track is not proposed again as new. When something looks related, the proposal says so
(`matches_existing_ref`).

**ASK** — 🟡 **always**. Every finding becomes a proposal carrying its **source URL**, and
the Approvals tab links straight to it so you can read the notice before you accept it.
Nothing enters the obligation register without your YES. Proposals last 7 days, not 24 hours,
because a regulatory change deserves more than a day to decide.

**ACT** — on your YES, an obligation row is created as **Not Started**, severity High, with
the regulator, the effective date and the source URL in its meta.

**RECORD** — every run writes to `watch_log` with what it searched and what it found, so a
proposal can always be traced back to the search that produced it.

### Safety

- Web pages are untrusted content. The prompt says so, and the model returns structured
  JSON, not instructions it read on a page.
- A run is capped: 8 searches, 5 proposals. A stable hash of url + title means the same
  notice is never proposed twice.
- `REGWATCH_ENABLED=false` switches the web search off entirely.

### The knobs

| Knob | Where |
|---|---|
| The watch list | `WATCH_SOURCES` in `agents/regwatch.ts` |
| Search + proposal caps | `MAX_SEARCHES`, `MAX_PROPOSALS`, `LOOKBACK_DAYS` |
| The model | `CLAUDE_WATCH_MODEL` in your env |
| On / off | `REGWATCH_ENABLED` |
