import { supabase, supabaseConfigured, supabaseKeyRole } from '@/lib/supabase'

// Loud, friendly banner that tells a beginner WHICH layer is wrong — so a key
// problem never looks like an empty database. Server component (safe: no secrets
// reach the browser). Renders nothing once everything is wired correctly.
export default async function ConnStatus() {
  // 1) No Supabase at all yet (placeholder env) — the O & E steps.
  if (!supabaseConfigured) {
    return (
      <div className="banner">
        ⚠️ Supabase not connected — add <code>SUPABASE_URL</code> and{' '}
        <code>SUPABASE_SERVICE_ROLE_KEY</code> to your <code>.env</code> (the O &amp; E steps), then refresh.
        <br />On <b>Vercel</b>: add them in <b>Settings → Environment Variables</b>, then <b>Redeploy</b> — env changes don&apos;t apply to a deploy that already ran.
      </div>
    )
  }
  // 2) Wrong key (anon/publishable) — caught BEFORE we query, because anon can't
  //    read past RLS and would otherwise look like an empty database with no error.
  if (supabaseKeyRole() === 'anon') {
    return (
      <div className="banner">
        ⚠️ That looks like the <b>anon / publishable</b> key — CGI OS needs the{' '}
        <code>service_role</code> (secret) key. In Supabase: <b>Settings → API Keys → service_role → Reveal</b>,
        copy it into <code>SUPABASE_SERVICE_ROLE_KEY</code>, then redeploy.
      </div>
    )
  }
  // 3) Connected, but the query itself fails (usually schema not run yet).
  const { error } = await supabase.from('records').select('id').limit(1)
  if (error) {
    return (
      <div className="banner">
        ⚠️ Supabase rejected the request: <b>{error.message}</b>. Make sure you used the{' '}
        <code>service_role</code> key (not <code>publishable</code>/<code>anon</code>) and that you ran{' '}
        <code>supabase/schema.sql</code> in the SQL editor.
      </div>
    )
  }
  return null
}
