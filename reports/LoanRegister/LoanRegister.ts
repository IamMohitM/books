import { Fyo, t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { Report } from 'reports/Report';
import { ColumnField, ReportData, ReportRow } from 'reports/types';
import { Field } from 'schemas/types';
import { LoanSnapshot } from 'utils/db/types';
import getCommonExportActions from '../commonExporter';

export class LoanRegister extends Report {
  static title = t`Loan Register`;
  static reportName = 'loan-register';

  asOfDate?: string;
  fromDate?: string;
  loanProfile?: string;
  sortByField?: 'startDate' | 'lenderName';
  sortByDate?: string;
  loading = false;
  shouldRefresh = false;

  constructor(fyo: Fyo) {
    super(fyo);
    this._setObservers();
  }

  _setObservers() {
    const listener = () => (this.shouldRefresh = true);

    this.fyo.doc.observer.on(`sync:${ModelNameEnum.LoanProfile}`, listener);
    this.fyo.doc.observer.on(`delete:${ModelNameEnum.LoanProfile}`, listener);

    this.fyo.doc.observer.on(
      `sync:${ModelNameEnum.LoanProfileHistoricalPayment}`,
      listener
    );
    this.fyo.doc.observer.on(
      `delete:${ModelNameEnum.LoanProfileHistoricalPayment}`,
      listener
    );

    this.fyo.doc.observer.on(
      `sync:${ModelNameEnum.AccountingLedgerEntry}`,
      listener
    );
    this.fyo.doc.observer.on(
      `delete:${ModelNameEnum.AccountingLedgerEntry}`,
      listener
    );
  }

  async setDefaultFilters() {
    if (!this.asOfDate) {
      this.asOfDate = DateTime.now().toISODate();
    }
    if (!this.sortByField) {
      this.sortByField = 'startDate';
    }
    if (!this.sortByDate) {
      this.sortByDate = 'asc';
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
      } as Field,
      {
        fieldtype: 'Date',
        fieldname: 'asOfDate',
        label: t`As Of Date`,
        placeholder: t`As Of Date`,
        required: true,
      },
      {
        fieldtype: 'Select',
        fieldname: 'sortByField',
        label: t`Sort By`,
        options: [
          { label: t`Start Date`, value: 'startDate' },
          { label: t`Lender / Borrower`, value: 'lenderName' },
        ],
      },
      {
        fieldtype: 'Select',
        fieldname: 'sortByDate',
        label: t`Sort Order`,
        options: [
          { label: t`Ascending`, value: 'asc' },
          { label: t`Descending`, value: 'desc' },
        ],
      },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      {
        fieldname: 'lenderName',
        label: t`Lender / Borrower`,
        fieldtype: 'Data',
        width: 1.5,
      },
      {
        fieldname: 'startDate',
        label: t`Start Date`,
        fieldtype: 'Date',
        width: 1.1,
      },
      {
        fieldname: 'annualInterestRate',
        label: t`Rate (%)`,
        fieldtype: 'Float',
        align: 'right',
      },
      {
        fieldname: 'principalOutstanding',
        label: t`Principal Outstanding`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'interestPaid',
        label: t`Interest Paid / Received`,
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
      {
        fieldname: 'liabilityAccount',
        label: t`Loan Account`,
        fieldtype: 'Data',
        width: 1.5,
      },
    ];
  }

  async setReportData(_filter?: string, _force?: boolean): Promise<void> {
    this.loading = true;
    const asOfDate = this.asOfDate as string;

    let rows: LoanSnapshot[] = [];
    if (this.loanProfile) {
      const row = await this.fyo.db.getLoanSnapshot(this.loanProfile, asOfDate);
      if (row) {
        rows = [row];
      }
    } else {
      rows = await this.fyo.db.getLoanPortfolioSnapshot(asOfDate);
    }

    const sortOrder = this.sortByDate === 'desc' ? 'desc' : 'asc';
    const sortByField = this.sortByField ?? 'startDate';
    rows = rows.slice().sort((a, b) => {
      const aDate = a.startDate ?? '';
      const bDate = b.startDate ?? '';
      const aLender = a.lenderName ?? '';
      const bLender = b.lenderName ?? '';

      if (sortByField === 'lenderName') {
        const nameCompare = aLender.localeCompare(bLender);
        if (nameCompare !== 0) {
          return sortOrder === 'asc' ? nameCompare : -nameCompare;
        }
        return aDate.localeCompare(bDate);
      }

      if (aDate === bDate) {
        return aLender.localeCompare(bLender);
      }

      return sortOrder === 'asc'
        ? aDate.localeCompare(bDate)
        : bDate.localeCompare(aDate);
    });

    this.reportData = this.getRows(rows);
    this.loading = false;
    this.shouldRefresh = false;
  }

  getRows(rows: LoanSnapshot[]): ReportData {
    const data: ReportData = rows.map((row) => {
      const preSystemPrincipalPaid = row.preSystemPrincipalPaid ?? 0;
      const preSystemInterestPaid = row.preSystemInterestPaid ?? 0;
      const includeHistoricalInterestPaid = Boolean(
        row.includeHistoricalInterestPaid ?? false
      );
      const adjustedInterestPaid = includeHistoricalInterestPaid
        ? row.interestPaid
        : row.interestPaid + preSystemInterestPaid;
      const adjustedPrincipalOutstanding =
        row.principalOutstanding - preSystemPrincipalPaid;
      const adjustedInterestOwed =
        row.interestOwed -
        (includeHistoricalInterestPaid ? 0 : preSystemInterestPaid);
      const adjustedTotalDue =
        row.totalDue -
        preSystemPrincipalPaid -
        (includeHistoricalInterestPaid ? 0 : preSystemInterestPaid);

      const values = [
        row.lenderName,
        row.startDate ?? '',
        row.annualInterestRate,
        adjustedPrincipalOutstanding,
        adjustedInterestPaid,
        row.accruedInterest,
        adjustedInterestOwed,
        adjustedTotalDue,
        row.liabilityAccount ?? row.loanProfile,
      ];

      return {
        cells: values.map((value, i) => {
          const column = this.columns[i];
          const isNumeric = typeof value === 'number';
          let display = String(value ?? '');
          const isLender = column.fieldname === 'lenderName';

          if (column.fieldname === 'annualInterestRate') {
            display = Number(value ?? 0).toFixed(2);
          } else if (column.fieldtype === 'Date' && value) {
            display = this.fyo.format(value, 'Date');
          } else if (isNumeric) {
            display = this.fyo.format(value as number, 'Currency');
          }

          return {
            value: display,
            rawValue: value,
            align: column.align ?? (isNumeric ? 'right' : 'left'),
            width: column.width ?? 1,
            bold: isLender,
          };
        }),
      } as ReportRow;
    });

    if (!rows.length) {
      return [];
    }

    const totals = rows.reduce(
      (acc, row) => {
        const preSystemPrincipalPaid = row.preSystemPrincipalPaid ?? 0;
        const preSystemInterestPaid = row.preSystemInterestPaid ?? 0;
        const includeHistoricalInterestPaid = Boolean(
          row.includeHistoricalInterestPaid ?? false
        );
        const adjustedInterestPaid = includeHistoricalInterestPaid
          ? row.interestPaid
          : row.interestPaid + preSystemInterestPaid;
        const adjustedPrincipalOutstanding =
          row.principalOutstanding - preSystemPrincipalPaid;
        const adjustedInterestOwed =
          row.interestOwed -
          (includeHistoricalInterestPaid ? 0 : preSystemInterestPaid);
        const adjustedTotalDue =
          row.totalDue -
          preSystemPrincipalPaid -
          (includeHistoricalInterestPaid ? 0 : preSystemInterestPaid);

        acc.principalOutstanding += adjustedPrincipalOutstanding;
        acc.interestPaid += adjustedInterestPaid;
        acc.accruedInterest += row.accruedInterest;
        acc.interestOwed += adjustedInterestOwed;
        acc.totalDue += adjustedTotalDue;
        return acc;
      },
      {
        principalOutstanding: 0,
        interestPaid: 0,
        accruedInterest: 0,
        interestOwed: 0,
        totalDue: 0,
      }
    );

    data.push({
      cells: [
        {
          value: t`Total`,
          rawValue: 'Total',
          bold: true,
          width: this.columns[0]?.width,
        },
        {
          value: '',
          rawValue: '',
          width: this.columns[1]?.width,
        },
        {
          value: '',
          rawValue: '',
          width: this.columns[2]?.width,
        },
        {
          value: this.fyo.format(totals.principalOutstanding, 'Currency'),
          rawValue: totals.principalOutstanding,
          align: 'right',
          bold: true,
          width: this.columns[3]?.width,
        },
        {
          value: this.fyo.format(totals.interestPaid, 'Currency'),
          rawValue: totals.interestPaid,
          align: 'right',
          bold: true,
          width: this.columns[4]?.width,
        },
        {
          value: this.fyo.format(totals.accruedInterest, 'Currency'),
          rawValue: totals.accruedInterest,
          align: 'right',
          bold: true,
          width: this.columns[5]?.width,
        },
        {
          value: this.fyo.format(totals.interestOwed, 'Currency'),
          rawValue: totals.interestOwed,
          align: 'right',
          bold: true,
          width: this.columns[6]?.width,
        },
        {
          value: this.fyo.format(totals.totalDue, 'Currency'),
          rawValue: totals.totalDue,
          align: 'right',
          bold: true,
          width: this.columns[7]?.width,
        },
        {
          value: '',
          rawValue: '',
          width: this.columns[8]?.width,
        },
      ],
    });

    return data;
  }
}
