import {
  Cashflow,
  CashReconciliationSummary,
  IncomeExpense,
  LoanLedgerRow,
  LoanSnapshot,
  TopExpenses,
  TotalCreditAndDebit,
  TotalOutstanding,
} from 'utils/db/types';
import { ModelNameEnum } from '../../models/types';
import DatabaseCore from './core';
import { BespokeFunction, SqliteTableInfo } from './types';
import { DocItem, ReturnDocItem } from 'models/inventory/types';
import { safeParseFloat } from 'utils/index';

export class BespokeQueries {
  [key: string]: BespokeFunction;

  static async ensureLoanLedgerColumns(db: DatabaseCore): Promise<void> {
    const info = (await db.knex!.raw(
      `PRAGMA table_info(${ModelNameEnum.AccountingLedgerEntry})`
    )) as SqliteTableInfo[];
    const existing = new Set((info ?? []).map((row) => row.name));
    const needsLoanProfile = !existing.has('loanProfile');
    const needsLoanComponent = !existing.has('loanComponent');

    if (!needsLoanProfile && !needsLoanComponent) {
      return;
    }

    await db.knex!.schema.alterTable(
      ModelNameEnum.AccountingLedgerEntry,
      (table) => {
        if (needsLoanProfile) {
          table.text('loanProfile');
        }
        if (needsLoanComponent) {
          table.text('loanComponent');
        }
      }
    );
  }

  static async getLastInserted(
    db: DatabaseCore,
    schemaName: string
  ): Promise<number> {
    const lastInserted = (await db.knex!.raw(
      'select cast(name as int) as num from ?? order by num desc limit 1',
      [schemaName]
    )) as { num: number }[];

    const num = lastInserted?.[0]?.num;
    if (num === undefined) {
      return 0;
    }
    return num;
  }

  static async getTopExpenses(
    db: DatabaseCore,
    fromDate: string,
    toDate: string
  ) {
    const expenseAccounts = db
      .knex!.select('name')
      .from('Account')
      .where('rootType', 'Expense');

    const topExpenses = await db
      .knex!.select({
        total: db.knex!.raw('sum(cast(debit as real) - cast(credit as real))'),
      })
      .select('account')
      .from('AccountingLedgerEntry')
      .where('reverted', false)
      .where('account', 'in', expenseAccounts)
      .whereBetween('date', [fromDate, toDate])
      .groupBy('account')
      .orderBy('total', 'desc')
      .limit(5);
    return topExpenses as TopExpenses;
  }

  static async getTotalOutstanding(
    db: DatabaseCore,
    schemaName: string,
    fromDate: string,
    toDate: string
  ) {
    return (await db.knex!(schemaName)
      .sum({ total: 'baseGrandTotal' })
      .sum({ outstanding: 'outstandingAmount' })
      .where('submitted', true)
      .where('cancelled', false)
      .whereBetween('date', [fromDate, toDate])
      .first()) as TotalOutstanding;
  }

  static async getCashflow(db: DatabaseCore, fromDate: string, toDate: string) {
    const cashAndBankAccounts = db.knex!('Account')
      .select('name')
      .where('accountType', 'in', ['Cash', 'Bank'])
      .andWhere('isGroup', false);
    const dateAsMonthYear = db.knex!.raw(`strftime('%Y-%m', ??)`, 'date');
    return (await db.knex!('AccountingLedgerEntry')
      .where('reverted', false)
      .sum({
        inflow: 'debit',
        outflow: 'credit',
      })
      .select({
        yearmonth: dateAsMonthYear,
      })
      .where('account', 'in', cashAndBankAccounts)
      .whereBetween('date', [fromDate, toDate])
      .groupBy(dateAsMonthYear)) as Cashflow;
  }

  static async getCashInHand(db: DatabaseCore, asOfDate: string) {
    const result = (await db.knex!('AccountingLedgerEntry')
      .join('Account', 'AccountingLedgerEntry.account', 'Account.name')
      .sum({
        debit: 'AccountingLedgerEntry.debit',
        credit: 'AccountingLedgerEntry.credit',
      })
      .where('AccountingLedgerEntry.reverted', false)
      .where('AccountingLedgerEntry.date', '<=', asOfDate)
      .where('Account.accountType', 'Cash')
      .where('Account.isGroup', false)
      .first()) as { debit?: number; credit?: number } | undefined;

    const debit = result?.debit ?? 0;
    const credit = result?.credit ?? 0;
    const cashInHand = Number(debit) - Number(credit);
    return { cashInHand };
  }

  static async getCashInHandSummary(
    db: DatabaseCore,
    fromDate: string,
    toDate: string
  ) {
    // Generate month boundaries for the date range
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const months: {
      period: string;
      periodStart: string;
      periodEnd: string;
    }[] = [];

    const endOfRange = new Date(to.getFullYear(), to.getMonth() + 1, 0);

    let current = new Date(from.getFullYear(), from.getMonth(), 1);
    while (current <= endOfRange) {
      const start = new Date(current.getFullYear(), current.getMonth(), 1);
      const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      const period = start.toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });

      months.push({ period, periodStart: startStr, periodEnd: endStr });

      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    const summary = [];
    let previousClosingBalance = 0;

    // For each month, calculate: Opening + Debits - Credits = Closing
    for (const month of months) {
      const openingBalance = previousClosingBalance;

      // Get all cash account debits and credits for this month
      const monthlyFlow = (await db.knex!('AccountingLedgerEntry')
        .join('Account', 'AccountingLedgerEntry.account', 'Account.name')
        .sum({
          totalDebit: 'AccountingLedgerEntry.debit',
          totalCredit: 'AccountingLedgerEntry.credit',
        })
        .where('AccountingLedgerEntry.reverted', false)
        .whereBetween('AccountingLedgerEntry.date', [
          month.periodStart,
          month.periodEnd,
        ])
        .where('Account.accountType', 'Cash')
        .where('Account.isGroup', false)
        .first()) as
        | {
            totalDebit?: number;
            totalCredit?: number;
          }
        | undefined;

      const debits = monthlyFlow?.totalDebit ?? 0;
      const credits = monthlyFlow?.totalCredit ?? 0;
      const closingBalance = openingBalance + Number(debits) - Number(credits);

      summary.push({
        period: month.period,
        periodStart: month.periodStart,
        periodEnd: month.periodEnd,
        openingBalance,
        debits: Number(debits),
        credits: Number(credits),
        closingBalance,
        netChange: closingBalance - openingBalance,
      });

      previousClosingBalance = closingBalance;
    }

    return summary;
  }

  static async getCashInHandMonthDetail(
    db: DatabaseCore,
    periodStart: string,
    periodEnd: string
  ) {
    // Get cash balance as of the day before the month starts (opening for this month)
    const dayBefore = new Date(periodStart);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];

    const openingResult = await BespokeQueries.getCashInHand(db, dayBeforeStr);
    const openingBalance = openingResult.cashInHand;

    // Get debits and credits for this month
    const monthlyFlow = (await db.knex!('AccountingLedgerEntry')
      .join('Account', 'AccountingLedgerEntry.account', 'Account.name')
      .sum({
        totalDebit: 'AccountingLedgerEntry.debit',
        totalCredit: 'AccountingLedgerEntry.credit',
      })
      .where('AccountingLedgerEntry.reverted', false)
      .whereBetween('AccountingLedgerEntry.date', [periodStart, periodEnd])
      .where('Account.accountType', 'Cash')
      .where('Account.isGroup', false)
      .first()) as
      | {
          totalDebit?: number;
          totalCredit?: number;
        }
      | undefined;

    const debits = monthlyFlow?.totalDebit ?? 0;
    const credits = monthlyFlow?.totalCredit ?? 0;
    const closingBalance = openingBalance + Number(debits) - Number(credits);

    return {
      periodStart,
      periodEnd,
      openingBalance,
      debits: Number(debits),
      credits: Number(credits),
      closingBalance,
      netChange: closingBalance - openingBalance,
    };
  }

  static async getCashReconciliationSummary(
    db: DatabaseCore,
    fromDate: string,
    toDate: string
  ) {
    // Generate month boundaries for the date range
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const months: {
      period: string;
      periodStart: string;
      periodEnd: string;
    }[] = [];

    const current = new Date(from.getFullYear(), from.getMonth(), 1);
    while (current <= to) {
      const monthStart = current.toISOString().split('T')[0];
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];

      const period = current.toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });

      months.push({
        period,
        periodStart: monthStart,
        periodEnd: monthEnd,
      });

      current.setMonth(current.getMonth() + 1);
    }

    const summary = [];
    for (const month of months) {
      // Get expected balance (accounting)
      const expectedResult = await BespokeQueries.getCashInHand(
        db,
        month.periodEnd
      );
      const expectedBalance = expectedResult.cashInHand;

      // Look for CashCountRecord for this period
      let countRecord:
        | {
            name: string;
            physicalCount: number;
            status: string;
          }
        | undefined = undefined;

      try {
        countRecord = (await db.knex!('CashCountRecord')
          .select('name', 'physicalCount', 'status')
          .where('periodStart', month.periodStart)
          .where('periodEnd', month.periodEnd)
          .first()) as
          | {
              name: string;
              physicalCount: number;
              status: string;
            }
          | undefined;
      } catch (error) {
        // Table may not exist yet, continue without reconciliation data
      }

      let physicalCount: number | null = null;
      let variance: number | null = null;
      let reconciliationStatus: 'pending' | 'reconciled' | 'none' = 'none';
      let recordName: string | null = null;

      if (countRecord) {
        physicalCount = Number(countRecord.physicalCount);
        variance = expectedBalance - physicalCount;
        reconciliationStatus =
          countRecord.status === 'Submitted' ? 'reconciled' : 'pending';
        recordName = countRecord.name;
      }

      summary.push({
        period: month.period,
        periodStart: month.periodStart,
        periodEnd: month.periodEnd,
        expectedBalance,
        physicalCount,
        variance,
        reconciliationStatus,
        recordName,
      });
    }

    return summary;
  }

  static async getIncomeAndExpenses(
    db: DatabaseCore,
    fromDate: string,
    toDate: string
  ) {
    const income = (await db.knex!.raw(
      `
      select sum(cast(credit as real) - cast(debit as real)) as balance, strftime('%Y-%m', date) as yearmonth
      from AccountingLedgerEntry
      where
        reverted = false and
        date between date(?) and date(?) and
        account in (
          select name
          from Account
          where rootType = 'Income'
        )
      group by yearmonth`,
      [fromDate, toDate]
    )) as IncomeExpense['income'];

    const expense = (await db.knex!.raw(
      `
      select sum(cast(debit as real) - cast(credit as real)) as balance, strftime('%Y-%m', date) as yearmonth
      from AccountingLedgerEntry
      where
        reverted = false and
        date between date(?) and date(?) and
        account in (
          select name
          from Account
          where rootType = 'Expense'
        )
      group by yearmonth`,
      [fromDate, toDate]
    )) as IncomeExpense['expense'];

    return { income, expense };
  }

  static async getTotalCreditAndDebit(db: DatabaseCore) {
    return (await db.knex!.raw(`
    select 
	    account, 
      sum(cast(credit as real)) as totalCredit, 
      sum(cast(debit as real)) as totalDebit
    from AccountingLedgerEntry
    group by account
    `)) as unknown as TotalCreditAndDebit;
  }

  static async getLoanLedger(
    db: DatabaseCore,
    loanProfile: string,
    fromDate?: string,
    toDate?: string
  ): Promise<LoanLedgerRow[]> {
    await BespokeQueries.ensureLoanLedgerColumns(db);
    const loanProfileRow = (await db.knex!(ModelNameEnum.LoanProfile)
      .select('liabilityAccount', 'interestExpenseAccount')
      .where('name', loanProfile)
      .first()) as
      | { liabilityAccount?: string; interestExpenseAccount?: string }
      | undefined;
    const liabilityAccount = loanProfileRow?.liabilityAccount;
    const interestExpenseAccount = loanProfileRow?.interestExpenseAccount;

    const query = db.knex!(ModelNameEnum.AccountingLedgerEntry)
      .select(
        'name',
        'date',
        'referenceName',
        db.knex!.raw(
          `case
            when loanProfile is null and account = ? then ?
            when loanProfile is null and account = ? then ?
            else loanProfile
          end as loanProfile`,
          [liabilityAccount, loanProfile, interestExpenseAccount, loanProfile]
        ),
        db.knex!.raw(
          `case
            when loanProfile is null and account = ? then ?
            when loanProfile is null and account = ? then ?
            else loanComponent
          end as loanComponent`,
          [liabilityAccount, 'Principal', interestExpenseAccount, 'Interest']
        )
      )
      .select({
        debit: db.knex!.raw('cast(debit as real)'),
        credit: db.knex!.raw('cast(credit as real)'),
      })
      .where('reverted', false)
      .andWhere((builder) => {
        builder
          .where((sub) => {
            sub
              .where('loanProfile', loanProfile)
              .andWhere('loanComponent', 'in', ['Principal', 'Interest']);
          })
          .orWhere((sub) => {
            if (!liabilityAccount && !interestExpenseAccount) {
              sub.whereRaw('0 = 1');
              return;
            }

            sub
              .whereNull('loanProfile')
              .andWhere((accountBuilder) => {
                if (liabilityAccount && interestExpenseAccount) {
                  accountBuilder.whereIn('account', [
                    liabilityAccount,
                    interestExpenseAccount,
                  ]);
                } else if (liabilityAccount) {
                  accountBuilder.where('account', liabilityAccount);
                } else if (interestExpenseAccount) {
                  accountBuilder.where('account', interestExpenseAccount);
                }
              })
              .andWhere((component) => {
                component
                  .whereNull('loanComponent')
                  .orWhere('loanComponent', '')
                  .orWhere('loanComponent', 'None');
              });
          });
      })
      .orderBy('date', 'asc')
      .orderBy('name', 'asc');

    if (fromDate) {
      query.andWhereRaw('date(date) >= date(?)', [fromDate]);
    }

    if (toDate) {
      query.andWhereRaw('date(date) <= date(?)', [toDate]);
    }

    return (await query) as LoanLedgerRow[];
  }

  static async getLoanSnapshot(
    db: DatabaseCore,
    loanProfileName: string,
    asOfDate: string
  ): Promise<LoanSnapshot | null> {
    const loanProfile = (await db.knex!(ModelNameEnum.LoanProfile)
      .select(
        'name',
        'lenderName',
        'liabilityAccount',
        'annualInterestRate',
        'startDate',
        'openingPrincipal',
        'openingAccruedInterest',
        'historicalInterestPaid',
        'includeHistoricalInterestPaid'
      )
      .where('name', loanProfileName)
      .first()) as
      | {
          name: string;
          lenderName: string;
          liabilityAccount: string;
          annualInterestRate: number | string;
          startDate: string;
          openingPrincipal: number | string;
          openingAccruedInterest: number | string;
          historicalInterestPaid?: number | string;
          includeHistoricalInterestPaid?: number | boolean | string;
        }
      | undefined;

    if (!loanProfile) {
      return null;
    }

    const ledgerRows = await BespokeQueries.getLoanLedger(
      db,
      loanProfileName,
      undefined,
      asOfDate
    );

    const preSystemTotals = await BespokeQueries.getLoanHistoricalPaymentTotals(
      db,
      loanProfileName
    );

    return BespokeQueries.computeLoanSnapshot(
      loanProfile,
      ledgerRows,
      asOfDate,
      preSystemTotals
    );
  }

  static async getLoanPortfolioSnapshot(
    db: DatabaseCore,
    asOfDate: string
  ): Promise<LoanSnapshot[]> {
    const loanProfiles = (await db.knex!(ModelNameEnum.LoanProfile)
      .select(
        'name',
        'lenderName',
        'liabilityAccount',
        'annualInterestRate',
        'startDate',
        'openingPrincipal',
        'openingAccruedInterest',
        'historicalInterestPaid',
        'includeHistoricalInterestPaid'
      )
      .where('active', true)
      .andWhere('startDate', '<=', asOfDate)
      .orderBy('name', 'asc')) as {
      name: string;
      lenderName: string;
      annualInterestRate: number | string;
      startDate: string;
      openingPrincipal: number | string;
      openingAccruedInterest: number | string;
      historicalInterestPaid?: number | string;
      includeHistoricalInterestPaid?: number | boolean | string;
    }[];

    const snapshots: LoanSnapshot[] = [];
    for (const loanProfile of loanProfiles) {
      const ledgerRows = await BespokeQueries.getLoanLedger(
        db,
        loanProfile.name,
        undefined,
        asOfDate
      );

      const preSystemTotals =
        await BespokeQueries.getLoanHistoricalPaymentTotals(
          db,
          loanProfile.name
        );

      snapshots.push(
        BespokeQueries.computeLoanSnapshot(
          loanProfile,
          ledgerRows,
          asOfDate,
          preSystemTotals
        )
      );
    }

    return snapshots;
  }

  static computeLoanSnapshot(
    loanProfile: {
      name: string;
      lenderName: string;
      liabilityAccount?: string;
      annualInterestRate: number | string;
      startDate: string;
      openingPrincipal: number | string;
      openingAccruedInterest: number | string;
      historicalInterestPaid?: number | string;
      includeHistoricalInterestPaid?: number | boolean | string;
    },
    ledgerRows: LoanLedgerRow[],
    asOfDate: string,
    preSystemTotals: {
      interestPaid: number;
      principalPaid: number;
      principalCredited: number;
    } = {
      interestPaid: 0,
      principalPaid: 0,
      principalCredited: 0,
    }
  ): LoanSnapshot {
    const asOf = BespokeQueries.toUtcDate(asOfDate);
    const start = BespokeQueries.toUtcDate(loanProfile.startDate);

    const annualRate = Number(loanProfile.annualInterestRate ?? 0);
    const openingPrincipal = Number(loanProfile.openingPrincipal ?? 0);
    const openingAccruedInterest = Number(
      loanProfile.openingAccruedInterest ?? 0
    );
    const historicalInterestPaid = Number(
      loanProfile.historicalInterestPaid ?? 0
    );
    const includeHistoricalInterestPaid = Boolean(
      loanProfile.includeHistoricalInterestPaid ?? false
    );
    const preSystemInterestPaid =
      historicalInterestPaid + (preSystemTotals?.interestPaid ?? 0);
    const preSystemPrincipalPaid = preSystemTotals?.principalPaid ?? 0;
    const preSystemPrincipalCredited = preSystemTotals?.principalCredited ?? 0;

    if (asOf.getTime() < start.getTime()) {
      return {
        loanProfile: loanProfile.name,
        liabilityAccount: loanProfile.liabilityAccount,
        lenderName: loanProfile.lenderName,
        annualInterestRate: annualRate,
        startDate: loanProfile.startDate,
        historicalInterestPaid,
        includeHistoricalInterestPaid,
        preSystemInterestPaid,
        preSystemPrincipalPaid,
        principalOutstanding: 0,
        interestPaid: 0,
        accruedInterest: 0,
        interestOwed: 0,
        totalDue: 0,
      };
    }

    let principalOutstanding = openingPrincipal + preSystemPrincipalCredited;
    let interestPaid = includeHistoricalInterestPaid
      ? preSystemInterestPaid
      : 0;

    for (const row of ledgerRows) {
      if (row.loanComponent === 'Principal') {
        principalOutstanding +=
          Number(row.credit ?? 0) - Number(row.debit ?? 0);
      } else if (row.loanComponent === 'Interest') {
        interestPaid += Number(row.debit ?? 0) - Number(row.credit ?? 0);
      }
    }

    const accruedInterest = BespokeQueries.computeAccruedInterest(
      annualRate,
      openingPrincipal,
      loanProfile.startDate,
      asOfDate,
      ledgerRows.filter((r) => r.loanComponent === 'Principal')
    );

    const interestOwed =
      openingAccruedInterest + accruedInterest - interestPaid;
    return {
      loanProfile: loanProfile.name,
      liabilityAccount: loanProfile.liabilityAccount,
      lenderName: loanProfile.lenderName,
      annualInterestRate: annualRate,
      startDate: loanProfile.startDate,
      historicalInterestPaid,
      includeHistoricalInterestPaid,
      preSystemInterestPaid,
      preSystemPrincipalPaid,
      preSystemPrincipalCredited,
      principalOutstanding,
      interestPaid,
      accruedInterest,
      interestOwed,
      totalDue: principalOutstanding + interestOwed,
    };
  }

  static async getLoanHistoricalPaymentTotals(
    db: DatabaseCore,
    loanProfileName: string
  ): Promise<{
    interestPaid: number;
    principalPaid: number;
    principalCredited: number;
  }> {
    const rows = (await db.knex!(ModelNameEnum.LoanProfileHistoricalPayment)
      .select('paymentType', 'amount', 'credit')
      .where('parent', loanProfileName)
      .andWhere('parentFieldname', 'historicalPayments')
      .whereIn('paymentType', ['Principal', 'Interest'])) as {
      paymentType: string;
      amount: number | string;
      credit?: number | string;
    }[];

    const totals = { interestPaid: 0, principalPaid: 0, principalCredited: 0 };
    for (const row of rows) {
      const amount = Number(row.amount ?? 0);
      const credit = Number(row.credit ?? 0);
      if (row.paymentType === 'Interest') {
        totals.interestPaid += amount;
      } else if (row.paymentType === 'Principal') {
        totals.principalPaid += amount;
        totals.principalCredited += credit;
      }
    }

    return totals;
  }

  static computeAccruedInterest(
    annualRatePercent: number,
    openingPrincipal: number,
    startDate: string,
    asOfDate: string,
    principalRows: LoanLedgerRow[]
  ): number {
    const annualRate = annualRatePercent / 100;
    const start = BespokeQueries.toUtcDate(startDate);
    const endExclusive = BespokeQueries.addDays(
      BespokeQueries.toUtcDate(asOfDate),
      1
    );
    if (start.getTime() >= endExclusive.getTime()) {
      return 0;
    }

    let cursor = BespokeQueries.addDays(start, 1);
    let principal = openingPrincipal;
    let accrued = 0;

    const sortedRows = [...principalRows].sort((a, b) => {
      const dA = BespokeQueries.toUtcDate(a.date).getTime();
      const dB = BespokeQueries.toUtcDate(b.date).getTime();
      if (dA !== dB) {
        return dA - dB;
      }

      return Number(a.name) - Number(b.name);
    });

    for (const row of sortedRows) {
      const rowDate = BespokeQueries.toUtcDate(row.date);
      const eventDate = rowDate.getTime() < start.getTime() ? start : rowDate;
      if (eventDate.getTime() >= endExclusive.getTime()) {
        break;
      }

      const daySpan = BespokeQueries.diffDays(cursor, eventDate);
      if (daySpan > 0) {
        accrued += principal * annualRate * (daySpan / 365);
      }

      principal += Number(row.credit ?? 0) - Number(row.debit ?? 0);
      cursor = BespokeQueries.addDays(eventDate, 1);
    }

    const remainingDays = BespokeQueries.diffDays(cursor, endExclusive);
    if (remainingDays > 0) {
      accrued += principal * annualRate * (remainingDays / 365);
    }

    return accrued;
  }

  static toUtcDate(value: string) {
    const date = new Date(value);
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  }

  static addDays(date: Date, days: number) {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value;
  }

  static diffDays(from: Date, to: Date) {
    const diff = to.getTime() - from.getTime();
    if (diff <= 0) {
      return 0;
    }

    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  static async getStockQuantity(
    db: DatabaseCore,
    item: string,
    location?: string,
    fromDate?: string,
    toDate?: string,
    batch?: string,
    serialNumbers?: string[]
  ): Promise<number | null> {
    /* eslint-disable @typescript-eslint/no-floating-promises */
    const query = db.knex!(ModelNameEnum.StockLedgerEntry)
      .sum('quantity')
      .where('item', item);

    if (location) {
      query.andWhere('location', location);
    }

    if (batch) {
      query.andWhere('batch', batch);
    }

    if (serialNumbers?.length) {
      query.andWhere('serialNumber', 'in', serialNumbers);
    }

    if (fromDate) {
      query.andWhereRaw('datetime(date) > datetime(?)', [fromDate]);
    }

    if (toDate) {
      query.andWhereRaw('datetime(date) < datetime(?)', [toDate]);
    }

    const value = (await query) as Record<string, number | null>[];
    if (!value.length) {
      return null;
    }

    return value[0][Object.keys(value[0])[0]];
  }

  static async getReturnBalanceItemsQty(
    db: DatabaseCore,
    schemaName: ModelNameEnum,
    docName: string
  ): Promise<Record<string, ReturnDocItem> | undefined> {
    const returnDocNames = (
      await db.knex!(schemaName)
        .select('name')
        .where('returnAgainst', docName)
        .andWhere('submitted', true)
        .andWhere('cancelled', false)
    ).map((i: { name: string }) => i.name);

    if (!returnDocNames.length) {
      return;
    }

    const returnedItemsQuery = db.knex!(`${schemaName}Item`)
      .sum({ quantity: 'quantity' })
      .whereIn('parent', returnDocNames);

    const docItemsQuery = db.knex!(`${schemaName}Item`)
      .where('parent', docName)
      .sum({ quantity: 'quantity' });

    if (
      [ModelNameEnum.SalesInvoice, ModelNameEnum.PurchaseInvoice].includes(
        schemaName
      )
    ) {
      returnedItemsQuery.select('item', 'batch').groupBy('item', 'batch');
      docItemsQuery.select('name', 'item', 'batch').groupBy('item', 'batch');
    }

    if (
      [ModelNameEnum.Shipment, ModelNameEnum.PurchaseReceipt].includes(
        schemaName
      )
    ) {
      returnedItemsQuery
        .select('item', 'batch', 'serialNumber')
        .groupBy('item', 'batch', 'serialNumber');
      docItemsQuery
        .select('name', 'item', 'batch', 'serialNumber')
        .groupBy('item', 'batch', 'serialNumber');
    }

    const returnedItems = (await returnedItemsQuery) as DocItem[];
    if (!returnedItems.length) {
      return;
    }
    const docItems = (await docItemsQuery) as DocItem[];

    const docItemsMap = BespokeQueries.#getDocItemMap(docItems);
    const returnedItemsMap = BespokeQueries.#getDocItemMap(returnedItems);

    const returnBalanceItems = BespokeQueries.#getReturnBalanceItemQtyMap(
      docItemsMap,
      returnedItemsMap
    );
    return returnBalanceItems;
  }

  static #getDocItemMap(docItems: DocItem[]): Record<string, ReturnDocItem> {
    const docItemsMap: Record<string, ReturnDocItem> = {};
    const batchesMap:
      | Record<
          string,
          { quantity: number; serialNumbers?: string[] | undefined }
        >
      | undefined = {};

    for (const item of docItems) {
      if (!!docItemsMap[item.item]) {
        if (item.batch) {
          let serialNumbers: string[] | undefined;

          if (!docItemsMap[item.item].batches![item.batch]) {
            docItemsMap[item.item].batches![item.batch] = {
              quantity: item.quantity,
              serialNumbers,
            };
          } else {
            docItemsMap[item.item].batches![item.batch] = {
              quantity: (docItemsMap[item.item].batches![item.batch].quantity +=
                item.quantity),
              serialNumbers,
            };
          }
        } else {
          docItemsMap[item.item].quantity += item.quantity;
        }

        if (item.serialNumber) {
          const serialNumbers: string[] = [];

          if (docItemsMap[item.item].serialNumbers) {
            serialNumbers.push(...(docItemsMap[item.item].serialNumbers ?? []));
          }

          serialNumbers.push(...item.serialNumber.split('\n'));
          docItemsMap[item.item].serialNumbers = serialNumbers;
        }
        continue;
      }

      if (item.batch) {
        let serialNumbers: string[] | undefined = undefined;
        if (item.serialNumber) {
          serialNumbers = item.serialNumber.split('\n');
        }

        batchesMap[item.batch] = {
          serialNumbers,
          quantity: item.quantity,
        };
      }

      let serialNumbers: string[] | undefined = undefined;

      if (!item.batch && item.serialNumber) {
        serialNumbers = item.serialNumber.split('\n');
      }

      docItemsMap[item.item] = {
        serialNumbers,
        batches: batchesMap,
        quantity: item.quantity,
      };
    }
    return docItemsMap;
  }

  static #getReturnBalanceItemQtyMap(
    docItemsMap: Record<string, ReturnDocItem>,
    returnedItemsMap: Record<string, ReturnDocItem>
  ): Record<string, ReturnDocItem> {
    const returnBalanceItems: Record<string, ReturnDocItem> | undefined = {};
    const balanceBatchQtyMap:
      | Record<
          string,
          { quantity: number; serialNumbers: string[] | undefined }
        >
      | undefined = {};

    for (const row in docItemsMap) {
      const balanceSerialNumbersMap: string[] | undefined = [];
      let balanceQty = safeParseFloat(-docItemsMap[row].quantity);
      const docItem = docItemsMap[row];
      const returnedDocItem = returnedItemsMap[row];
      const docItemHasBatch = !!Object.keys(docItem.batches ?? {}).length;

      if (returnedItemsMap) {
        for (const item in returnedItemsMap) {
          if (docItemHasBatch && item !== row) {
            continue;
          }

          balanceQty = -(
            Math.abs(balanceQty) + returnedItemsMap[item].quantity
          );

          const returnedItem = returnedItemsMap[item];

          if (docItem.serialNumbers && returnedItem.serialNumbers) {
            for (const serialNumber of docItem.serialNumbers) {
              if (!returnedItem.serialNumbers.includes(serialNumber)) {
                balanceSerialNumbersMap.push(serialNumber);
              }
            }
          }
        }
      }

      if (docItemHasBatch && docItem.batches) {
        for (const batch in docItem.batches) {
          const docItemSerialNumbers = docItem.batches[batch].serialNumbers;
          const itemSerialNumbers = docItem.batches[batch].serialNumbers;
          let balanceSerialNumbers: string[] | undefined;

          if (docItemSerialNumbers && itemSerialNumbers) {
            balanceSerialNumbers = docItemSerialNumbers.filter(
              (serialNumber: string) =>
                itemSerialNumbers.indexOf(serialNumber) == -1
            );
          }

          const ItemQty = Math.abs(docItem.batches[batch].quantity);
          let balanceQty = safeParseFloat(-ItemQty);

          if (!returnedDocItem || !returnedDocItem?.batches) {
            continue;
          }

          const returnedItem = returnedDocItem?.batches[batch];

          if (!returnedItem) {
            balanceBatchQtyMap[batch] = {
              quantity: balanceQty,
              serialNumbers: balanceSerialNumbers,
            };
            continue;
          }

          balanceQty = -(
            Math.abs(safeParseFloat(-ItemQty)) -
            Math.abs(returnedDocItem.batches[batch].quantity)
          );

          balanceBatchQtyMap[batch] = {
            quantity: balanceQty,
            serialNumbers: balanceSerialNumbers,
          };
        }
      }

      returnBalanceItems[row] = {
        quantity: balanceQty,
        batches: balanceBatchQtyMap,
        serialNumbers: balanceSerialNumbersMap,
      };
    }

    return returnBalanceItems;
  }

  static async getPOSTransactedAmount(
    db: DatabaseCore,
    fromDate: Date,
    toDate: Date,
    lastShiftClosingDate?: Date
  ): Promise<Record<string, number> | undefined> {
    const invoicesQuery = db.knex!(ModelNameEnum.SalesInvoice)
      .select('name', 'returnAgainst')
      .where('isPOS', true)
      .andWhereBetween('date', [fromDate.toISOString(), toDate.toISOString()]);

    if (lastShiftClosingDate) {
      invoicesQuery.andWhere(
        'created',
        '>',
        lastShiftClosingDate.toISOString()
      );
    }

    const invoices = (await invoicesQuery) as {
      name: string;
      returnAgainst: string | null;
    }[];

    if (!invoices.length) {
      return;
    }

    const sinvNames = invoices.map((row) => row.name);
    const invoiceSignMap = invoices.reduce<Record<string, number>>(
      (map, inv) => {
        map[inv.name] = inv.returnAgainst ? -1 : 1;
        return map;
      },
      {}
    );

    const paymentEntryNames: string[] = (
      await db.knex!(ModelNameEnum.PaymentFor)
        .select('parent', 'referenceName')
        .whereIn('referenceName', sinvNames)
    ).map((doc: { parent: string }) => doc.parent);

    if (!paymentEntryNames.length) {
      return;
    }

    const groupedAmounts = (await db.knex!(ModelNameEnum.Payment)
      .select('paymentMethod', 'name')
      .whereIn('name', paymentEntryNames)
      .groupBy('paymentMethod', 'name')
      .sum({ amount: 'amount' })) as {
      paymentMethod: string;
      name: string;
      amount: number;
    }[];

    const transactedAmounts: Record<string, number> = {};

    for (const row of groupedAmounts) {
      const paymentRefs = (await db.knex!(ModelNameEnum.PaymentFor)
        .select('referenceName')
        .where('parent', row.name)) as { referenceName: string }[];

      for (const ref of paymentRefs) {
        const sign = invoiceSignMap[ref.referenceName] ?? 1;
        const signedAmount = Number(row.amount) * sign;

        transactedAmounts[row.paymentMethod] =
          (transactedAmounts[row.paymentMethod] ?? 0) + signedAmount;
      }
    }

    return transactedAmounts;
  }
}
