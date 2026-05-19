export function normalizeAccountParent(
  parentAccount?: string | null
): string | null {
  const normalizedParent = parentAccount?.trim();
  if (!normalizedParent) {
    return null;
  }

  return normalizedParent;
}

type ChartAccountRow = {
  name: string;
  parentAccount?: string | null;
  isGroup?: boolean | number;
};

export function filterAccountsForChartParent<T extends ChartAccountRow>(
  accounts: T[],
  parentAccount?: string | null
): T[] {
  const normalizedParent = normalizeAccountParent(parentAccount);

  if (normalizedParent) {
    return accounts.filter(
      (account) =>
        normalizeAccountParent(account.parentAccount) === normalizedParent
    );
  }

  const groupNames = new Set(
    accounts
      .filter((account) => !!account.isGroup)
      .map((account) => account.name.trim())
  );

  return accounts.filter((account) => {
    const accountParent = normalizeAccountParent(account.parentAccount);
    return !accountParent || !groupNames.has(accountParent);
  });
}
