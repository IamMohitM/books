<template>
  <div
    class="
      border-s
      dark:border-gray-800
      h-full
      overflow-auto
      w-quick-edit
      bg-white
      dark:bg-gray-850
    "
  >
    <!-- Quick edit Tool bar -->
    <div
      class="
        flex
        items-center
        justify-between
        px-4
        h-row-largest
        sticky
        top-0
        bg-white
        dark:bg-gray-850
      "
      style="z-index: 1"
    >
      <!-- Close Button  -->
      <Button :icon="true" @click="routeToPrevious">
        <feather-icon name="x" class="w-4 h-4" />
      </Button>

      <!-- Save & Submit Buttons -->
      <Button v-if="doc?.canSave" :icon="true" type="primary" @click="sync">
        {{ t`Save` }}
      </Button>
      <Button
        v-else-if="doc?.canSubmit"
        :icon="true"
        type="primary"
        @click="submit"
      >
        {{ t`Submit` }}
      </Button>
    </div>

    <!-- Name and image -->
    <div
      v-if="doc && (titleField || imageField)"
      class="items-center border-b border-t dark:border-gray-800"
      :class="imageField ? 'grid' : 'flex justify-center'"
      :style="{
        height: `calc(var(--h-row-mid) * ${!!imageField ? '2 + 1px' : '1'})`,
        gridTemplateColumns: `minmax(0, 1.1fr) minmax(0, 2fr)`,
      }"
    >
      <AttachImage
        v-if="imageField"
        class="ms-4"
        :df="imageField"
        :value="String(doc[imageField.fieldname] ?? '')"
        :letter-placeholder="letterPlaceHolder"
        @change="(value) => valueChange(imageField as Field, value)"
      />
      <FormControl
        v-if="titleField"
        ref="titleControl"
        :class="!!imageField ? 'me-4' : 'w-full mx-4'"
        :input-class="[
          'font-semibold text-xl',
          !!imageField ? '' : 'text-center',
        ]"
        size="small"
        :df="titleField"
        :value="doc[titleField.fieldname]"
        :read-only="isTitleReadOnly"
        @change="(value) => valueChange(titleField as Field, value)"
      />
    </div>

    <!-- Rest of the form -->
    <TwoColumnForm
      v-if="doc"
      ref="form"
      class="w-full"
      :doc="doc"
      :fields="fields"
      :column-ratio="[1.1, 2]"
    />
  </div>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Field, Schema } from 'schemas/types';
import Button from 'src/components/Button.vue';
import AttachImage from 'src/components/Controls/AttachImage.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import TwoColumnForm from 'src/components/TwoColumnForm.vue';
import { fyo } from 'src/initFyo';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { DocRef } from 'src/utils/types';
import {
  commonDocSubmit,
  commonDocSync,
  focusOrSelectFormControl,
  getFormRoute,
  routeTo,
} from 'src/utils/ui';
import { useDocShortcuts } from 'src/utils/vueUtils';
import { computed, defineComponent, inject, ref } from 'vue';
import { handleErrorWithDialog } from 'src/errorHandling';

export default defineComponent({
  name: 'QuickEditForm',
  components: {
    Button,
    FormControl,
    TwoColumnForm,
    AttachImage,
  },
  provide() {
    return {
      doc: computed(() => this.doc),
    };
  },
  props: {
    name: { type: String, required: true },
    schemaName: { type: String, required: true },
    hideFields: { type: Array, default: () => [] },
    showFields: { type: Array, default: () => [] },
  },
  emits: ['close'],
  setup() {
    const doc = ref(null) as DocRef;
    const shortcuts = inject(shortcutsKey);

    let context = 'QuickEditForm';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, doc, context, true);
    }

    return {
      form: ref<InstanceType<typeof TwoColumnForm> | null>(null),
      doc,
      context,
      shortcuts,
    };
  },
  data() {
    return {
      titleField: null,
      imageField: null,
    } as {
      titleField: null | Field;
      imageField: null | Field;
    };
  },
  computed: {
    letterPlaceHolder() {
      if (!this.doc) {
        return '';
      }

      const fn = this.titleField?.fieldname ?? 'name';
      const value = this.doc.get(fn);
      if (typeof value === 'string') {
        return value[0];
      }

      return '';
    },
    schema(): Schema {
      return fyo.schemaMap[this.schemaName]!;
    },
    isTitleReadOnly() {
      if (!this.doc) {
        return true;
      }

      if (this.doc.schema.naming !== 'manual') {
        return true;
      }

      // Allow renaming of Accounts even after insertion.
      if (this.schemaName === 'Account') {
        return false;
      }

      return this.doc.inserted;
    },
    canDuplicate(): boolean {
      if (!this.doc) {
        return false;
      }

      const isSubmittable = !!this.doc.schema.isSubmittable;
      return (
        !!(
          ((isSubmittable && this.doc.submitted) || !isSubmittable) &&
          !this.doc.notInserted
        )
      );
    },
    fields() {
      if (!this.schema) {
        return [];
      }

      const fieldnames = (this.schema.quickEditFields ?? ['name']).filter(
        (f) => !this.hideFields.includes(f)
      );

      if (this.showFields?.length) {
        fieldnames.push(
          ...this.schema.fields
            .map((f) => f.fieldname)
            .filter((f) => this.showFields.includes(f))
        );
      }

      return fieldnames.map((f) => fyo.getField(this.schemaName, f));
    },
  },
  activated() {
    this.setShortcuts();
  },
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async mounted() {
    await this.initialize();

    if (fyo.store.isDevelopment) {
      // @ts-ignore
      window.qef = this;
    }

    this.setShortcuts();
  },
  methods: {
    setShortcuts() {
      this.shortcuts?.set(this.context, ['Escape'], async () => {
        await this.routeToPrevious();
      });
      this.shortcuts?.pmod.set(this.context, ['KeyD'], async () => {
        await this.duplicateDoc();
      });
    },
    async initialize() {
      if (!this.schema) {
        return;
      }

      this.setFields();
      await this.setDoc();
      if (!this.doc) {
        return;
      }

      focusOrSelectFormControl(this.doc, this.$refs.titleControl, false);
    },
    setFields() {
      const titleFieldName = this.schema.titleField ?? 'name';
      this.titleField = fyo.getField(this.schemaName, titleFieldName) ?? null;
      this.imageField = fyo.getField(this.schemaName, 'image') ?? null;
    },
    async setDoc() {
      try {
        this.doc = await fyo.doc.getDoc(this.schemaName, this.name);
      } catch (e) {
        return this.$router.back();
      }
    },
    valueChange(field: Field, value: DocValue) {
      this.form?.onChange(field, value);
    },
    async sync() {
      if (!this.doc) {
        return;
      }

      await commonDocSync(this.doc);
    },
    async submit() {
      if (!this.doc) {
        return;
      }

      await commonDocSubmit(this.doc);
    },
    async routeToPrevious() {
      if (this.doc?.dirty && this.doc?.inserted) {
        await this.doc.load();
      }

      if (this.doc && this.doc.notInserted) {
        await this.doc.delete();
      }

      this.$router.back();
    },
    async duplicateDoc() {
      if (!this.doc || !this.canDuplicate) {
        return;
      }

      try {
        const dupe = this.doc.duplicate();
        const route = getFormRoute(this.schemaName, dupe.name!);
        await routeTo(route);
      } catch (err) {
        await handleErrorWithDialog(err as Error, this.doc);
      }
    },
  },
});
</script>
