<template>
  <div class="flex flex-col h-full">
    <SectionHeader>
      <template #title>{{ t`Loans` }}</template>
      <template #action>
        <PeriodSelector
          :value="period"
          :options="periodOptions"
          @change="(value) => (period = value)"
        />
      </template>
    </SectionHeader>

    <div v-if="hasData" class="mt-4 flex flex-col gap-6">
      <!-- Loans Taken (Liabilities) -->
      <div v-if="takenSummary.hasData" class="flex flex-col">
        <div class="flex items-center gap-2 mb-3">
          <span
            :class="
              darkMode
                ? 'text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border text-white bg-amber-600/90 border-amber-500/60'
                : 'text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border text-amber-600 bg-amber-50 border-amber-200/50'
            "
          >
            {{ t`Liabilities` }}
          </span>
          <h4
            :class="
              darkMode
                ? 'text-sm font-semibold text-gray-300'
                : 'text-sm font-semibold text-gray-700'
            "
          >
            {{ t`Loans Taken` }}
          </h4>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div
            :class="
              darkMode
                ? 'p-4 rounded-xl border border-gray-800 bg-gray-900/60 transition-all duration-300 hover:shadow-md hover:border-amber-900/40'
                : 'p-4 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-md hover:border-amber-200'
            "
          >
            <p
              :class="
                darkMode
                  ? 'text-xs font-medium text-gray-400'
                  : 'text-xs font-medium text-gray-500'
              "
            >
              {{ t`Principal Outstanding` }}
            </p>
            <p
              :class="
                darkMode
                  ? 'text-lg font-bold mt-1 text-gray-50'
                  : 'text-lg font-bold mt-1 text-gray-900'
              "
            >
              {{ fyo.format(takenSummary.principalOutstanding, 'Currency') }}
            </p>
          </div>
          <div
            :class="
              darkMode
                ? 'p-4 rounded-xl border border-gray-800 bg-gray-900/60 transition-all duration-300 hover:shadow-md hover:border-amber-900/40'
                : 'p-4 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-md hover:border-amber-200'
            "
          >
            <p
              :class="
                darkMode
                  ? 'text-xs font-medium text-gray-400'
                  : 'text-xs font-medium text-gray-500'
              "
            >
              {{ t`Interest Owed` }}
            </p>
            <p
              :class="
                darkMode
                  ? 'text-lg font-bold mt-1 text-gray-50'
                  : 'text-lg font-bold mt-1 text-gray-900'
              "
            >
              {{ fyo.format(takenSummary.interestOwed, 'Currency') }}
            </p>
          </div>
          <div
            :class="
              darkMode
                ? 'p-4 rounded-xl border border-gray-800 bg-gray-900/60 transition-all duration-300 hover:shadow-md hover:border-amber-900/40'
                : 'p-4 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-md hover:border-amber-200'
            "
          >
            <p
              :class="
                darkMode
                  ? 'text-xs font-medium text-gray-400'
                  : 'text-xs font-medium text-gray-500'
              "
            >
              {{ t`Total Due` }}
            </p>
            <p
              :class="
                darkMode
                  ? 'text-lg font-bold mt-1 text-gray-50'
                  : 'text-lg font-bold mt-1 text-gray-900'
              "
            >
              {{ fyo.format(takenSummary.totalDue, 'Currency') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Loans Provided (Assets) -->
      <div v-if="providedSummary.hasData" class="flex flex-col">
        <div class="flex items-center gap-2 mb-3">
          <span
            :class="
              darkMode
                ? 'text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border text-white bg-emerald-600/90 border-emerald-500/60'
                : 'text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border text-emerald-600 bg-emerald-50 border-emerald-200/50'
            "
          >
            {{ t`Assets` }}
          </span>
          <h4
            :class="
              darkMode
                ? 'text-sm font-semibold text-gray-300'
                : 'text-sm font-semibold text-gray-700'
            "
          >
            {{ t`Loans Provided` }}
          </h4>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div
            :class="
              darkMode
                ? 'p-4 rounded-xl border border-gray-800 bg-gray-900/60 transition-all duration-300 hover:shadow-md hover:border-emerald-900/40'
                : 'p-4 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-md hover:border-emerald-200'
            "
          >
            <p
              :class="
                darkMode
                  ? 'text-xs font-medium text-gray-400'
                  : 'text-xs font-medium text-gray-500'
              "
            >
              {{ t`Principal Outstanding` }}
            </p>
            <p
              :class="
                darkMode
                  ? 'text-lg font-bold mt-1 text-gray-50'
                  : 'text-lg font-bold mt-1 text-gray-900'
              "
            >
              {{ fyo.format(providedSummary.principalOutstanding, 'Currency') }}
            </p>
          </div>
          <div
            :class="
              darkMode
                ? 'p-4 rounded-xl border border-gray-800 bg-gray-900/60 transition-all duration-300 hover:shadow-md hover:border-emerald-900/40'
                : 'p-4 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-md hover:border-emerald-200'
            "
          >
            <p
              :class="
                darkMode
                  ? 'text-xs font-medium text-gray-400'
                  : 'text-xs font-medium text-gray-500'
              "
            >
              {{ t`Interest Receivable` }}
            </p>
            <p
              :class="
                darkMode
                  ? 'text-lg font-bold mt-1 text-gray-50'
                  : 'text-lg font-bold mt-1 text-gray-900'
              "
            >
              {{ fyo.format(providedSummary.interestOwed, 'Currency') }}
            </p>
          </div>
          <div
            :class="
              darkMode
                ? 'p-4 rounded-xl border border-gray-800 bg-gray-900/60 transition-all duration-300 hover:shadow-md hover:border-emerald-900/40'
                : 'p-4 rounded-xl border border-gray-100 bg-white transition-all duration-300 hover:shadow-md hover:border-emerald-200'
            "
          >
            <p
              :class="
                darkMode
                  ? 'text-xs font-medium text-gray-400'
                  : 'text-xs font-medium text-gray-500'
              "
            >
              {{ t`Total Receivable` }}
            </p>
            <p
              :class="
                darkMode
                  ? 'text-lg font-bold mt-1 text-gray-50'
                  : 'text-lg font-bold mt-1 text-gray-900'
              "
            >
              {{ fyo.format(providedSummary.totalDue, 'Currency') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 w-full h-full flex-center my-20">
      <span class="text-base text-gray-600 dark:text-gray-500">
        {{ t`No loans yet` }}
      </span>
    </div>
  </div>
</template>
<script lang="ts">
import { DateTime } from 'luxon';
import { fyo } from 'src/initFyo';
import { getDatesAndPeriodList } from 'src/utils/misc';
import { defineComponent } from 'vue';
import DashboardChartBase from './BaseDashboardChart.vue';
import PeriodSelector from './PeriodSelector.vue';
import SectionHeader from './SectionHeader.vue';

export default defineComponent({
  name: 'LoanSummary',
  components: {
    PeriodSelector,
    SectionHeader,
  },
  extends: DashboardChartBase,
  props: {
    darkMode: { type: Boolean, default: false },
  },
  data: () => ({
    hasData: false,
    takenSummary: {
      principalOutstanding: 0,
      interestOwed: 0,
      totalDue: 0,
      hasData: false,
    },
    providedSummary: {
      principalOutstanding: 0,
      interestOwed: 0,
      totalDue: 0,
      hasData: false,
    },
    periodOptions: ['This Year', 'This Quarter', 'YTD'],
  }),
  activated() {
    this.setData();
  },
  methods: {
    async setData() {
      const { toDate } = getDatesAndPeriodList(this.period);
      const asOfDate = DateTime.fromISO(toDate.toISODate() as string)
        .minus({ days: 1 })
        .toISODate();

      const snapshots = await fyo.db.getLoanPortfolioSnapshot(
        asOfDate as string
      );

      const takenLoans = snapshots.filter(
        (row) => (row as any).loanType !== 'Provided'
      );
      const providedLoans = snapshots.filter(
        (row) => (row as any).loanType === 'Provided'
      );

      this.takenSummary = takenLoans.reduce(
        (acc, row) => {
          acc.principalOutstanding += row.principalOutstanding;
          acc.interestOwed += row.interestOwed;
          acc.totalDue += row.totalDue;
          return acc;
        },
        {
          principalOutstanding: 0,
          interestOwed: 0,
          totalDue: 0,
          hasData: takenLoans.length > 0,
        }
      );

      this.providedSummary = providedLoans.reduce(
        (acc, row) => {
          acc.principalOutstanding += row.principalOutstanding;
          acc.interestOwed += row.interestOwed;
          acc.totalDue += row.totalDue;
          return acc;
        },
        {
          principalOutstanding: 0,
          interestOwed: 0,
          totalDue: 0,
          hasData: providedLoans.length > 0,
        }
      );

      this.hasData = snapshots.length > 0;
    },
  },
});
</script>
