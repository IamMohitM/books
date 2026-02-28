import * as FileSystem from 'expo-file-system';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
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

function createSupabaseClient(url: string, key: string): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return createClient(url, key) as unknown as SupabaseClient;
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

let activeProfile = mobileProjectProfiles[0]!;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export let supabase: SupabaseClient = createSupabaseClient(
  activeProfile.url,
  activeProfile.anonKey
);

export let supabasePublicAnonKey = activeProfile.anonKey;
export let supabasePublicUrl = activeProfile.url;

export function getActiveMobileProfile(): MobileProjectProfile {
  return activeProfile;
}

export function setActiveMobileProfile(profileId: string): SupabaseClient {
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
  try {
    const info = await FileSystem.getInfoAsync(PROFILE_STORE_FILE);
    if (!info.exists) {
      return mobileProjectProfiles;
    }

    const content = await FileSystem.readAsStringAsync(PROFILE_STORE_FILE);
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

    if (!mobileProjectProfiles.find((row) => row.id === activeProfile.id)) {
      activeProfile = mobileProjectProfiles[0]!;
      setActiveMobileProfile(activeProfile.id);
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
  mobileProjectProfiles =
    envProfiles.length > 0 ? [envProfiles[0]!] : [...envProfiles];
  activeProfile = mobileProjectProfiles[0]!;
  setActiveMobileProfile(activeProfile.id);
  await FileSystem.deleteAsync(PROFILE_STORE_FILE, { idempotent: true }).catch(
    () => undefined
  );
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

  const url = `https://${normalizedProjectRef}.supabase.co`;

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

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
          'Invalid API key for this project. Use the legacy anon key from Supabase Settings -> API.',
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
          'Key format is not accepted by this app build. Use the legacy anon key for this project.',
      };
    }

    return {
      ok: false,
      normalizedProjectRef,
      message: `Could not verify project credentials (HTTP ${response.status}).`,
    };
  } catch (error) {
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
