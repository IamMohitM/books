import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
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
  sortByDate?: string;
  loading = false;

  async setDefaultFilters() {
    if (!this.asOfDate) {
      this.asOfDate = DateTime.now().toISODate();
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
        fieldname: 'sortByDate',
        label: t`Sort By Date`,
        options: [
          { label: t`Oldest First`, value: 'asc' },
          { label: t`Newest First`, value: 'desc' },
        ],
      },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      {
        fieldname: 'lenderName',
        label: t`Lender`,
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
        label: t`Interest Paid`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'preSystemInterestPaid',
        label: t`Interest Paid (Pre-System)`,
        fieldtype: 'Currency',
        align: 'right',
      },
      {
        fieldname: 'preSystemPrincipalPaid',
        label: t`Principal Paid (Pre-System)`,
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
        label: t`Liability Account`,
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

    const sortByDate = this.sortByDate === 'desc' ? 'desc' : 'asc';
    rows = rows.slice().sort((a, b) => {
      const aDate = a.startDate ?? '';
      const bDate = b.startDate ?? '';
      if (aDate === bDate) {
        return (a.lenderName ?? '').localeCompare(b.lenderName ?? '');
      }

      return sortByDate === 'asc'
        ? aDate.localeCompare(bDate)
        : bDate.localeCompare(aDate);
    });

    this.reportData = this.getRows(rows);
    this.loading = false;
  }

  getRows(rows: LoanSnapshot[]): ReportData {
    const data: ReportData = rows.map((row) => {
      const values = [
        row.lenderName,
        row.startDate ?? '',
        row.annualInterestRate,
        row.principalOutstanding,
        row.interestPaid,
        row.preSystemInterestPaid ?? 0,
        row.preSystemPrincipalPaid ?? 0,
        row.accruedInterest,
        row.interestOwed,
        row.totalDue,
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
        acc.principalOutstanding += row.principalOutstanding;
        acc.interestPaid += row.interestPaid;
        acc.preSystemInterestPaid += row.preSystemInterestPaid ?? 0;
        acc.preSystemPrincipalPaid += row.preSystemPrincipalPaid ?? 0;
        acc.accruedInterest += row.accruedInterest;
        acc.interestOwed += row.interestOwed;
        acc.totalDue += row.totalDue;
        return acc;
      },
      {
        principalOutstanding: 0,
        interestPaid: 0,
        preSystemInterestPaid: 0,
        preSystemPrincipalPaid: 0,
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
          value: this.fyo.format(totals.preSystemInterestPaid, 'Currency'),
          rawValue: totals.preSystemInterestPaid,
          align: 'right',
          bold: true,
          width: this.columns[5]?.width,
        },
        {
          value: this.fyo.format(totals.preSystemPrincipalPaid, 'Currency'),
          rawValue: totals.preSystemPrincipalPaid,
          align: 'right',
          bold: true,
          width: this.columns[6]?.width,
        },
        {
          value: this.fyo.format(totals.accruedInterest, 'Currency'),
          rawValue: totals.accruedInterest,
          align: 'right',
          bold: true,
          width: this.columns[7]?.width,
        },
        {
          value: this.fyo.format(totals.interestOwed, 'Currency'),
          rawValue: totals.interestOwed,
          align: 'right',
          bold: true,
          width: this.columns[8]?.width,
        },
        {
          value: this.fyo.format(totals.totalDue, 'Currency'),
          rawValue: totals.totalDue,
          align: 'right',
          bold: true,
          width: this.columns[9]?.width,
        },
        {
          value: '',
          rawValue: '',
          width: this.columns[10]?.width,
        },
      ],
    });

    return data;
  }
}
