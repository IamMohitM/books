import { AccountLedger } from './AccountLedger/AccountLedger';
import { BalanceSheet } from './BalanceSheet/BalanceSheet';
import { GeneralLedger } from './GeneralLedger/GeneralLedger';
import { GSTR1 } from './GoodsAndServiceTax/GSTR1';
import { GSTR2 } from './GoodsAndServiceTax/GSTR2';
import { LoanRegister } from './LoanRegister/LoanRegister';
import { LoanLedger } from './LoanLedger/LoanLedger';
import { ProfitAndLoss } from './ProfitAndLoss/ProfitAndLoss';
import { TrialBalance } from './TrialBalance/TrialBalance';
import { StockBalance } from './inventory/StockBalance';
import { StockLedger } from './inventory/StockLedger';

export const reports = {
  AccountLedger,
  GeneralLedger,
  ProfitAndLoss,
  BalanceSheet,
  TrialBalance,
  GSTR1,
  GSTR2,
  LoanRegister,
  LoanLedger,
  StockLedger,
  StockBalance,
} as const;
