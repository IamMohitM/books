const mockWriteAsStringAsync = jest.fn(() => Promise.resolve(undefined));
const mockGetInfoAsync = jest.fn(() => Promise.resolve({ exists: false }));
const mockReadAsStringAsync = jest.fn(() => Promise.resolve('[]'));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///tmp/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: mockWriteAsStringAsync,
  getInfoAsync: mockGetInfoAsync,
  readAsStringAsync: mockReadAsStringAsync,
}));

const mockCreateClient = jest.fn(() => ({
  auth: {
    getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
  },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

describe('mobile supabase project profiles', () => {
  function loadSupabaseModule() {
    return require('../src/lib/supabase') as typeof import('../src/lib/supabase');
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    process.env.EXPO_PUBLIC_SUPABASE_PROFILES = '';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://aaaa1111.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-a';

    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockReadAsStringAsync.mockResolvedValue('[]');
  });

  test('loads default profile from single-project env', () => {
    const mod = loadSupabaseModule();

    expect(mod.mobileProjectProfiles.length).toBe(1);
    expect(mod.mobileProjectProfiles[0]?.projectRef).toBe('aaaa1111');
    expect(mod.getActiveMobileProfile().projectRef).toBe('aaaa1111');
  });

  test('adds profile by project ref and persists JSON file', async () => {
    const mod = loadSupabaseModule();

    const added = mod.addOrUpdateMobileProjectProfile({
      projectRef: 'bbbb2222',
      anonKey: 'anon-key-b',
      label: 'Beta',
    });

    await mod.persistMobileProjectProfilesToDisk();

    expect(added.projectRef).toBe('bbbb2222');
    expect(added.url).toBe('https://bbbb2222.supabase.co');
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);

    const payload = String(
      (mockWriteAsStringAsync.mock.calls[0] as unknown[] | undefined)?.[1] ?? ''
    );
    expect(payload).toContain('bbbb2222');
    expect(payload).toContain('anon-key-b');
  });

  test('loads disk profiles and merges with env profiles', async () => {
    const diskRows = [
      {
        id: 'disk-profile-1',
        label: 'Project Two',
        projectRef: 'cccc3333',
        anonKey: 'anon-key-c',
      },
    ];

    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockReadAsStringAsync.mockResolvedValue(JSON.stringify(diskRows));

    const mod = loadSupabaseModule();
    await mod.loadMobileProjectProfilesFromDisk();

    expect(
      mod.mobileProjectProfiles.some((p) => p.projectRef === 'aaaa1111')
    ).toBe(true);
    expect(
      mod.mobileProjectProfiles.some((p) => p.projectRef === 'cccc3333')
    ).toBe(true);
  });
});
