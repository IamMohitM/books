import test from 'tape';
import {
  filterAccountsForChartParent,
  normalizeAccountParent,
} from 'src/utils/accountTree';

test('chart of accounts root filtering includes blank-parent and orphaned accounts', async (t) => {
  const rows = [
    { name: 'Assets', parentAccount: null, isGroup: true },
    { name: 'Bank', parentAccount: 'Assets', isGroup: false },
    { name: 'Loose Root', parentAccount: '   ', isGroup: false },
    { name: 'Orphan Leaf', parentAccount: 'Missing Group', isGroup: false },
    {
      name: 'Hidden Before Fix',
      parentAccount: 'Bank',
      isGroup: false,
    },
  ];

  const rootRows = filterAccountsForChartParent(rows, null);
  const assetChildren = filterAccountsForChartParent(rows, 'Assets');

  t.equal(
    normalizeAccountParent('   '),
    null,
    'blank parentAccount normalizes to root'
  );
  t.deepEqual(
    rootRows.map((row) => row.name),
    ['Assets', 'Loose Root', 'Orphan Leaf', 'Hidden Before Fix'],
    'root view shows explicit roots plus accounts whose parents are missing or not groups'
  );
  t.deepEqual(
    assetChildren.map((row) => row.name),
    ['Bank'],
    'child filtering still works for valid parents'
  );
  t.end();
});
