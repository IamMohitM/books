import test from 'tape';
import { closeTestFyo, getTestFyo, setupTestFyo } from 'tests/helpers';
import { ModelNameEnum } from 'models/types';
import { LoanProfile } from 'models/baseModels/LoanProfile/LoanProfile';

const fyo = getTestFyo();
setupTestFyo(fyo, __filename);

test('create loan provided profile and post principal journal entry', async (t) => {
  const loanProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-PROV-001',
    lenderName: 'Borrower B',
    loanType: 'Provided',
    startDate: '2026-03-01',
    annualInterestRate: 12,
    openingPrincipal: fyo.pesa(0),
    openingAccruedInterest: fyo.pesa(0),
    active: true,
  }) as LoanProfile;
  await loanProfile.sync();

  t.ok(loanProfile.liabilityAccount, 'Receivable (liabilityAccount) auto-created');
  t.ok(loanProfile.interestExpenseAccount, 'Interest Income Account (interestExpenseAccount) auto-created');

  // Verify accounts have correct rootType
  const receivableAccountRoot = await fyo.getValue(ModelNameEnum.Account, loanProfile.liabilityAccount as string, 'rootType');
  const interestIncomeAccountRoot = await fyo.getValue(ModelNameEnum.Account, loanProfile.interestExpenseAccount as string, 'rootType');
  t.equal(receivableAccountRoot, 'Asset', 'Receivable account is an Asset');
  t.equal(interestIncomeAccountRoot, 'Income', 'Interest income account is an Income account');

  // Post Journal Entry providing $10,000 principal
  const jv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date: '2026-03-01',
    accounts: [
      {
        account: loanProfile.liabilityAccount as string,
        debit: fyo.pesa(10000),
        credit: fyo.pesa(0),
        loanProfile: 'L-PROV-001',
        loanComponent: 'Principal',
      },
      {
        account: 'Cash',
        debit: fyo.pesa(0),
        credit: fyo.pesa(10000),
      },
    ],
  });

  await jv.sync();
  await jv.submit();

  // Retrieve snapshot on 2026-03-11 (10 days accrued interest)
  const snapshot = await fyo.db.getLoanSnapshot('L-PROV-001', '2026-03-11');
  t.ok(snapshot, 'snapshot generated');
  t.equal(snapshot?.principalOutstanding, 10000, 'principal outstanding is $10,000');

  const expectedAccrued = 10000 * 0.12 * (10 / 365);
  t.ok(
    Math.abs((snapshot?.accruedInterest ?? 0) - expectedAccrued) < 0.01,
    `accrued interest ${snapshot?.accruedInterest} ~ ${expectedAccrued}`
  );
});

test('post interest receipt journal entry and verify snapshot & ledger', async (t) => {
  // Let's post interest payment received of $100 on 2026-03-12
  const loanProfile = (await fyo.doc.getDoc(ModelNameEnum.LoanProfile, 'L-PROV-001')) as LoanProfile;

  const interestJv = fyo.doc.getNewDoc(ModelNameEnum.JournalEntry, {
    entryType: 'Cash Entry',
    date: '2026-03-12',
    accounts: [
      {
        account: 'Cash',
        debit: fyo.pesa(100),
        credit: fyo.pesa(0),
      },
      {
        account: loanProfile.interestExpenseAccount as string,
        debit: fyo.pesa(0),
        credit: fyo.pesa(100),
        loanProfile: 'L-PROV-001',
        loanComponent: 'Interest',
      },
    ],
  });

  await interestJv.sync();
  await interestJv.submit();

  // Snapshot on 2026-03-12 should reflect $100 interest paid/received
  const snapshot = await fyo.db.getLoanSnapshot('L-PROV-001', '2026-03-12');
  t.equal(snapshot?.interestPaid, 100, 'interest received is $100');

  // Verify Ledger rows are calculated correctly
  const ledgerRows = await fyo.db.getLoanLedger('L-PROV-001', undefined, '2026-03-12');
  t.equal(ledgerRows.length, 2, '2 ledger entries found');
  
  const principalRow = ledgerRows.find(r => r.loanComponent === 'Principal');
  const interestRow = ledgerRows.find(r => r.loanComponent === 'Interest');
  t.ok(principalRow, 'principal row exists');
  t.ok(interestRow, 'interest row exists');

  t.equal(Number(principalRow?.debit ?? 0), 10000, 'principal debit matches $10,000');
  t.equal(Number(interestRow?.credit ?? 0), 100, 'interest credit matches $100');
});

test('loan provided form validations', async (t) => {
  // Retrieve the valid income account from first test
  const validIncomeAccount = (await fyo.doc.getDoc(ModelNameEnum.LoanProfile, 'L-PROV-001') as LoanProfile).interestExpenseAccount as string;

  // Verify that setting a Liability account for a Provided loan triggers a validation error
  const invalidProfile = fyo.doc.getNewDoc(ModelNameEnum.LoanProfile, {
    name: 'L-PROV-INVALID',
    lenderName: 'Borrower C',
    loanType: 'Provided',
    startDate: '2026-03-01',
    liabilityAccount: 'Creditors', // Creditors is a Liability account
    interestExpenseAccount: validIncomeAccount, // valid Income account
    annualInterestRate: 12,
    active: true,
  });

  try {
    await invalidProfile.sync();
    t.fail('Should fail validation with Liability account on Provided loan');
  } catch (err: any) {
    t.ok(err.message.includes('Receivable Account must be an Asset account'), 'correctly rejected liability account on provided loan');
  }
});

closeTestFyo(fyo, __filename);
