<template>
  <div class="h-screen" style="width: var(--w-desk)">
    <PageHeader :title="t`Dashboard`">
      <div
        class="
          border
          dark:border-gray-900
          rounded
          bg-gray-50
          dark:bg-gray-890
          focus-within:bg-gray-100
          dark:focus-within:bg-gray-900
          flex
          items-center
        "
      >
        <PeriodSelector
          class="px-3"
          :value="period"
          :options="['This Year', 'This Quarter', 'This Month', 'YTD']"
          @change="(value) => (period = value)"
        />
      </div>
    </PageHeader>

    <div
      class="no-scrollbar overflow-auto dark:bg-gray-875"
      style="height: calc(100vh - var(--h-row-largest) - 1px)"
    >
      <div style="min-width: var(--w-desk-fixed)" class="overflow-auto">
        <div class="flex gap-4 p-4">
          <div class="flex-1 flex flex-col gap-4">
            <CashInHand />
            <CashInHandDetail
              ref="cashInHandDetail"
              :summary-data="summaryData"
              :dark-mode="darkMode"
            />
          </div>
          <div class="flex-1">
            <CashInHandSummary
              ref="cashInHandSummary"
              :dark-mode="darkMode"
              @data-updated="summaryData = $event"
            />
          </div>
        </div>
        <hr class="dark:border-gray-800" />
        <Cashflow
          class="p-4"
          :common-period="period"
          :dark-mode="darkMode"
          @period-change="handlePeriodChange"
        />
        <hr class="dark:border-gray-800" />
        <div class="flex w-full">
          <UnpaidInvoices
            :schema-name="'SalesInvoice'"
            :common-period="period"
            :dark-mode="darkMode"
            class="border-e dark:border-gray-800"
            @period-change="handlePeriodChange"
          />
          <UnpaidInvoices
            :schema-name="'PurchaseInvoice'"
            :common-period="period"
            :dark-mode="darkMode"
            @period-change="handlePeriodChange"
          />
        </div>
        <hr class="dark:border-gray-800" />
        <div class="flex">
          <ProfitAndLoss
            class="w-full p-4 border-e dark:border-gray-800"
            :common-period="period"
            :dark-mode="darkMode"
            @period-change="handlePeriodChange"
          />
          <Expenses
            class="w-full p-4"
            :common-period="period"
            :dark-mode="darkMode"
            @period-change="handlePeriodChange"
          />
        </div>
        <hr class="dark:border-gray-800" />
        <LoanSummary
          class="w-full p-4"
          :common-period="period"
          :dark-mode="darkMode"
          @period-change="handlePeriodChange"
        />
        <hr class="dark:border-gray-800" />
      </div>
    </div>
  </div>
</template>

<script>
import PageHeader from 'src/components/PageHeader.vue';
import UnpaidInvoices from './UnpaidInvoices.vue';
import CashInHand from './CashInHand.vue';
import CashInHandSummary from './CashInHandSummary.vue';
import CashInHandDetail from './CashInHandDetail.vue';
import Cashflow from './Cashflow.vue';
import Expenses from './Expenses.vue';
import LoanSummary from './LoanSummary.vue';
import PeriodSelector from './PeriodSelector.vue';
import ProfitAndLoss from './ProfitAndLoss.vue';
import { docsPathRef } from 'src/utils/refs';

export default {
  name: 'Dashboard',
  components: {
    PageHeader,
    CashInHand,
    CashInHandSummary,
    CashInHandDetail,
    Cashflow,
    ProfitAndLoss,
    Expenses,
    LoanSummary,
    PeriodSelector,
    UnpaidInvoices,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      period: 'This Year',
      summaryData: [],
    };
  },
  activated() {
    docsPathRef.value = 'books/dashboard';
  },
  deactivated() {
    docsPathRef.value = '';
  },
  methods: {
    handlePeriodChange(period) {
      if (period === this.period) {
        return;
      }

      this.period = '';
    },
  },
};
</script>
