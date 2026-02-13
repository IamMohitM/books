import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { Report } from 'reports/Report';
import { ColumnField, ReportData, ReportRow } from 'reports/types';
import { Field } from 'schemas/types';
import { LoanLedgerRow } from 'utils/db/types';
import { Money } from 'pesa';
import getCommonExportActions from '../commonExporter';

type LoanLedgerComputedRow = {
  date: string;
  referenceName: string;
  loanComponent: string;
  debit: number;
  credit: number;
  principalOutstanding: number;
  accruedInterest: number;
  interestPaid: number;
  interestOwed: number;
  totalDue: number;
};

export class LoanLedger extends Report {
  static title = t`Loan Ledger`;
  static reportName = 'loan-ledger';

  loanProfile?: string;
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  loading = false;

  async setDefaultFilters() {
    if (!this.asOfDate) {
      this.asOfDate = DateTime.now().toISODate();
    }
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Link',
        target: 'LoanProfile',
        fieldname: 'loanProfile',
        label: t`Loan Account`,
        placeholder: t`Loan Account`,
        required: true,
      } as Field,
      {
        fieldtype: 'Date',
        fieldname: 'fromDate',
        label: t`From Date`,
        placeholder: t`From Date`,
      },
      {
        fieldtype: 'Date',
        fieldname: 'toDate',
        label: t`To Date`,
        placeholder: t`To Date`,
      },
      {
        fieldtype: 'Date',
        fieldname: 'asOfDate',
        label: t`As Of Date`,
        placeholder: t`As Of Date`,
        required: true,
      },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      { fieldname: 'date', label: t`Date`, fieldtype: 'Date', width: 1.1 },
      {
        fieldname: 'referenceName',
        label: t`Reference`,
        fieldtype: 'Data',
        width: 1.5,
      },
      {
        fieldname: 'loanComponent',
        label: t`Component`,
        fieldtype: 'Data',
        width: 1,
      },
      {
        fieldname: 'debit',
        label: t`Debit`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'credit',
        label: t`Credit`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'principalOutstanding',
        label: t`Principal Outstanding`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'accruedInterest',
        label: t`Accrued Interest`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'interestPaid',
        label: t`Interest Paid`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'interestOwed',
        label: t`Interest Owed`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'totalDue',
        label: t`Total Due`,
        fieldtype: 'Currency',
        align: 'right',
      },
    ];
  }

  async setReportData(): Promise<void> {
    this.loading = true;
    this.reportData = [];

    const loanProfile = this.loanProfile as string;
    if (!loanProfile) {
      this.emptyMessage = t`Select a Loan Account to view the ledger.`;
      this.loading = false;
      return;
    }
    this.emptyMessage = undefined;

    const asOfDate = this.asOfDate as string;
    const toDate = this.toDate ?? asOfDate;
    const fromDate = this.fromDate ?? undefined;

    const profile = (await this.fyo.db.get(ModelNameEnum.LoanProfile, loanProfile, [
      'name',
      'lenderName',
      'annualInterestRate',
      'startDate',
      'openingPrincipal',
      'openingAccruedInterest',
    ])) as {
      name: string;
      lenderName: string;
      annualInterestRate: number | string;
      startDate: string;
      openingPrincipal: number | string;
      openingAccruedInterest: number | string;
    };

    const ledgerRows = await this.fyo.db.getLoanLedger(
      loanProfile,
      fromDate,
      toDate
    );

    const rows = this.buildLoanLedger(profile, ledgerRows, asOfDate);
    this.reportData = this.getRows(rows);
    this.loading = false;
  }

  private buildLoanLedger(
    profile: {
      name: string;
      lenderName: string;
      annualInterestRate: number | string;
      startDate: string;
      openingPrincipal: number | string;
      openingAccruedInterest: number | string;
    },
    ledgerRows: LoanLedgerRow[],
    asOfDate: string
  ): LoanLedgerComputedRow[] {
    const toNumber = (value: unknown) => {
      if (value instanceof Money) {
        return value.float;
      }
      return Number(value ?? 0);
    };

    const annualRate = toNumber(profile.annualInterestRate ?? 0) / 100;
    const openingPrincipal = toNumber(profile.openingPrincipal ?? 0);
    const openingAccruedInterest = toNumber(profile.openingAccruedInterest ?? 0);

    let principal = openingPrincipal;
    let interestPaid = 0;
    let accrued = 0;

    const start = this.toUtcDate(profile.startDate);
    const endExclusive = this.addDays(this.toUtcDate(asOfDate), 1);
    let cursor = this.addDays(start, 1);

    if (start.getTime() >= endExclusive.getTime()) {
      return [
        {
          date: asOfDate,
          referenceName: `${t`As of`} ${asOfDate}`,
          loanComponent: '',
          debit: 0,
          credit: 0,
          principalOutstanding: 0,
          accruedInterest: 0,
          interestPaid: 0,
          interestOwed: 0,
          totalDue: 0,
        },
      ];
    }

    const sorted = [...ledgerRows].sort((a, b) => {
      const dA = this.toUtcDate(a.date).getTime();
      const dB = this.toUtcDate(b.date).getTime();
      if (dA !== dB) {
        return dA - dB;
      }
      return Number(a.name) - Number(b.name);
    });

    const result: LoanLedgerComputedRow[] = [];
    if (openingPrincipal !== 0 || openingAccruedInterest !== 0) {
      result.push({
        date: profile.startDate,
        referenceName: t`Opening Balance`,
        loanComponent: t`Opening`,
        debit: 0,
        credit: 0,
        principalOutstanding: principal,
        accruedInterest: 0,
        interestPaid: 0,
        interestOwed: openingAccruedInterest,
        totalDue: principal + openingAccruedInterest,
      });
    }

    for (const row of sorted) {
      const rowDate = this.toUtcDate(row.date);
      const eventDate = rowDate.getTime() < start.getTime() ? start : rowDate;
      if (eventDate.getTime() >= endExclusive.getTime()) {
        break;
      }

      const daySpan = this.diffDays(cursor, eventDate);
      if (daySpan > 0) {
        accrued += principal * annualRate * (daySpan / 365);
      }
      cursor = this.addDays(eventDate, 1);

      if (row.loanComponent === 'Principal') {
        principal += toNumber(row.credit ?? 0) - toNumber(row.debit ?? 0);
      } else if (row.loanComponent === 'Interest') {
        interestPaid += toNumber(row.debit ?? 0) - toNumber(row.credit ?? 0);
      }

      const interestOwed = openingAccruedInterest + accrued - interestPaid;
      result.push({
        date: row.date,
        referenceName: row.referenceName,
        loanComponent: row.loanComponent,
        debit: toNumber(row.debit ?? 0),
        credit: toNumber(row.credit ?? 0),
        principalOutstanding: principal,
        accruedInterest: accrued,
        interestPaid,
        interestOwed,
        totalDue: principal + interestOwed,
      });
    }

    if (cursor.getTime() < endExclusive.getTime()) {
      const remainingDays = this.diffDays(cursor, endExclusive);
      if (remainingDays > 0) {
        accrued += principal * annualRate * (remainingDays / 365);
      }
    }

    const finalInterestOwed = openingAccruedInterest + accrued - interestPaid;
    result.push({
      date: asOfDate,
      referenceName: `${t`As of`} ${asOfDate}`,
      loanComponent: '',
      debit: 0,
      credit: 0,
      principalOutstanding: principal,
      accruedInterest: accrued,
      interestPaid,
      interestOwed: finalInterestOwed,
      totalDue: principal + finalInterestOwed,
    });

    return result;
  }

  private toUtcDate(value: string) {
    const date = new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private diffDays(a: Date, b: Date) {
    const ms = b.getTime() - a.getTime();
    return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
  }

  private getRows(rows: LoanLedgerComputedRow[]): ReportData {
    return rows.map((row) => {
      const values = [
        row.date,
        row.referenceName,
        row.loanComponent,
        row.debit,
        row.credit,
        row.principalOutstanding,
        row.accruedInterest,
        row.interestPaid,
        row.interestOwed,
        row.totalDue,
      ];

      return {
        cells: values.map((value, i) => {
          const column = this.columns[i];
          const isNumeric = typeof value === 'number';
          let display = String(value ?? '');

          if (column.fieldtype === 'Currency' && isNumeric) {
            display = this.fyo.format(value as number, 'Currency');
          }

          return {
            value: display,
            rawValue: value,
            align: column.align ?? (isNumeric ? 'right' : 'left'),
            width: column.width ?? 1,
          };
        }),
      } as ReportRow;
    });
  }
}
