<template>
  <div class="flex flex-col gap-4 p-4 border dark:border-gray-700 rounded">
    <div class="flex items-center justify-between">
      <p class="font-semibold text-base dark:text-white">
        {{ t`Reconcile Cash` }}
      </p>
      <button
        v-if="showForm"
        class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        @click="showForm = false"
      >
        ✕
      </button>
    </div>

    <div v-if="!showForm" class="text-center py-4">
      <button
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
        @click="openForm"
      >
        {{ t`Start Reconciliation` }}
      </button>
    </div>

    <div v-else class="grid grid-cols-2 gap-4">
      <!-- Period -->
      <div>
        <label class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Period` }}
        </label>
        <select
          v-model="selectedMonthIndex"
          class="w-full text-sm px-3 py-2 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
          @change="loadPeriodData"
        >
          <option
            v-if="!availableMonths.length"
            value="-1"
            disabled
          >
            {{ t`No months available` }}
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

      <!-- Expected Balance (Read-only) -->
      <div>
        <label class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Expected Balance` }}
        </label>
        <div class="text-lg font-semibold dark:text-gray-50">
          {{ fyo.format(expectedBalance, 'Currency') }}
        </div>
      </div>

      <!-- Physical Count (Editable) -->
      <div>
        <label class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Physical Count` }}
        </label>
        <input
          v-model.number="physicalCount"
          type="number"
          step="0.01"
          class="w-full text-sm px-3 py-2 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
          @input="calculateVariance"
        />
      </div>

      <!-- Variance (Read-only) -->
      <div>
        <label class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Variance` }}
        </label>
        <div
          class="text-lg font-semibold"
          :class="
            variance >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          "
        >
          {{ fyo.format(variance, 'Currency') }}
        </div>
      </div>

      <!-- Variance Account Selector -->
      <div class="col-span-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Variance Account` }}
        </label>
        <input
          v-model="varianceAccount"
          type="text"
          placeholder="Select account..."
          class="w-full text-sm px-3 py-2 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
          @focus="showAccountList = true"
        />
        <div
          v-if="showAccountList"
          class="mt-2 border dark:border-gray-700 rounded dark:bg-gray-800 max-h-48 overflow-y-auto"
        >
          <div
            v-for="account in availableAccounts"
            :key="account.name"
            class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm dark:text-gray-100"
            @click="selectAccount(account)"
          >
            {{ account.name }}
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="col-span-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">
          {{ t`Notes` }}
        </label>
        <textarea
          v-model="notes"
          class="w-full text-sm px-3 py-2 border dark:border-gray-700 rounded dark:bg-gray-800 dark:text-gray-100"
          rows="2"
          placeholder="Add any notes..."
        ></textarea>
      </div>

      <!-- Action Buttons -->
      <div class="col-span-2 flex gap-2 justify-end">
        <button
          class="px-4 py-2 text-gray-700 dark:text-gray-300 border dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          @click="showForm = false"
        >
          {{ t`Cancel` }}
        </button>
        <button
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
          @click="submitReconciliation"
        >
          {{ t`Submit` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { fyo } from 'src/initFyo';
import { defineComponent } from 'vue';
import { CashReconciliationRow } from 'utils/db/types';

interface Account {
  name: string;
  accountType: string;
}

export default defineComponent({
  name: 'CashReconciliationForm',
  props: {
    summaryData: {
      type: Array as () => CashReconciliationRow[],
      required: true,
    },
    darkMode: { type: Boolean, default: false },
  },
  data() {
    return {
      fyo,
      showForm: false,
      selectedMonthIndex: -1,
      expectedBalance: 0,
      physicalCount: 0,
      variance: 0,
      varianceAccount: '',
      notes: '',
      showAccountList: false,
      availableAccounts: [] as Account[],
    };
  },
  computed: {
    availableMonths(): CashReconciliationRow[] {
      return this.summaryData;
    },
  },
  watch: {
    summaryData() {
      if (this.availableMonths.length > 0 && this.selectedMonthIndex === -1) {
        this.selectedMonthIndex = this.availableMonths.length - 1;
      }
    },
  },
  mounted() {
    this.loadAccounts();
  },
  methods: {
    openForm() {
      this.showForm = true;
      if (this.availableMonths.length > 0 && this.selectedMonthIndex === -1) {
        this.selectedMonthIndex = this.availableMonths.length - 1;
        this.loadPeriodData();
      }
    },
    loadPeriodData() {
      if (
        this.selectedMonthIndex < 0 ||
        this.selectedMonthIndex >= this.availableMonths.length
      ) {
        return;
      }

      const month = this.availableMonths[this.selectedMonthIndex];
      this.expectedBalance = month.expectedBalance;
      this.physicalCount = month.physicalCount ?? 0;
      this.calculateVariance();
      this.varianceAccount = '';
      this.notes = '';
    },
    calculateVariance() {
      this.variance = this.expectedBalance - this.physicalCount;
    },
    async loadAccounts() {
      try {
        const accounts = (await fyo.db.getAll('Account', {
          fields: ['name', 'accountType'],
        })) as Account[];
        this.availableAccounts = accounts;
      } catch (error) {
        console.error('Error loading accounts:', error);
      }
    },
    selectAccount(account: Account) {
      this.varianceAccount = account.name;
      this.showAccountList = false;
    },
    async submitReconciliation() {
      if (!this.varianceAccount) {
        alert(this.$t`Please select a variance account`);
        return;
      }

      if (
        this.selectedMonthIndex < 0 ||
        this.selectedMonthIndex >= this.availableMonths.length
      ) {
        alert(this.$t`Please select a period`);
        return;
      }

      const month = this.availableMonths[this.selectedMonthIndex];

      try {
        // Create CashCountRecord
        const record = await fyo.db.insert('CashCountRecord', {
          period: month.period,
          periodStart: month.periodStart,
          periodEnd: month.periodEnd,
          expectedBalance: this.expectedBalance,
          physicalCount: this.physicalCount,
          variance: this.variance,
          varianceAccount: this.varianceAccount,
          notes: this.notes,
        });

        // Submit the record
        const doc = fyo.getEntity('CashCountRecord', record.name as string);
        if (doc) {
          await doc.submit();
        }

        alert(this.$t`Reconciliation submitted successfully`);
        this.showForm = false;
        this.$emit('reconciliation-submitted', record);
      } catch (error) {
        console.error('Error submitting reconciliation:', error);
        alert(this.$t`Error submitting reconciliation: ${String(error)}`);
      }
    },
  },
});
</script>
