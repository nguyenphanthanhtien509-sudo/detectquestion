# Detect Question Account Portal

Copy `config.example.js` to `config.js`, then fill in only the public Supabase URL and anon/publishable key. Open `index.html` through any static host.

Before using the portal, deploy the SQL migration and the two Supabase Edge Functions:

```text
supabase db push
supabase functions deploy license-session --no-verify-jwt
supabase functions deploy admin-accounts
```

Create the first Supabase Auth user in Authentication, then set its role in SQL Editor:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"license_admin"}'::jsonb
where email = 'your-admin-email@example.com';
```

The browser portal never uses the Supabase Service Role key.
