<template>
  <FormContainer>
    <template #header>
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
              t`Use this flow: 1) Save sync settings, 2) Click Sync Now for first-time enrollment and regular sync, 3) Open mobile app with the same company.`
            }}
          </div>
          <div class="mb-3 flex flex-wrap gap-2">
            <Button class="text-xs" @click="syncNow">
              {{ t`Sync Now` }}
            </Button>
            <Button class="text-xs" @click="initializeRemoteNow">
              {{ t`Initialize Remote (Admin)` }}
            </Button>
            <Button
              v-if="cloudSyncStatus.enrollmentStatus !== 'paused'"
              class="text-xs"
              @click="pauseSyncNow"
            >
              {{ t`Pause Sync` }}
            </Button>
            <Button
              v-if="cloudSyncStatus.enrollmentStatus === 'paused'"
              class="text-xs"
              @click="resumeSyncNow"
            >
              {{ t`Resume Sync` }}
            </Button>
            <Button class="text-xs" @click="refreshCloudSyncStatus">
              {{ t`Refresh Sync Status` }}
            </Button>
          </div>
          <div
            v-if="remoteInit.open"
            class="mb-3 p-2 rounded border dark:border-gray-800 text-xs"
          >
            <div class="mb-2 text-gray-700 dark:text-gray-200">
              {{
                t`Enter one-time Supabase Admin Access Token to initialize remote schema. This token is not saved.`
              }}
            </div>
            <div class="flex flex-wrap gap-2 items-center">
              <input
                v-model="remoteInit.token"
                type="password"
                class="
                  px-2
                  py-1
                  border
                  rounded
                  text-sm
                  bg-white
                  dark:bg-gray-890 dark:border-gray-700
                "
                :placeholder="t`Admin Access Token`"
              />
              <Button
                class="text-xs"
                :disabled="remoteInit.running"
                @click="executeRemoteInitNow"
              >
                {{ remoteInit.running ? t`Initializing...` : t`Initialize` }}
              </Button>
              <Button class="text-xs" @click="cancelRemoteInitNow">
                {{ t`Cancel` }}
              </Button>
            </div>
          </div>
          <div
            v-if="showDevClearRemoteButton"
            class="mb-3 flex flex-wrap gap-2"
          >
            <Button class="text-xs" @click="flushCloudSyncNow">
              {{ t`Flush Sync Now` }}
            </Button>
            <Button class="text-xs" @click="runBootstrapDryRunNow">
              {{ t`Run Dry Run` }}
            </Button>
            <Button class="text-xs" @click="bootstrapCloudNow">
              {{ t`Bootstrap To Cloud` }}
            </Button>
            <Button class="text-xs" @click="runReconciliationNow">
              {{ t`Run Reconciliation` }}
            </Button>
            <Button class="text-xs" @click="exportDiagnosticsNow">
              {{ t`Export Diagnostics` }}
            </Button>
            <Button class="text-xs" @click="clearRemoteDataNow">
              {{ t`Clear Remote Data (Dev)` }}
            </Button>
            <Button class="text-xs" @click="repullAllNow">
              {{ t`Re-pull All (Dev)` }}
            </Button>
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
            <div>
              {{ t`Enrollment` }}: {{ cloudSyncStatus.enrollmentStatus }}
            </div>
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
          <div
            v-if="showDevClearRemoteButton"
            class="mt-3 pt-3 border-t dark:border-gray-800 text-xs"
          >
            <div class="font-semibold mb-1">{{ t`Dry Run` }}</div>
            <div v-if="dryRun.checkedAt">
              <div>{{ t`Last Checked` }}: {{ dryRun.checkedAt }}</div>
              <div
                :class="
                  dryRun.canProceed
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                "
              >
                {{ dryRun.summary }}
              </div>
            </div>
            <div v-else class="text-gray-700 dark:text-gray-200">
              {{
                t`Run before bootstrap to verify local balances and remote bootstrap preconditions.`
              }}
            </div>
          </div>
          <div class="mt-3 pt-3 border-t dark:border-gray-800 text-xs">
            <div class="font-semibold mb-1">{{ t`Bootstrap` }}</div>
            <div v-if="bootstrap.running">
              <div class="mb-2">
                {{ t`Uploading local baseline to cloud...` }}
              </div>
              <div
                class="
                  h-2
                  w-full
                  rounded-full
                  bg-gray-200
                  dark:bg-gray-800
                  overflow-hidden
                "
              >
                <div
                  class="h-full bg-blue-600 transition-all duration-200"
                  :style="{ width: `${bootstrapProgressPercent}%` }"
                />
              </div>
              <div class="mt-1 text-gray-700 dark:text-gray-200">
                {{ bootstrapProgressPercent }}%
                <span v-if="bootstrap.total > 0">
                  ({{ bootstrap.processed }}/{{ bootstrap.total }})
                </span>
              </div>
              <div
                v-if="bootstrap.summary"
                class="text-gray-700 dark:text-gray-200 break-all mt-1"
              >
                {{ bootstrap.summary }}
              </div>
            </div>
            <div v-else-if="bootstrap.checkedAt">
              <div>{{ t`Last Bootstrap` }}: {{ bootstrap.checkedAt }}</div>
              <div class="text-gray-700 dark:text-gray-200">
                {{ bootstrap.summary }}
              </div>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t dark:border-gray-800 text-xs">
            <div class="font-semibold mb-1">{{ t`Reconciliation` }}</div>
            <div v-if="reconciliation.running">
              {{ t`Checking local vs remote snapshot...` }}
            </div>
            <div v-else-if="reconciliation.checkedAt">
              <div>{{ t`Last Checked` }}: {{ reconciliation.checkedAt }}</div>
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
          :field-actions="getFieldActionsForSection()"
          @value-change="onValueChange"
          @field-action="onSectionFieldAction"
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
import { getSavePath, showExportInFolder } from 'src/utils/ui';
import {
  bootstrapCloudSyncFromLocal,
  clearCloudSyncRemoteCompanyData,
  exportCloudSyncDiagnostics,
  flushCloudSyncOutbox,
  initializeCloudSyncRemoteSchema,
  pauseCloudSync,
  resumeCloudSync,
  runCloudSyncCycle,
  runCloudSyncBootstrapDryRun,
  resetCloudSyncPullCursorAndRepull,
  runCloudSyncReconciliation,
  setCloudSyncEnrollmentStatus,
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
        enrollmentStatus: 'not_enrolled',
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
        lastDryRunAt: '',
        lastDryRunStatus: 'unknown',
        lastDryRunSummary: '',
        lastDryRunChecksum: '',
      },
      reconciliation: {
        running: false,
        checkedAt: '',
        ok: null as null | boolean,
        mismatches: [] as string[],
      },
      bootstrap: {
        running: false,
        checkedAt: '',
        summary: '',
        stage: '',
        processed: 0,
        total: 0,
      },
      dryRun: {
        checkedAt: '',
        canProceed: null as null | boolean,
        summary: '',
      },
      remoteInit: {
        open: false,
        token: '',
        running: false,
      },
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      cloudSyncStatus: {
        enrollmentStatus: string;
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
        lastDryRunAt: string;
        lastDryRunStatus: string;
        lastDryRunSummary: string;
        lastDryRunChecksum: string;
      };
      reconciliation: {
        running: boolean;
        checkedAt: string;
        ok: null | boolean;
        mismatches: string[];
      };
      bootstrap: {
        running: boolean;
        checkedAt: string;
        summary: string;
        stage: string;
        processed: number;
        total: number;
      };
      dryRun: {
        checkedAt: string;
        canProceed: null | boolean;
        summary: string;
      };
      remoteInit: {
        open: boolean;
        token: string;
        running: boolean;
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
    showDevClearRemoteButton(): boolean {
      return this.showCloudSyncPanel && !!this.fyo.store.isDevelopment;
    },
    showAdvancedSyncFields(): boolean {
      return !!this.fyo.store.isDevelopment;
    },
    bootstrapProgressPercent(): number {
      if (!this.bootstrap.running) {
        return 0;
      }

      if (this.bootstrap.total <= 0) {
        return 0;
      }

      const pct = Math.round(
        (this.bootstrap.processed / this.bootstrap.total) * 100
      );
      return Math.min(Math.max(pct, 0), 100);
    },
    syncSetupMissing(): string[] {
      const ss = this.fyo.singles.SystemSettings;
      if (!ss?.syncEnabled || ss.syncMode === 'off') {
        return [];
      }

      const missing: string[] = [];
      if (!ss.syncProjectId && !ss.syncApiUrl) {
        missing.push(
          this
            .t`Sync Project ID is required (or provide Sync API URL Override).`
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
    async normalizeSyncModeForProductionUx(): Promise<void> {
      const ss = this.fyo.singles.SystemSettings as
        | {
            syncEnabled?: boolean;
            syncMode?: string;
          }
        | undefined;
      if (!ss) {
        return;
      }

      if (this.showAdvancedSyncFields) {
        return;
      }

      const enabled = !!ss.syncEnabled;
      const targetMode = enabled ? 'on' : 'off';
      if (ss.syncMode !== targetMode) {
        await (this.fyo.singles.SystemSettings as Doc).set(
          'syncMode',
          targetMode
        );
      }
    },
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
      await this.normalizeSyncModeForProductionUx();

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
    getFieldActionsForSection(): Record<string, string> {
      if (this.activeTab !== ModelNameEnum.SystemSettings) {
        return {};
      }

      return {
        syncCompanyId: this.t`Generate`,
      };
    },
    async onSectionFieldAction(fieldname: string): Promise<void> {
      if (
        this.activeTab === ModelNameEnum.SystemSettings &&
        fieldname === 'syncCompanyId'
      ) {
        await this.generateCompanyIdNow();
      }
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
            enrollmentStatus?: string;
            lastError?: string;
            lastPushAt?: string;
            lastPullAt?: string;
            lastReconciliationAt?: string;
            lastReconciliationStatus?: string;
            lastReconciliationSummary?: string;
            lastDryRunAt?: string;
            lastDryRunStatus?: string;
            lastDryRunSummary?: string;
            lastDryRunChecksum?: string;
          }
        | undefined;
      const lastError =
        (lastFailed?.errorMessage as string) ?? syncState?.lastError ?? '';

      this.cloudSyncStatus = {
        enrollmentStatus: syncState?.enrollmentStatus ?? 'not_enrolled',
        queued,
        processing,
        failed,
        sent,
        lastError,
        lastPushAt: syncState?.lastPushAt ?? '',
        lastPullAt: syncState?.lastPullAt ?? '',
        lastReconciliationAt: syncState?.lastReconciliationAt ?? '',
        lastReconciliationStatus:
          syncState?.lastReconciliationStatus ?? 'unknown',
        lastReconciliationSummary: syncState?.lastReconciliationSummary ?? '',
        lastDryRunAt: syncState?.lastDryRunAt ?? '',
        lastDryRunStatus: syncState?.lastDryRunStatus ?? 'unknown',
        lastDryRunSummary: syncState?.lastDryRunSummary ?? '',
        lastDryRunChecksum: syncState?.lastDryRunChecksum ?? '',
      };

      if (syncState?.lastDryRunAt) {
        this.dryRun = {
          checkedAt: String(syncState.lastDryRunAt),
          canProceed:
            syncState.lastDryRunStatus === 'passed'
              ? true
              : syncState.lastDryRunStatus === 'failed'
              ? false
              : null,
          summary:
            syncState.lastDryRunSummary ??
            this.t`Dry run completed. Use Run Dry Run for latest checks.`,
        };
      }
    },
    initializeRemoteNow(): void {
      const systemSettings = this.fyo.singles.SystemSettings as
        | {
            syncProjectId?: string;
          }
        | undefined;
      if (!systemSettings?.syncProjectId) {
        showToast({
          type: 'error',
          message: this
            .t`Set Sync Project ID first, save settings, then initialize remote.`,
        });
        return;
      }

      this.remoteInit.open = true;
      this.remoteInit.token = '';
      this.remoteInit.running = false;
    },
    cancelRemoteInitNow(): void {
      this.remoteInit.open = false;
      this.remoteInit.token = '';
      this.remoteInit.running = false;
    },
    async executeRemoteInitNow(): Promise<void> {
      const systemSettings = this.fyo.singles.SystemSettings as
        | {
            syncProjectId?: string;
          }
        | undefined;
      if (!systemSettings?.syncProjectId) {
        showToast({
          type: 'error',
          message: this
            .t`Set Sync Project ID first, save settings, then initialize remote.`,
        });
        return;
      }

      const token = String(this.remoteInit.token ?? '').trim();
      if (!token) {
        showToast({
          type: 'error',
          message: this.t`Enter admin access token to continue.`,
        });
        return;
      }

      await showDialog({
        title: this.t`Initialize Remote Schema?`,
        detail: this
          .t`This runs base schema + sync migrations on the configured Supabase project.`,
        type: 'warning',
        buttons: [
          {
            label: this.t`Continue`,
            isPrimary: true,
            action: async () => {
              this.remoteInit.running = true;
              try {
                const result = await initializeCloudSyncRemoteSchema(this.fyo, {
                  accessToken: token,
                });
                await this.refreshCloudSyncStatus();
                this.cancelRemoteInitNow();
                showToast({
                  type: 'success',
                  message: this
                    .t`Remote schema initialized for ${result.projectRef}. Applied ${result.appliedScripts.length} scripts.`,
                });
              } catch (error) {
                this.remoteInit.running = false;
                showToast({
                  type: 'error',
                  message: getErrorMessage(error as Error),
                });
                throw error;
              }
            },
          },
          {
            label: this.t`Cancel`,
            isEscape: true,
            action: () => null,
          },
        ],
      });
    },
    async generateCompanyIdNow(): Promise<void> {
      const systemSettings = this.fyo.singles.SystemSettings;
      if (!systemSettings) {
        showToast({
          type: 'error',
          message: this.t`System Settings not available.`,
        });
        return;
      }

      const existing = String(systemSettings.syncCompanyId ?? '').trim();
      if (existing) {
        const shouldOverwrite = (await showDialog({
          title: this.t`Replace Company ID?`,
          detail: this
            .t`A Sync Company ID already exists. Replacing it can connect this desktop to a different remote tenant.`,
          type: 'warning',
          buttons: [
            {
              label: this.t`Replace`,
              isPrimary: true,
              action: () => true,
            },
            {
              label: this.t`Cancel`,
              isEscape: true,
              action: () => false,
            },
          ],
        })) as boolean;

        if (!shouldOverwrite) {
          return;
        }
      }

      const newId =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await systemSettings.set('syncCompanyId', newId);
      this.update();
      showToast({
        type: 'success',
        message: this.t`Generated Sync Company ID. Click Save to apply.`,
      });
    },
    async syncNow(): Promise<void> {
      if (this.cloudSyncStatus.enrollmentStatus === 'paused') {
        showToast({
          type: 'warning',
          message: this.t`Sync is paused. Resume sync to run sync now.`,
        });
        return;
      }

      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      try {
        if (
          this.cloudSyncStatus.enrollmentStatus === 'not_enrolled' ||
          this.cloudSyncStatus.enrollmentStatus === 'error'
        ) {
          await this.autoEnrollForSyncNow();
        }

        await runCloudSyncCycle(this.fyo);
        await this.refreshCloudSyncStatus();
        showToast({
          type: 'success',
          message: this.t`Sync cycle completed.`,
        });
      } catch (error) {
        await this.refreshCloudSyncStatus();
        showToast({
          type: 'error',
          message: this.getFriendlySyncError(error as Error),
        });
      }
    },
    getFriendlySyncError(error: Error): string {
      const message = getErrorMessage(error);
      const lower = message.toLowerCase();

      if (
        lower.includes('fetch_sync_snapshot') ||
        lower.includes('apply_sync_event') ||
        lower.includes('relation') ||
        lower.includes('does not exist')
      ) {
        return this
          .t`Remote sync schema is not initialized for this Supabase project. Click Initialize Remote (Admin), then try Sync Now again.`;
      }

      return message;
    },
    async autoEnrollForSyncNow(): Promise<void> {
      const dryRunResult = await runCloudSyncBootstrapDryRun(this.fyo);
      this.dryRun = {
        checkedAt: new Date().toLocaleString(),
        canProceed: dryRunResult.canProceed,
        summary: dryRunResult.canProceed
          ? this.t`Dry run passed.`
          : dryRunResult.errors.join(' | '),
      };

      if (!dryRunResult.localBalanced) {
        throw new Error(dryRunResult.errors.join(' | '));
      }

      // If remote already has data, treat it as pre-seeded and continue with normal sync.
      if (dryRunResult.remoteHasData) {
        await setCloudSyncEnrollmentStatus(this.fyo, 'active', '');
        await this.refreshCloudSyncStatus();
        return;
      }

      const backupPath = await this.createLocalSyncBackup();
      this.bootstrap = {
        running: true,
        checkedAt: '',
        summary: this.t`Local backup created: ${backupPath}`,
        stage: 'starting',
        processed: 0,
        total: 0,
      };

      const result = await bootstrapCloudSyncFromLocal(this.fyo, {
        onProgress: (progress: {
          stage: string;
          message: string;
          processed?: number;
          total?: number;
        }) => {
          this.bootstrap = {
            running: true,
            checkedAt: '',
            summary: progress.message,
            stage: progress.stage,
            processed: progress.processed ?? this.bootstrap.processed,
            total: progress.total ?? this.bootstrap.total,
          };
        },
      });

      const verification = await runCloudSyncReconciliation(this.fyo);
      if (!verification.ok) {
        await setCloudSyncEnrollmentStatus(
          this.fyo,
          'error',
          'Reconciliation mismatch detected'
        );
        throw new Error(
          `Bootstrap upload completed but reconciliation failed: ${verification.mismatches.join(
            ' | '
          )}`
        );
      }

      await setCloudSyncEnrollmentStatus(this.fyo, 'active', '');
      this.bootstrap = {
        running: false,
        checkedAt: new Date().toLocaleString(),
        summary: this
          .t`Uploaded ${result.accounts} accounts, ${result.parties} parties, ${result.journalEntries} journal entries. Verification passed.`,
        stage: 'completed',
        processed: 0,
        total: 0,
      };
      this.reconciliation = {
        running: false,
        checkedAt: new Date().toLocaleString(),
        ok: verification.ok,
        mismatches: verification.mismatches,
      };
      await this.refreshCloudSyncStatus();
    },
    async flushCloudSyncNow(): Promise<void> {
      if (this.cloudSyncStatus.enrollmentStatus === 'paused') {
        showToast({
          type: 'warning',
          message: this.t`Sync is paused. Resume sync to flush outbox.`,
        });
        return;
      }

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
    async pauseSyncNow(): Promise<void> {
      await pauseCloudSync(this.fyo);
      await this.refreshCloudSyncStatus();
      showToast({
        type: 'success',
        message: this.t`Cloud sync paused.`,
      });
    },
    async resumeSyncNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      await resumeCloudSync(this.fyo);
      await this.refreshCloudSyncStatus();
      showToast({
        type: 'success',
        message: this.t`Cloud sync resumed.`,
      });
    },
    async bootstrapCloudNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      await showDialog({
        title: this.t`Bootstrap Cloud Data?`,
        detail: this
          .t`This uploads your current desktop Accounts, Parties, and Journal Entries to the configured cloud company. Use this only once on an empty remote company.`,
        type: 'warning',
        buttons: [
          {
            label: this.t`Continue`,
            isPrimary: true,
            action: async () => {
              try {
                const dryRunResult = await runCloudSyncBootstrapDryRun(
                  this.fyo
                );
                this.dryRun = {
                  checkedAt: new Date().toLocaleString(),
                  canProceed: dryRunResult.canProceed,
                  summary: dryRunResult.canProceed
                    ? this.t`Dry run passed.`
                    : dryRunResult.errors.join(' | '),
                };
                if (!dryRunResult.canProceed) {
                  throw new Error(dryRunResult.errors.join(' | '));
                }

                const backupPath = await this.createLocalSyncBackup();
                this.bootstrap = {
                  running: true,
                  checkedAt: '',
                  summary: this.t`Local backup created: ${backupPath}`,
                  stage: 'starting',
                  processed: 0,
                  total: 0,
                };
                const result = await bootstrapCloudSyncFromLocal(this.fyo, {
                  onProgress: (progress: {
                    stage: string;
                    message: string;
                    processed?: number;
                    total?: number;
                  }) => {
                    this.bootstrap = {
                      running: true,
                      checkedAt: '',
                      summary: progress.message,
                      stage: progress.stage,
                      processed: progress.processed ?? this.bootstrap.processed,
                      total: progress.total ?? this.bootstrap.total,
                    };
                  },
                });
                const verification = await runCloudSyncReconciliation(this.fyo);
                if (!verification.ok) {
                  await setCloudSyncEnrollmentStatus(
                    this.fyo,
                    'error',
                    'Reconciliation mismatch detected'
                  );
                  throw new Error(
                    `Bootstrap upload completed but reconciliation failed: ${verification.mismatches.join(
                      ' | '
                    )}`
                  );
                }

                await setCloudSyncEnrollmentStatus(this.fyo, 'active', '');
                this.bootstrap = {
                  running: false,
                  checkedAt: new Date().toLocaleString(),
                  summary: this
                    .t`Uploaded ${result.accounts} accounts, ${result.parties} parties, ${result.journalEntries} journal entries. Verification passed.`,
                  stage: 'completed',
                  processed: 0,
                  total: 0,
                };
                this.reconciliation = {
                  running: false,
                  checkedAt: new Date().toLocaleString(),
                  ok: verification.ok,
                  mismatches: verification.mismatches,
                };
                await this.refreshCloudSyncStatus();
                showToast({
                  type: 'success',
                  message: this.t`Bootstrap finished and verification passed.`,
                });
              } catch (error) {
                await setCloudSyncEnrollmentStatus(
                  this.fyo,
                  'error',
                  getErrorMessage(error as Error)
                );
                this.bootstrap = {
                  running: false,
                  checkedAt: new Date().toLocaleString(),
                  summary: getErrorMessage(error as Error),
                  stage: 'failed',
                  processed: 0,
                  total: 0,
                };
                await this.refreshCloudSyncStatus();
                showToast({
                  type: 'error',
                  message: getErrorMessage(error as Error),
                });
              }
            },
          },
          {
            label: this.t`Cancel`,
            isEscape: true,
            action: () => null,
          },
        ],
      });
    },
    async runBootstrapDryRunNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      try {
        const result = await runCloudSyncBootstrapDryRun(this.fyo);
        this.dryRun = {
          checkedAt: new Date().toLocaleString(),
          canProceed: result.canProceed,
          summary: result.canProceed
            ? this
                .t`Dry run passed. Local data balanced and bootstrap preconditions satisfied.`
            : result.errors.join(' | '),
        };
        showToast({
          type: result.canProceed ? 'success' : 'warning',
          message: result.canProceed
            ? this.t`Dry run passed.`
            : this.t`Dry run found blocking issues.`,
        });
      } catch (error) {
        this.dryRun = {
          checkedAt: new Date().toLocaleString(),
          canProceed: false,
          summary: getErrorMessage(error as Error),
        };
        showToast({
          type: 'error',
          message: getErrorMessage(error as Error),
        });
      }
    },
    async createLocalSyncBackup(): Promise<string> {
      const dbPath = String(this.fyo.db.dbPath ?? '').trim();
      if (!dbPath || dbPath === ':memory:') {
        throw new Error('Cannot create backup for this database');
      }

      return await ipc.createDbBackup(dbPath);
    },
    async clearRemoteDataNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      await showDialog({
        title: this.t`Clear Remote Company Data?`,
        detail: this
          .t`Development action: this will delete all synced Accounts, Parties, Journal Entries, Change Log, and sync state for the selected Sync Company ID on remote.`,
        type: 'warning',
        buttons: [
          {
            label: this.t`Delete Remote Data`,
            isPrimary: true,
            action: async () => {
              const response = await clearCloudSyncRemoteCompanyData(this.fyo);
              const deleted = response.deleted ?? {};
              await this.refreshCloudSyncStatus();
              this.bootstrap = {
                running: false,
                checkedAt: new Date().toLocaleString(),
                summary: this.t`Remote cleared. Accounts=${
                  deleted.accounts ?? 0
                }, Parties=${deleted.parties ?? 0}, JournalEntries=${
                  deleted.journal_entries ?? 0
                }.`,
                stage: 'completed',
                processed: 0,
                total: 0,
              };
              showToast({
                type: 'success',
                message: this.t`Remote company data cleared.`,
              });
            },
          },
          {
            label: this.t`Cancel`,
            isEscape: true,
            action: () => null,
          },
        ],
      });
    },
    async repullAllNow(): Promise<void> {
      if (this.cloudSyncStatus.enrollmentStatus === 'paused') {
        showToast({
          type: 'warning',
          message: this.t`Sync is paused. Resume sync to re-pull changes.`,
        });
        return;
      }

      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      await showDialog({
        title: this.t`Re-pull All Remote Changes?`,
        detail: this
          .t`Development action: this resets local pull cursor to zero and fetches all remote changes again for this company.`,
        type: 'warning',
        buttons: [
          {
            label: this.t`Re-pull`,
            isPrimary: true,
            action: async () => {
              await resetCloudSyncPullCursorAndRepull(this.fyo);
              await this.refreshCloudSyncStatus();
              showToast({
                type: 'success',
                message: this.t`Re-pull finished.`,
              });
            },
          },
          {
            label: this.t`Cancel`,
            isEscape: true,
            action: () => null,
          },
        ],
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
            : this
                .t`Reconciliation found differences. Review mismatch details.`,
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
          message: this
            .t`Reconciliation failed. Check sync configuration and network.`,
        });
        await this.refreshCloudSyncStatus();
      }
    },
    async exportDiagnosticsNow(): Promise<void> {
      if (this.syncSetupMissing.length) {
        showToast({
          type: 'error',
          message: this
            .t`Cloud sync setup is incomplete. Fill required fields and save settings first.`,
        });
        return;
      }

      try {
        const diagnostics = await exportCloudSyncDiagnostics(this.fyo);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `cloud-sync-diagnostics-${timestamp}`;
        const { canceled, filePath } = await getSavePath(fileName, 'json');
        if (canceled || !filePath) {
          return;
        }

        await ipc.saveData(JSON.stringify(diagnostics, null, 2), filePath);
        showExportInFolder(this.t`Diagnostics exported`, filePath);
      } catch (error) {
        showToast({
          type: 'error',
          message: getErrorMessage(error as Error),
        });
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

        if (
          schemaName === ModelNameEnum.SystemSettings &&
          !this.showAdvancedSyncFields &&
          ['syncMode', 'syncAllowedCompanies'].includes(field.fieldname)
        ) {
          continue;
        }

        tabbed.get(section)!.push(field);
      }

      this.groupedFields = grouped;
    },
  },
});
</script>
