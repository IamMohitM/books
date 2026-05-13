<div align="center" markdown="1">
<br/>

<img src="https://frappe.io/files/books.png" alt="Vaulta logo" width="80"/>

<br/>

<h1>Vaulta</h1>

**Modern Accounting Made Simple**

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/frappe/books)](https://github.com/frappe/books/releases)
![Platforms](https://img.shields.io/badge/platform-mac%2C%20windows%2C%20linux-yellowgreen)
[![Publish](https://github.com/frappe/books/actions/workflows/publish.yml/badge.svg)](https://github.com/frappe/books/actions/workflows/publish.yml)

</div>

<div align="center">
<img src="https://user-images.githubusercontent.com/29507195/207267857-4ae48890-3fb2-4046-80cf-3256b46c72a0.png" alt="Vaulta Preview"/>
</div>
<br />
<div align="center">
	<a href="https://frappe.io/books">Website</a>
	-
	<a href="https://docs.frappe.io/books">Documentation</a>
</div>

## Vaulta

Vaulta builds on [Frappe Books](https://github.com/frappe/books), originally maintained by Frappe Technologies, and is focused on a narrower problem: tracking cash transactions, loans taken, and the interest owed on those loans.

The upstream accounting engine stays in place, but the product direction changes. Vaulta is tuned for cash-led workflows, loan registers, loan ledgers, and reconciliation of the balance you expect to have versus the balance you actually have.

### Purpose

- Track cash inflows and outflows with a cash-first dashboard.
- Track loan principal, opening balances, repayments, and accrued interest.
- Keep loan posting and reporting simple enough to work from journal entries.
- Reduce invoice-centric clutter that does not help a cash/loan workflow.

### Highlights

- Loan Profiles with lender metadata, opening principal, opening accrued interest, and automatic liability and interest accounts.
- Loan Register and Loan Ledger reports with start dates, inferred interest, historical payment handling, and loan metadata on ledger rows.
- A daily simple-interest accrual model for loan interest tracking.
- An opening principal action that moves opening balances into the general ledger when needed.
- A monthly cash close workflow with opening, debit, credit, closing, expected, and difference columns.
- A refined Cash in Hand Summary, Cashflow view, and Loan Summary dashboard layout.
- Persisted report column preferences, date-sorted general ledger views, loan sorting, and orphan-row filtering.
- A mobile app baseline with quick add, transaction review, project switching, auth/session persistence, and sync tooling.
- Cloud sync foundations, including remote setup, invitations, reconciliation, and submission-aware sync behavior.

### Removed

- The dedicated loan cash receipt flow was dropped. Loan borrowing and repayment should now be recorded through Journal Entries and reflected in the loan reports.
- Unpaid-invoice blocks were removed from the default dashboard to keep the home screen focused on cash and loans.

### Guides

- [Cash and loan workflow guide](docs/cash-loan-user-guide.md)
- [Loan architecture notes](docs/loan-architecture.md)
- [Loan migration playbook](docs/loan-migration-playbook.md)
- [Loan test matrix](docs/loan-test-matrix.md)
- [Cash in hand requirements](docs/cash-in-hand-summary-requirements.md)

<details>
<summary>Screenshots</summary>
<br/>
<img  alt="Pos" src="https://github.com/user-attachments/assets/f75116b4-cf5f-45ee-9927-ba380fa56a46" />
    <br/><br/>
    <img  alt="General Ledger" src="https://github.com/user-attachments/assets/58d8bcdf-1576-4008-b010-7054fb64a12d" />
    <br/><br/>
    <img  alt="Profit and Loss" src="https://github.com/user-attachments/assets/11bd67d1-d808-496b-ac4d-ef68c18b9419" />

</details>

### Motivation

Vaulta addresses a market gap where small businesses face expensive, complex accounting tools. It offers an intuitive, open-source solution that combines simplicity with essential features, empowering businesses to manage finances effectively, even offline.

### Core Workflows

- **Cash-first dashboard**: Highlights cash in hand, cashflow, reconciliation status, and loan exposure instead of invoice-heavy bookkeeping.
- **Loan tracking**: Records loan principal, accrued interest, opening balances, and repayments through Loan Profiles and journal entries.
- **Loan reporting**: Uses Loan Register and Loan Ledger reports to surface what is owed, what was paid, and what remains outstanding.
- **Cash close and reconciliation**: Provides a monthly close workflow that compares opening, expected, and recorded balances.
- **Local-first operation**: Keeps the desktop app usable offline and syncs when the configured remote connection is available.
- **Mobile companion**: Early-stage support exists for quick entry, review, and sync-aware access.

Mobile support is intentionally conservative in scope right now. The desktop experience remains the primary surface, and future mobile development is still under consideration.

### Under the Hood

- **Vue.js** powers the desktop client UI.
- **Electron** packages the desktop app for Windows, macOS, and Linux.
- **Expo and React Native** power the mobile client.
- **SQLite** remains the local database for primary storage.
- **Supabase** supports the sync layer and mobile/desktop collaboration flows.

## Production Setup

Vaulta is not currently published through Homebrew or Flatpak. Installers are distributed through release artifacts when available, or you can build the app locally using the steps below.

## Development Setup

### Pre-requisites

To get the dev environment up and running you need to first set up Node.js `v20.18.1` and npm. For this, we suggest using
[nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

Next, you will need to install [yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable).

### Clone and Run

Once you are through the Pre-requisites, you can run the following commands to
setup Vaulta for development and building:

```bash
# clone the repository
git clone https://github.com/frappe/books.git

# change directory
cd books

# install dependencies
yarn
```

To run Vaulta in development mode (with hot reload, etc):

```bash
# start the electron app
yarn dev
```

**Note: First Boot**

When you run `yarn dev` electron will run immediately but the UI will take a
couple of seconds to render this because of how dev mode works. Each file is
individually served by the dev server. And there are many files that have to be
sent.

**Note: Debug Electron Main Process**

When in dev mode electron runs with the `--inspect` flag which allows an
external debugger to connect to port 5858. You can use chrome for this by
visiting `chrome://inspect` while Vaulta is running in dev mode.

See more [here](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process#external-debuggers).

#### Build

To build Vaulta and create an installer:

```bash
# start the electron app
yarn build
```

**Note: Build Target**
By default the above command will build for your computer's operating system and
architecture. To build for other environments (example: for linux from a windows
computer) check the _Building_ section at
[electron.build/cli](https://www.electron.build/cli).

So to build for linux you could use the `--linux` flag like so: `yarn build --linux`.

## Want to Just Try Out or Contribute?

If you want to contribute to Vaulta, please check our [Contribution Guidelines](https://github.com/frappe/books/blob/master/.github/CONTRIBUTING.md). There are many ways you can contribute even if you don't code:

1. If you find any issues, no matter how small (even typos), you can [raise an issue](https://github.com/frappe/books/issues/new) to inform us.
2. You can help us with language support by [contributing translations](https://github.com/frappe/books/wiki/Contributing-Translations).
3. If you're an ardent user you can tell us what you would like to see.
4. If you have accounting requirements, you can become an ardent user. 🙂

If you want to contribute code then you can fork this repo, make changes and raise a PR. ([see how to](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork))
