import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase environment configuration.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const companyId = body.companyId as string | undefined;
    const inviteEmail = (body.email as string | undefined)?.trim().toLowerCase();
    const inviteRole = (body.role as string | undefined) ?? 'editor';
    const accessTokenFromBody = (body.accessToken as string | undefined)?.trim();

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader;
    const token = headerToken || accessTokenFromBody || '';
    const isServiceRoleToken = token === serviceRoleKey;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing access token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!companyId || !inviteEmail) {
      return new Response(JSON.stringify({ error: 'companyId and email are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    if (!isServiceRoleToken) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();

      const fallback =
        userError || !user
          ? await userClient.auth.getUser(token)
          : { data: { user }, error: userError };

      if (fallback.error || !fallback.data.user) {
        const tokenSource = headerToken ? 'header' : accessTokenFromBody ? 'body' : 'unknown';
        return new Response(
          JSON.stringify({
            error: 'Unauthorized: invalid user token.',
            token_source: tokenSource,
            token_length: token.length,
            auth_error: fallback.error?.message ?? 'unknown',
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: ownerRow, error: ownerError } = await adminClient
        .from('company_users')
        .select('role')
        .eq('company_id', companyId)
        .eq('user_id', fallback.data.user.id)
        .maybeSingle();

      if (ownerError || !ownerRow || ownerRow.role !== 'owner') {
        return new Response(JSON.stringify({ error: 'Only owners can invite collaborators.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let targetUserId: string | null = null;
    const adminAuth = adminClient.auth.admin;
    let existingUserId: string | null = null;

    // Check if user already has a Supabase account
    if (adminAuth && typeof adminAuth.getUserByEmail === 'function') {
      const { data: existingUser, error: existingError } = await adminAuth.getUserByEmail(inviteEmail);
      if (!existingError && existingUser?.user) {
        existingUserId = existingUser.user.id;
      }
    } else if (adminAuth && typeof adminAuth.listUsers === 'function') {
      const { data: listData, error: listError } = await adminAuth.listUsers({ page: 1, perPage: 1000 });
      if (!listError && listData?.users) {
        const match = listData.users.find((user) => user.email?.toLowerCase() === inviteEmail);
        if (match) {
          existingUserId = match.id;
        }
      }
    }

    if (existingUserId) {
      // User already has account - add them to company
      targetUserId = existingUserId;
      const { error: upsertError } = await adminClient.from('company_users').upsert({
        company_id: companyId,
        user_id: targetUserId,
        role: inviteRole,
      });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // User doesn't have account yet - create pending invitation record
      // They will sign up later and get auto-added to company via the signal/trigger
      const { data: inviteRecord, error: inviteError } = await adminClient
        .from('company_user_invitations')
        .upsert({
          company_id: companyId,
          email: inviteEmail,
          role: inviteRole,
        })
        .select();

      if (inviteError || !inviteRecord) {
        return new Response(JSON.stringify({ error: inviteError?.message ?? 'Unable to create invitation.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ user_id: targetUserId ?? null, email: inviteEmail }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
