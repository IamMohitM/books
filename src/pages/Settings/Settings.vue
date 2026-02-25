<template>
  <FormContainer>
    <template #header>
      <Button
        v-if="showCloudSyncPanel"
        class="me-2"
        @click="refreshCloudSyncStatus"
      >
        {{ t`Refresh Sync Status` }}
      </Button>
      <Button v-if="showCloudSyncPanel" class="me-2" @click="flushCloudSyncNow">
        {{ t`Flush Sync Now` }}
      </Button>
      <Button
        v-if="showCloudSyncPanel"
        class="me-2"
        @click="runReconciliationNow"
      >
        {{ t`Run Reconciliation` }}
      </Button>
      <Button v-if="canSave" type="primary" @click="sync">
        {{ t`Save` }}
      </Button>
    </template>
    <template #body>
      <FormHeader
        :form-title="tabLabels[activeTab] ?? ''"
        :form-sub-title="t`Settings`"
        class="
          sticky
          top-0
          bg-white
          dark:bg-gray-890
          border-b
          dark:border-gray-800
        "
      >
      </FormHeader>

      <!-- Section Container -->
      <div v-if="doc" class="overflow-auto custom-scroll custom-scroll-thumb1">
        <div
          v-if="showCloudSyncPanel"
          class="
            mx-4
            mt-4
            p-3
            rounded
            border
            dark:border-gray-800
            bg-gray-50
            dark:bg-gray-875
            text-sm
          "
        >
          <div class="font-semibold mb-2">{{ t`Cloud Sync Status` }}</div>
          <div class="text-xs text-gray-700 dark:text-gray-200 mb-3">
            {{
              t`Use this flow: 1) Save sync settings, 2) Flush desktop data to remote, 3) Run Reconciliation, 4) Open mobile app with the same company.`
            }}
          </div>
          <div
            v-if="syncSetupMissing.length"
            class="
              mb-3
              p-2
              rounded
              border border-red-200
              dark:border-red-800
              bg-red-50
              dark:bg-red-900/20
              text-xs text-red-700
              dark:text-red-200
            "
          >
            <div class="font-semibold">{{ t`Sync setup incomplete` }}</div>
            <div v-for="item in syncSetupMissing" :key="item">- {{ item }}</div>
          </div>
          <div class="flex flex-wrap gap-4 text-gray-700 dark:text-gray-200">
            <div>{{ t`Queued` }}: {{ cloudSyncStatus.queued }}</div>
            <div>{{ t`Processing` }}: {{ cloudSyncStatus.processing }}</div>
            <div>{{ t`Failed` }}: {{ cloudSyncStatus.failed }}</div>
            <div>{{ t`Sent` }}: {{ cloudSyncStatus.sent }}</div>
          </div>
          <div class="mt-2 text-xs text-gray-600 dark:text-gray-300">
            <div v-if="cloudSyncStatus.lastPushAt">
              {{ t`Last Push` }}: {{ cloudSyncStatus.lastPushAt }}
            </div>
            <div v-if="cloudSyncStatus.lastPullAt">
              {{ t`Last Pull` }}: {{ cloudSyncStatus.lastPullAt }}
            </div>
          </div>
          <div
            v-if="cloudSyncStatus.lastError"
            class="mt-2 text-xs text-red-600 dark:text-red-300 break-all"
          >
            {{ t`Last Error` }}: {{ cloudSyncStatus.lastError }}
          </div>
          <div class="mt-3 pt-3 border-t dark:border-gray-800 text-xs">
            <div class="font-semibold mb-1">{{ t`Reconciliation` }}</div>
            <div v-if="reconciliation.running">
              {{ t`Checking local vs remote snapshot...` }}
            </div>
            <div v-else-if="reconciliation.checkedAt">
              <div>
                {{ t`Last Checked` }}: {{ reconciliation.checkedAt }}
              </div>
              <div
                :class="
                  reconciliation.ok
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-yellow-700 dark:text-yellow-300'
                "
              >
                {{
                  reconciliation.ok
                    ? t`Snapshot matches.`
                    : t`Snapshot mismatch found.`
                }}
              </div>
              <div
                v-if="reconciliation.mismatches.length"
                class="mt-1 text-yellow-700 dark:text-yellow-300"
              >
                <div
                  v-for="item in reconciliation.mismatches"
                  :key="item"
                  class="break-all"
                >
                  - {{ item }}
                </div>
              </div>
            </div>
            <div
              v-else-if="cloudSyncStatus.lastReconciliationAt"
              class="text-gray-700 dark:text-gray-200"
            >
              <div>
                {{ t`Last Checked` }}:
                {{ cloudSyncStatus.lastReconciliationAt }}
              </div>
              <div>
                {{ t`Last Status` }}:
                {{ cloudSyncStatus.lastReconciliationStatus }}
              </div>
              <div
                v-if="cloudSyncStatus.lastReconciliationSummary"
                class="break-all"
              >
                {{ cloudSyncStatus.lastReconciliationSummary }}
              </div>
            </div>
          </div>
        </div>

        <CommonFormSection
          v-for="([name, fields], idx) in activeGroup.entries()"
          :key="name + idx"
          ref="section"
          class="p-4"
          :class="
            idx !== 0 && activeGroup.size > 1
              ? 'border-t dark:border-gray-800'
              : ''
          "
          :show-title="activeGroup.size > 1 && name !== t`Default`"
          :title="name"
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @value-change="onValueChange"
        />
      </div>

      <!-- Tab Bar -->
      <div
        v-if="groupedFields && groupedFields.size > 1"
        class="
          mt-auto
          px-4
          pb-4
          flex
          gap-8
          border-t
          dark:border-gray-800
          flex-shrink-0
          sticky
          bottom-0
          bg-white
          dark:bg-gray-890
        "
      >
        <div
          v-for="key of groupedFields.keys()"
          :key="key"
          class="text-sm cursor-pointer"
          :class="
            key === activeTab
              ? 'text-gray-900 dark:text-gray-25 font-semibold border-t-2 border-gray-800 dark:border-gray-100'
              : 'text-gray-700 dark:text-gray-200 '
          "
          :style="{
            paddingTop: key === activeTab ? 'calc(1rem - 2px)' : '1rem',
          }"
          @click="activeTab = key"
        >
          {{ tabLabels[key] }}
        </div>
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getErrorMessage } from 'src/utils';
import { evaluateHidden } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog, showToast } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { UIGroupedFields } from 'src/utils/types';
import {
  flushCloudSyncOutbox,
  runCloudSyncReconciliation,
  startCloudSyncWorker,
  stopCloudSyncWorker,
} from 'src/utils/cloudSyncWorker';
import { computed, defineComponent, inject } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';

const COMPONENT_NAME = 'Settings';

export default defineComponent({
  components: { FormContainer, Button, FormHeader, CommonFormSection },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  setup() {
    return {
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      errors: {},
      activeTab: ModelNameEnum.AccountingSettings,
      groupedFields: null,
      cloudSyncStatus: {
        queued: 0,
        processing: 0,
        failed: 0,
        sent: 0,
        lastError: '',
        lastPushAt: '',
        lastPullAt: '',
        lastReconciliationAt: '',
        lastReconciliationStatus: 'unknown',
        lastReconciliationSummary: '',
      },
      reconciliation: {
        running: false,
        checkedAt: '',
        ok: null as null | boolean,
        mismatches: [] as string[],
      },
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      cloudSyncStatus: {
        queued: number;
        processing: number;
        failed: number;
        sent: number;
        lastError: string;
        lastPushAt: string;
        lastPullAt: string;
        lastReconciliationAt: string;
        lastReconciliationStatus: string;
        lastReconciliationSummary: string;
      };
      reconciliation: {
        running: boolean;
        checkedAt: string;
        ok: null | boolean;
        mismatches: string[];
      };
    };
  },
  computed: {
    canSave() {
      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.ERPNextSyncSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ].some((s) => this.fyo.singles[s]?.canSave);
    },
    doc(): Doc | null {
      const doc = this.fyo.singles[this.activeTab];
      if (!doc) {
        return null;
      }

      return doc;
    },
    tabLabels(): Record<string, string> {
      return {
        [ModelNameEnum.AccountingSettings]: this.t`General`,
        [ModelNameEnum.PrintSettings]: this.t`Print`,
        [ModelNameEnum.InventorySettings]: this.t`Inventory`,
        [ModelNameEnum.Defaults]: this.t`Defaults`,
        [ModelNameEnum.POSSettings]: this.t`POS Settings`,
        [ModelNameEnum.ERPNextSyncSettings]: this.t`ERPNext Sync`,
        [ModelNameEnum.SystemSettings]: this.t`System`,
      };
    },
    schemas(): Schema[] {
      const enableInventory =
        !!this.fyo.singles.AccountingSettings?.enableInventory;
      const enablePOS = !!this.fyo.singles.InventorySettings?.enablePointOfSale;
      const enableERPNextSync =
        !!this.fyo.singles.AccountingSettings?.enableERPNextSync;

      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.ERPNextSyncSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ]
        .filter((s) => {
          if (s === ModelNameEnum.InventorySettings && !enableInventory) {
            return false;
          }

          if (s === ModelNameEnum.POSSettings && !enablePOS) {
            return false;
          }

          if (s === ModelNameEnum.ERPNextSyncSettings && !enableERPNextSync) {
            return false;
          }

          return true;
        })
        .map((s) => this.fyo.schemaMap[s]!);
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        throw new ValidationError(
          `Tab group ${this.activeTab} has no value set`
        );
      }

      return group;
    },
    showCloudSyncPanel(): boolean {
      return this.activeTab === ModelNameEnum.SystemSettings;
    },
    syncSetupMissing(): string[] {
      const ss = this.fyo.singles.SystemSettings;
      if (!ss?.syncEnabled || ss.syncMode === 'off') {
        return [];
      }

      const missing: string[] = [];
      if (!ss.syncProjectId && !ss.syncApiUrl) {
        missing.push(
          this.t`Sync Project ID is required (or provide Sync API URL Override).`
        );
      }
      if (!ss.syncCompanyId) {
        missing.push(this.t`Sync Company ID is required.`);
      }
      if (!ss.syncAuthToken) {
        missing.push(this.t`Sync Auth Token is required.`);
      }

      return missing;
    },
  },
  mounted() {
    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.settings = this;
    }

    this.update();
  },
  activated(): void {
    const tab = this.$route.query.tab;
    if (typeof tab === 'string' && this.tabLabels[tab]) {
      this.activeTab = tab;
    }

    docsPathRef.value = docsPathMap.Settings ?? '';
    void this.refreshCloudSyncStatus();
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['KeyS'], async () => {
      if (!this.canSave) {
        return;
      }

      await this.sync();
    });
  },
  async deactivated(): Promise<void> {
    docsPathRef.value = '';
    this.shortcuts?.delete(COMPONENT_NAME);
    if (!this.canSave) {
      return;
    }
    await this.reset();
  },
  methods: {
    async reset() {
      const resetableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.dirty) as Doc[];

      for (const doc of resetableDocs) {
        await doc.load();
      }

      this.update();
    },
    async sync(): Promise<void> {
      const syncableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.canSave) as Doc[];

      for (const doc of syncableDocs) {
        await this.syncDoc(doc);
      }

      if (this.fyo.singles.SystemSettings?.syncEnabled) {
        startCloudSyncWorker(this.fyo);
      } else {
        stopCloudSyncWorker();
      }

      await this.refreshCloudSyncStatus();
      this.update();
      await showDialog({
        title: this.t`Reload Frappe Cash Books?`,
        detail: this.t`Changes made to settings will be visible on reload.`,
        type: 'info',
        buttons: [
          {
            label: this.t`Yes`,
            isPrimary: true,
            action: ipc.reloadWindow.bind(ipc),
          },
          {
            label: this.t`No`,
            action: () => null,
            isEscape: true,
          },
        ],
      });
    },
    async syncDoc(doc: Doc): Promise<void> {
      try {
        await doc.sync();
        this.updateGroupedFields();
      } catch (error) {
        await handleErrorWithDialog(error, doc);
      }
    },
    async onValueChange(field: Field, value: DocValue): Promise<void> {
      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc?.set(fieldname, value ?? '');
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc ?? undefined);
      }

      this.update();
    },
    update(): void {
      this.updateGroupedFields();
    },
    async refreshCloudSyncStatus(): Promise<void> {
      const [queued, processing, failed, sent] = await Promise.all([
        this.fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
          filters: { status: 'queued' },
        }),
        this.fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
          filters: { status: 'processing' },
        }),
        this.fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
          filters: { status: 'failed' },
        }),
        this.fyo.db.count(ModelNameEnum.CloudSyncOutbox, {
          filters: { status: 'sent' },
        }),
      ]);

      const failedRows = await this.fyo.db.getAll(
        ModelNameEnum.CloudSyncOutbox,
        {
          fields: ['errorMessage', 'modified'],
          filters: { status: 'failed' },
          orderBy: 'modified',
        }
      );
      const lastFailed = failedRows[failedRows.length - 1];
      const syncState = this.fyo.singles.CloudSyncState as
        | {
            lastError?: string;
            lastPushAt?: string;
            lastPullAt?: string;
            lastReconciliationAt?: string;
            lastReconciliationStatus?: string;
            lastReconciliationSummary?: string;
          }
        | undefined;
      const lastError =
        (lastFailed?.errorMessage as string) ?? syncState?.lastError ?? '';

      this.cloudSyncStatus = {
        queued,
        processing,
        failed,
        sent,
        lastError,
        lastPushAt: syncState?.lastPushAt ?? '',
        lastPullAt: syncState?.lastPullAt ?? '',
        lastReconciliationAt: syncState?.lastReconciliationAt ?? '',
        lastReconciliationStatus: syncState?.lastReconciliationStatus ?? 'unknown',
        lastReconciliationSummary: syncState?.lastReconciliationSummary ?? '',
      };
    },
    async flushCloudSyncNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      await flushCloudSyncOutbox(this.fyo);
      await this.refreshCloudSyncStatus();
      showToast({
        type: 'success',
        message: this.t`Cloud sync flush finished.`,
      });
    },
    async runReconciliationNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      this.reconciliation.running = true;
      try {
        const result = await runCloudSyncReconciliation(this.fyo);
        this.reconciliation = {
          running: false,
          checkedAt: new Date().toLocaleString(),
          ok: result.ok,
          mismatches: result.mismatches,
        };

        showToast({
          type: result.ok ? 'success' : 'warning',
          message: result.ok
            ? this.t`Reconciliation passed. Local and remote snapshot match.`
            : this.t`Reconciliation found differences. Review mismatch details.`,
        });
        await this.refreshCloudSyncStatus();
      } catch (error) {
        this.reconciliation = {
          running: false,
          checkedAt: new Date().toLocaleString(),
          ok: false,
          mismatches: [getErrorMessage(error as Error)],
        };

        showToast({
          type: 'error',
          message: this.t`Reconciliation failed. Check sync configuration and network.`,
        });
        await this.refreshCloudSyncStatus();
      }
    },
    updateGroupedFields(): void {
      const grouped: UIGroupedFields = new Map();
      const fields: Field[] = this.schemas.map((s) => s.fields).flat();

      for (const field of fields) {
        const schemaName = field.schemaName!;
        if (!grouped.has(schemaName)) {
          grouped.set(schemaName, new Map());
        }

        const tabbed = grouped.get(schemaName)!;
        const section = field.section ?? this.t`Miscellaneous`;
        if (!tabbed.has(section)) {
          tabbed.set(section, []);
        }

        if (field.meta) {
          continue;
        }

        const doc = this.fyo.singles[schemaName];
        if (evaluateHidden(field, doc)) {
          continue;
        }

        tabbed.get(section)!.push(field);
      }

      this.groupedFields = grouped;
    },
  },
});
</script>
