<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="font-semibold text-base dark:text-white">
        {{ t`Cash in Hand Detail` }}
      </p>
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-600 dark:text-gray-400"
          >{{ t`Select Month` }}:</label
        >
        <select
          v-model="selectedMonthIndex"
          class="
            text-sm
            px-3
            py-1
            border
            dark:border-gray-700
            rounded
            dark:bg-gray-800 dark:text-gray-100
          "
          @change="setDetailData"
        >
          <option v-if="!availableMonths.length" value="-1" disabled>
            No months available
          </option>
          <option
            v-for="(month, index) in availableMonths"
            :key="index"
            :value="index"
          >
            {{ month.period }}
          </option>
        </select>
      </div>
    </div>

    <div
      v-if="detailData"
      class="grid grid-cols-2 gap-4 p-4 border dark:border-gray-700 rounded"
    >
      <div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Opening Balance` }}
        </p>
        <p class="text-lg font-semibold dark:text-gray-50">
          {{ fyo.format(detailData.openingBalance, 'Currency') }}
        </p>
      </div>

      <div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Cash Received (Debits)` }}
        </p>
        <p class="text-lg font-semibold text-green-600 dark:text-green-400">
          {{ fyo.format(detailData.debits, 'Currency') }}
        </p>
      </div>

      <div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Cash Given (Credits)` }}
        </p>
        <p class="text-lg font-semibold text-red-600 dark:text-red-400">
          {{ fyo.format(detailData.credits, 'Currency') }}
        </p>
      </div>

      <div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Closing Balance` }}
        </p>
        <p class="text-lg font-semibold dark:text-gray-50">
          {{ fyo.format(detailData.closingBalance, 'Currency') }}
        </p>
      </div>

      <div class="col-span-2 pt-4 border-t dark:border-gray-600">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Net Change` }}
        </p>
        <p
          class="text-lg font-semibold"
          :class="
            detailData.netChange >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          "
        >
          {{ detailData.netChange >= 0 ? '+' : '' }}
          {{ fyo.format(detailData.netChange, 'Currency') }}
        </p>
      </div>
    </div>

    <div
      v-else
      class="
        flex
        items-center
        justify-center
        p-8
        text-gray-500
        dark:text-gray-400
      "
    >
      {{ t`Select a month to view details` }}
    </div>
  </div>
</template>

<script lang="ts">
import { fyo } from 'src/initFyo';
import { defineComponent } from 'vue';
import { CashInHandMonthDetail, CashInHandSummaryRow } from 'utils/db/types';

export default defineComponent({
  name: 'CashInHandDetail',
  props: {
    summaryData: {
      type: Array as () => CashInHandSummaryRow[],
      required: true,
    },
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      selectedMonthIndex: -1,
      detailData: null as CashInHandMonthDetail | null,
      fyo,
    };
  },
  computed: {
    availableMonths(): CashInHandSummaryRow[] {
      return this.summaryData;
    },
  },
  watch: {
    summaryData() {
      if (this.availableMonths.length > 0 && this.selectedMonthIndex === -1) {
        this.selectedMonthIndex = this.availableMonths.length - 1;
        void this.setDetailData();
      }
    },
  },
  mounted() {
    if (this.availableMonths.length > 0) {
      this.selectedMonthIndex = this.availableMonths.length - 1;
      void this.setDetailData();
    }
  },
  methods: {
    async setDetailData() {
      if (
        this.selectedMonthIndex < 0 ||
        this.selectedMonthIndex >= this.availableMonths.length
      ) {
        this.detailData = null;
        return;
      }

      const month = this.availableMonths[this.selectedMonthIndex];
      this.detailData = await fyo.db.getCashInHandMonthDetail(
        month.periodStart as string,
        month.periodEnd as string
      );
    },
  },
});
</script>
