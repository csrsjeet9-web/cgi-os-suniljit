// Shown when a register has no rows yet (server component — no secrets here).
export default function Empty({ label }: { label?: string }) {
  return (
    <div className="empty">
      {label ? <>Nothing here yet — no {label} to show.<br /></> : null}
      No records yet — run the SQL from <code>supabase/schema.sql</code> in your Supabase
      SQL editor (the O step), wire your <code>.env</code> (the E step), then refresh.
    </div>
  )
}
