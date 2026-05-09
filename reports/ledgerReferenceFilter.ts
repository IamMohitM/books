import { Fyo } from 'fyo';

type LedgerReferenceRow = {
  referenceType?: string;
  referenceName?: string;
};

export async function filterRowsWithExistingReferences<
  T extends LedgerReferenceRow
>(fyo: Fyo, rows: T[]): Promise<T[]> {
  const namesByType = new Map<string, Set<string>>();

  for (const row of rows) {
    const referenceType = row.referenceType;
    const referenceName = row.referenceName;

    if (!referenceType || !referenceName || !fyo.schemaMap[referenceType]) {
      continue;
    }

    if (!namesByType.has(referenceType)) {
      namesByType.set(referenceType, new Set());
    }

    namesByType.get(referenceType)!.add(referenceName);
  }

  const existingNamesByType = new Map<string, Set<string>>();

  for (const [referenceType, names] of namesByType.entries()) {
    const existingRows = (await fyo.db.getAllRaw(referenceType, {
      fields: ['name'],
      filters: { name: ['in', [...names]] },
    })) as Array<{ name?: string }>;

    existingNamesByType.set(
      referenceType,
      new Set(
        existingRows
          .map((row) => row.name)
          .filter((name): name is string => Boolean(name))
      )
    );
  }

  return rows.filter((row) => {
    const referenceType = row.referenceType;
    const referenceName = row.referenceName;

    if (!referenceType || !referenceName || !fyo.schemaMap[referenceType]) {
      return true;
    }

    return existingNamesByType.get(referenceType)?.has(referenceName) ?? false;
  });
}
