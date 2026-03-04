# Cash in Hand Summary Feature - Requirements

## Feature Overview

**Feature**: Cash in Hand Summary - Monthly Opening/Closing Balance Report

**Purpose**: Show how cash position changed over time with opening/closing balances and net movement for each month or custom date range.

**Context**: Complements existing "Cash in Hand" snapshot widget (shows current balance as of a date) and Cashflow chart (shows inflow/outflow). This fills the gap by showing the progression of the cash account balance.

## User Stories

### User Story 1: View Monthly Cash Changes

> As a business owner, I want to see my opening and closing cash balance for each month, so I can understand how my cash position changed month-to-month.

**Acceptance Criteria**:

- Display table with Period | Opening | Closing | Net Change columns
- Default to last 12 months (including current month)
- Months show in chronological order (oldest to newest)
- Opening balance for Month N equals closing balance for Month N-1
- All amounts in currency format

### User Story 2: Custom Date Range

> As a business owner, I want to select a custom date range, so I can analyze cash changes for specific periods (quarters, custom ranges).

**Acceptance Criteria**:

- Date range picker on the widget (from date → to date)
- Recalculate summary when dates change
- Support any start/end date
- Optional: Show by month or by quarter

### User Story 3: Understand Cash Movement

> As a business owner, I want to see net cash change (closing - opening), so I can quickly understand if I gained or lost cash in a period.

**Acceptance Criteria**:

- Net Change column = Closing Balance - Opening Balance
- Positive values shown as gains (green indicator optional)
- Negative values shown as losses (red indicator optional)

## Feature Specifications

### Data Model

```
{
  period: "Jan 2026",
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  openingBalance: 10000,
  closingBalance: 15000,
  netChange: 5000
}[]
```

### Component Behavior

**CashInHandSummary.vue**:

- Props: `darkMode: boolean` (from parent Dashboard)
- Data:
  - `summaryData: Array<SummaryRow>` - table rows
  - `dateRangeStart: string` - ISO date
  - `dateRangeEnd: string` - ISO date
  - `groupBy: string` - 'monthly' or 'quarterly'
- Methods:
  - `setData()` - fetch summary from backend
  - `handleDateRangeChange()` - recalculate on date change

### Calculation Logic

**Opening Balance for a Period**:

- Cash balance as of start of period (inclusive)
- Formula: `getCashInHand(periodStart)`

**Closing Balance for a Period**:

- Cash balance as of end of period (inclusive)
- Formula: `getCashInHand(periodEnd)`

**Net Change**:

- Formula: `closingBalance - openingBalance`

### Backend Requirements

**New Bespoke Query**: `getCashInHandSummary(db, fromDate, toDate, groupBy='monthly')`

- Input: fromDate (string, ISO), toDate (string, ISO), groupBy ('monthly' | 'quarterly')
- Output: Array of { period, periodStart, periodEnd, openingBalance, closingBalance, netChange }
- Logic:
  1. Generate list of period boundaries based on groupBy
  2. For each period, calculate opening (start date) and closing (end date) cash balance
  3. Return sorted by period start date

**New DbHandler Method**: `getCashInHandSummary(fromDate, toDate, groupBy)`

- Wraps bespoke query
- Returns typed response

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Cash in Hand Summary                                │
│                                                      │
│ From: [date picker]  To: [date picker] [Refresh]    │
│                                                      │
│ ┌────────────┬──────────┬──────────┬────────────┐  │
│ │ Period     │ Opening  │ Closing  │ Net Change │  │
│ ├────────────┼──────────┼──────────┼────────────┤  │
│ │ Jan 2026   │ ₹10,000  │ ₹15,000  │ +₹5,000    │  │
│ │ Feb 2026   │ ₹15,000  │ ₹12,000  │ -₹3,000    │  │
│ │ Mar 2026   │ ₹12,000  │ ₹18,000  │ +₹6,000    │  │
│ └────────────┴──────────┴──────────┴────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Styling

- Follows LoanSummary pattern (bordered card, labels in gray)
- Table styling: Simple borders, alternating row backgrounds (optional)
- Dark mode: Respect `--bg-gray-800`, `--border-gray-700`
- Responsive: Wrap table on mobile, or allow horizontal scroll

## Non-Functional Requirements

- **Performance**: Should load for 12+ months of data in < 500ms
- **Responsiveness**: Full-width on dashboard (matches Cashflow widget)
- **Dark Mode**: Full support for dark theme colors
- **Accessibility**: Semantic HTML, proper table structure

## Out of Scope (Future)

- Export to CSV/PDF
- Comparison with previous period
- Quarterly/yearly grouping (MVP is monthly only)
- Charts/visualizations (table only for MVP)
- Customizable period ranges in settings

## Success Criteria

- ✅ Component renders on Dashboard below Cashflow
- ✅ Shows correct opening/closing balances for each month
- ✅ Validates: opening Month N = closing Month N-1
- ✅ Date range picker works and recalculates data
- ✅ All amounts formatted as currency
- ✅ Dark mode styling correct
- ✅ No linting errors
- ✅ Loads within 500ms for 12 months

## Related Components

- **Cash in Hand Widget** (existing): Shows single point-in-time balance
- **Cashflow Widget** (existing): Shows inflow/outflow by month
- **Dashboard**: Parent component that will host this widget
