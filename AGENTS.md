<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Kiosk is public (no login); all DB access goes through server functions using the admin client, and settings actions are gated by an admin PIN stored in the settings table. Why: kiosk-only requirement, tables stay locked by RLS.
- External integrations live in `src/lib/school-api.server.ts` (student sync) and `src/lib/whatsapp.server.ts` (parent alerts via connector gateway). Why: user asked for one file per API.
- Student lookup and attendance saving go directly to the school MySQL database via `src/lib/school-db.server.ts` (mysql2, DB_* secrets). Why: user wants the kiosk wired to the school database, not an API.
