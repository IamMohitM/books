import * as FileSystem from 'expo-file-system';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type MobileProjectProfile = {
  id: string;
  label: string;
  url: string;
  anonKey: string;
  projectRef: string;
};

export type MobileProjectValidationResult = {
  ok: boolean;
  normalizedProjectRef: string;
  message?: string;
};

const PROFILE_STORE_FILE = `${
  FileSystem.documentDirectory ?? 'file:///tmp/'
}sync-project-profiles.json`;
const PROFILE_VALIDATION_TIMEOUT_MS = 6_000;

function getExpoEnv(name: string): string {
  const env = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  return String(env?.[name] ?? '');
}

function normalizeProjectRef(projectRefOrUrl: string): string {
  const value = String(projectRefOrUrl ?? '')
    .trim()
    .toLowerCase();
  if (!value) {
    return '';
  }

  if (value.includes('.supabase.co')) {
    return value
      .replace(/^https?:\/\//, '')
      .replace('.supabase.co', '')
      .replace(/\/+$/, '');
  }

  return value.replace(/\/+$/, '');
}

function normalizeProfile(
  input: Partial<MobileProjectProfile>,
  fallbackId: string,
  fallbackLabel: string
): MobileProjectProfile | null {
  const projectRef = normalizeProjectRef(
    String(input.projectRef ?? input.url ?? '')
  );
  const anonKey = String(input.anonKey ?? '').trim();
  if (!projectRef || !anonKey) {
    return null;
  }

  const url = `https://${projectRef}.supabase.co`;
  return {
    id: String(input.id ?? fallbackId),
    label: String(input.label ?? fallbackLabel).trim() || fallbackLabel,
    url,
    anonKey,
    projectRef,
  };
}

function parseProfilesFromEnv(): MobileProjectProfile[] {
  const raw = getExpoEnv('EXPO_PUBLIC_SUPABASE_PROFILES');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<Partial<MobileProjectProfile>>;
      if (Array.isArray(parsed)) {
        const rows = parsed
          .map((row, index) =>
            normalizeProfile(
              row,
              `profile-${index + 1}`,
              `Project ${index + 1}`
            )
          )
          .filter(Boolean) as MobileProjectProfile[];
        if (rows.length) {
          return rows;
        }
      }
    } catch {
      // Fall through to single-profile env variables.
    }
  }

  const supabaseUrl = getExpoEnv('EXPO_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = getExpoEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const profile = normalizeProfile(
    {
      id: 'default',
      label: `Project ${normalizeProjectRef(supabaseUrl).slice(0, 8)}`,
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    },
    'default',
    `Project ${normalizeProjectRef(supabaseUrl).slice(0, 8)}`
  );

  if (!profile) {
    throw new Error('Invalid default Supabase profile configuration');
  }

  return [profile];
}

function mergeProfiles(
  baseRows: MobileProjectProfile[],
  diskRows: MobileProjectProfile[]
): MobileProjectProfile[] {
  const byRef = new Map<string, MobileProjectProfile>();
  for (const row of baseRows) {
    byRef.set(row.projectRef, row);
  }
  for (const row of diskRows) {
    byRef.set(row.projectRef, row);
  }

  return Array.from(byRef.values());
}

const envProfiles = parseProfilesFromEnv();
export let mobileProjectProfiles: MobileProjectProfile[] = [...envProfiles];
let profilesEpoch = 0;

function getStorageKeyForUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    const projectRef = hostname.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return undefined;
  }
}

function createSupabaseClient(url: string, key: string): SupabaseClient {
  const storageKey = getStorageKeyForUrl(url);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return createClient(url, key, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey,
    },
  }) as unknown as SupabaseClient;
}

function generateLocalId() {
  const maybeCrypto = (
    globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (typeof maybeCrypto?.randomUUID === 'function') {
    return maybeCrypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let activeProfile: MobileProjectProfile | null = mobileProjectProfiles[0] ?? null;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export let supabase: SupabaseClient | null =
  activeProfile ? createSupabaseClient(activeProfile.url, activeProfile.anonKey) : null;

export let supabasePublicAnonKey = activeProfile?.anonKey ?? '';
export let supabasePublicUrl = activeProfile?.url ?? '';

export function getSupabaseClient(): SupabaseClient {
  if (!supabase || !activeProfile) {
    throw new Error('No active Supabase project configured.');
  }
  return supabase;
}

export function getActiveMobileProfile(): MobileProjectProfile {
  if (!activeProfile) {
    throw new Error('No active Supabase project configured.');
  }
  return activeProfile;
}

export async function setActiveMobileProfile(profileId: string): Promise<SupabaseClient> {
  const nextProfile = mobileProjectProfiles.find((p) => p.id === profileId);
  if (!nextProfile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }

  activeProfile = nextProfile;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  supabase = createSupabaseClient(activeProfile.url, activeProfile.anonKey);
  supabasePublicAnonKey = activeProfile.anonKey;
  supabasePublicUrl = activeProfile.url;
  return supabase;
}

export async function loadMobileProjectProfilesFromDisk() {
  const startEpoch = profilesEpoch;
  try {
    const info = await FileSystem.getInfoAsync(PROFILE_STORE_FILE);
    if (startEpoch !== profilesEpoch) {
      return mobileProjectProfiles;
    }
    if (!info.exists) {
      return mobileProjectProfiles;
    }

    const content = await FileSystem.readAsStringAsync(PROFILE_STORE_FILE);
    if (startEpoch !== profilesEpoch) {
      return mobileProjectProfiles;
    }
    const parsed = JSON.parse(content) as Array<Partial<MobileProjectProfile>>;
    const diskRows: MobileProjectProfile[] = Array.isArray(parsed)
      ? parsed
          .map((row, index) =>
            normalizeProfile(row, `disk-${index + 1}`, `Project ${index + 1}`)
          )
          .filter((row): row is MobileProjectProfile => Boolean(row))
      : [];

    if (!diskRows.length) {
      return mobileProjectProfiles;
    }

    mobileProjectProfiles = mergeProfiles(envProfiles, diskRows);

    if (activeProfile && !mobileProjectProfiles.find((row) => row.id === activeProfile.id)) {
      activeProfile = mobileProjectProfiles[0] ?? null;
      if (activeProfile) {
        await setActiveMobileProfile(activeProfile.id);
      } else {
        supabase = null;
        supabasePublicAnonKey = '';
        supabasePublicUrl = '';
      }
    }

    return mobileProjectProfiles;
  } catch {
    return mobileProjectProfiles;
  }
}

export async function persistMobileProjectProfilesToDisk() {
  const json = JSON.stringify(mobileProjectProfiles, null, 2);
  await FileSystem.writeAsStringAsync(PROFILE_STORE_FILE, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function resetMobileProjectProfilesToDefault() {
  profilesEpoch += 1;

  // Clear in-memory state FIRST
  mobileProjectProfiles =
    envProfiles.length > 0 ? [envProfiles[0]!] : [...envProfiles];
  activeProfile = mobileProjectProfiles[0] ?? null;
  supabasePublicAnonKey = activeProfile?.anonKey ?? '';
  supabasePublicUrl = activeProfile?.url ?? '';
  supabase = activeProfile
    ? createSupabaseClient(activeProfile.url, activeProfile.anonKey)
    : null;

  // Sign out before resetting
  try {
    if (supabase) {
      await supabase.auth.signOut();
    }
  } catch (error) {
    console.warn('Error signing out during reset:', error);
  }

  await setActiveMobileProfile(activeProfile.id);

  // Delete file and VERIFY deletion succeeded
  try {
    await FileSystem.deleteAsync(PROFILE_STORE_FILE, { idempotent: true });

    // Verify file was actually deleted
    const info = await FileSystem.getInfoAsync(PROFILE_STORE_FILE);
    if (info.exists) {
      throw new Error('File still exists after deletion');
    }
  } catch (error) {
    console.error('Failed to delete profile store:', error);
    throw new Error(`Reset failed: ${(error as Error).message}`);
  }

  await persistMobileProjectProfilesToDisk();
  return mobileProjectProfiles;
}

export async function validateMobileProjectCredentials(input: {
  projectRef: string;
  anonKey: string;
}): Promise<MobileProjectValidationResult> {
  const normalizedProjectRef = normalizeProjectRef(input.projectRef);
  const anonKey = String(input.anonKey ?? '').trim();

  if (!normalizedProjectRef) {
    return {
      ok: false,
      normalizedProjectRef,
      message: 'Project ref is required.',
    };
  }

  if (!anonKey) {
    return {
      ok: false,
      normalizedProjectRef,
      message: 'Publishable/anon key is required.',
    };
  }

  // Security check: reject secret keys
  if (anonKey.startsWith('sb_secret_')) {
    return {
      ok: false,
      normalizedProjectRef,
      message: 'Invalid key. Use the Legacy Anon Key (or Publishable Key) from Supabase Settings > API Keys, not the Secret Key.',
    };
  }

  const url = `https://${normalizedProjectRef}.supabase.co`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PROFILE_VALIDATION_TIMEOUT_MS
    );
    // Use /auth/v1/health endpoint which works with anon keys
    const response = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      return { ok: true, normalizedProjectRef };
    }

    const bodyText = await response.text().catch(() => '');
    const message = `${response.status} ${bodyText}`.toLowerCase();
    if (message.includes('invalid api key')) {
      return {
        ok: false,
        normalizedProjectRef,
        message:
          'Invalid API key for this project. Use the legacy anon key from Supabase Settings -> API Keys.',
      };
    }

    if (
      message.includes('apikey') ||
      message.includes('invalid') ||
      message.includes('jwt')
    ) {
      return {
        ok: false,
        normalizedProjectRef,
        message:
          'Invalid key format. Use the legacy anon key from Supabase Settings -> API Keys.',
      };
    }

    return {
      ok: false,
      normalizedProjectRef,
      message: `Could not verify project (HTTP ${response.status}). Check project ref and key.`,
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? '');
    if (
      message.toLowerCase().includes('aborted') ||
      message.toLowerCase().includes('timeout')
    ) {
      return {
        ok: false,
        normalizedProjectRef,
        message:
          'Validation timed out. Check network/project ref and try again.',
      };
    }

    return {
      ok: false,
      normalizedProjectRef,
      message: `Could not verify project credentials: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    };
  }
}

export function addOrUpdateMobileProjectProfile(input: {
  label?: string;
  projectRef: string;
  anonKey: string;
}) {
  const projectRef = normalizeProjectRef(input.projectRef);
  const anonKey = String(input.anonKey ?? '').trim();
  if (!projectRef) {
    throw new Error('Project ref is required');
  }
  if (!anonKey) {
    throw new Error('Publishable/anon key is required');
  }

  const existing = mobileProjectProfiles.find(
    (profile) => profile.projectRef === projectRef
  );
  const label =
    String(input.label ?? '').trim() || `Project ${projectRef.slice(0, 8)}`;

  if (existing) {
    existing.label = label;
    existing.anonKey = anonKey;
    existing.url = `https://${projectRef}.supabase.co`;
    existing.projectRef = projectRef;
    return existing;
  }

  const profile: MobileProjectProfile = {
    id: generateLocalId(),
    label,
    url: `https://${projectRef}.supabase.co`,
    anonKey,
    projectRef,
  };
  mobileProjectProfiles.push(profile);
  return profile;
}

export type NetworkDiagnostics = {
  ok: boolean;
  type: 'success' | 'network_timeout' | 'network_error' | 'isp_blocked';
  message: string;
};

export async function testSupabaseConnection(
  url: string,
  anonKey: string,
  timeoutMs: number = 8000
): Promise<NetworkDiagnostics> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        return {
          ok: true,
          type: 'success',
          message: 'Connected to Supabase successfully.',
        };
      }

      return {
        ok: false,
        type: 'network_error',
        message: `Supabase health check failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  } catch (error) {
    const message = String((error as Error)?.message ?? '').toLowerCase();

    if (
      message.includes('aborted') ||
      message.includes('timeout') ||
      message.includes('timed out')
    ) {
      return {
        ok: false,
        type: 'network_timeout',
        message:
          'Connection timed out. Check your internet or try a different network.',
      };
    }

    if (
      message.includes('network') ||
      message.includes('dns') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return {
        ok: false,
        type: 'isp_blocked',
        message:
          'Cannot reach Supabase. Your ISP may be blocking access. Try a VPN.',
      };
    }

    return {
      ok: false,
      type: 'network_error',
      message: `Network error: ${(error as Error)?.message ?? 'Unknown error'}`,
    };
  }
}

export type AuthErrorClassification = {
  type: 'network' | 'timeout' | 'invalid_credentials' | 'other';
  userMessage: string;
};

export function classifyAuthError(error: Error | null): AuthErrorClassification {
  if (!error) {
    return {
      type: 'other',
      userMessage: 'An unknown error occurred.',
    };
  }

  const message = String(error.message ?? '').toLowerCase();

  // Network errors
  if (message.includes('network') || message.includes('failed to fetch')) {
    return {
      type: 'network',
      userMessage: 'Network error. Check your internet connection.',
    };
  }

  // Timeout errors
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  ) {
    return {
      type: 'timeout',
      userMessage:
        'Connection timed out. Check your internet or try a different network.',
    };
  }

  // Auth errors
  if (
    message.includes('invalid login') ||
    message.includes('invalid credentials') ||
    message.includes('incorrect password') ||
    message.includes('user not found')
  ) {
    return {
      type: 'invalid_credentials',
      userMessage:
        "Incorrect password, or user doesn't exist in this project. If new, sign up first.",
    };
  }

  // Email not confirmed
  if (message.includes('email not confirmed')) {
    return {
      type: 'other',
      userMessage:
        'Email not confirmed yet. Confirm your email first, then sign in.',
    };
  }

  // Rate limiting
  if (message.includes('too many requests')) {
    return {
      type: 'other',
      userMessage: 'Too many attempts. Please wait and try again.',
    };
  }

  return {
    type: 'other',
    userMessage: error.message,
  };
}
