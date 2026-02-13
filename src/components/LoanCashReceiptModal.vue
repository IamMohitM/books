<template>
  <Modal class="w-96 p-4" :open-modal="openModal" @closemodal="close">
    <div class="flex flex-col gap-4">
      <div>
        <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {{ t`Record Loan Cash Receipt` }}
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ t`Loan` }}: {{ loanProfileName }}
        </p>
      </div>

      <Date
        :df="dateField"
        :show-label="true"
        :border="true"
        :value="date"
        @change="onDateChange"
      />

      <Currency
        :df="amountField"
        :show-label="true"
        :border="true"
        :value="amount"
        @change="(value:number) => (amount = value)"
      />

      <Select
        :df="cashAccountField"
        :show-label="true"
        :border="true"
        :value="cashAccount"
        @change="(value:string) => (cashAccount = value)"
      />

      <div class="flex justify-end gap-2 pt-2">
        <Button @click="close">
          {{ t`Cancel` }}
        </Button>
        <Button type="primary" :disabled="!isValid" @click="submit">
          {{ t`Create Entry` }}
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script lang="ts">
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { fyo } from 'src/initFyo';
import Button from 'src/components/Button.vue';
import Modal from 'src/components/Modal.vue';
import Currency from 'src/components/Controls/Currency.vue';
import Date from 'src/components/Controls/Date.vue';
import Select from 'src/components/Controls/Select.vue';
import { defineComponent } from 'vue';

type AccountOption = { label: string; value: string; accountType?: string };

export default defineComponent({
  name: 'LoanCashReceiptModal',
  components: { Modal, Button, Currency, Date, Select },
  props: {
    openModal: { type: Boolean, default: false },
    loanProfileName: { type: String, required: true },
    defaultDate: { type: String, default: '' },
    defaultAmount: { type: Number, default: 0 },
  },
  emits: ['close', 'submit'],
  data() {
    return {
      date: this.defaultDate || DateTime.now().toISODate(),
      amount: this.defaultAmount ?? 0,
      cashAccount: '',
      cashAccounts: [] as AccountOption[],
      loadingAccounts: false,
    };
  },
  computed: {
    isValid(): boolean {
      return !!this.cashAccount && Number(this.amount) > 0 && !!this.date;
    },
    dateField() {
      return { label: this.t`Date`, fieldtype: 'Date', fieldname: 'date' };
    },
    amountField() {
      return {
        label: this.t`Amount`,
        fieldtype: 'Currency',
        fieldname: 'amount',
      };
    },
    cashAccountField() {
      return {
        label: this.t`Cash/Bank Account`,
        fieldtype: 'Select',
        fieldname: 'cashAccount',
        options: this.cashAccounts,
        placeholder: this.t`Select Account`,
      };
    },
  },
  watch: {
    openModal(value: boolean) {
      if (value) {
        this.initialize();
      }
    },
    defaultDate(value: string) {
      if (value) {
        this.date = value;
      }
    },
    defaultAmount(value: number) {
      this.amount = value ?? 0;
    },
  },
  methods: {
    async initialize() {
      if (!this.cashAccounts.length) {
        await this.fetchCashAccounts();
      }

      if (!this.cashAccount && this.cashAccounts.length === 1) {
        this.cashAccount = this.cashAccounts[0].value;
      }
    },
    async fetchCashAccounts() {
      this.loadingAccounts = true;
      try {
        const accounts = (await fyo.db.getAll(ModelNameEnum.Account, {
          fields: ['name', 'accountType'],
          filters: {
            accountType: ['in', ['Cash', 'Bank']],
            isGroup: false,
          },
        })) as { name: string; accountType?: string }[];

        this.cashAccounts = accounts
          .map((account) => ({
            label: account.name,
            value: account.name,
            accountType: account.accountType,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      } finally {
        this.loadingAccounts = false;
      }
    },
    onDateChange(value: Date | null) {
      if (!value) {
        this.date = '';
        return;
      }

      this.date = DateTime.fromJSDate(value).toISODate();
    },
    close() {
      this.$emit('close');
    },
    submit() {
      if (!this.isValid) {
        return;
      }

      this.$emit('submit', {
        date: this.date,
        amount: Number(this.amount),
        cashAccount: this.cashAccount,
      });
    },
  },
});
</script>
