<script>
import { t } from 'fyo';
import Badge from 'src/components/Badge.vue';
import { fyo } from 'src/initFyo';
import { fuzzyMatch } from 'src/utils';
import { getCreateFiltersFromListViewFilters } from 'src/utils/misc';
import { markRaw } from 'vue';
import AutoComplete from './AutoComplete.vue';

export default {
  name: 'Link',
  extends: AutoComplete,
  data() {
    return { results: [], filtersDisabled: false, linkValueRequestId: 0 };
  },
  watch: {
    value: {
      immediate: true,
      handler(newValue) {
        this.setLinkValue(newValue);
      },
    },
  },
  mounted() {
    if (this.value) {
      this.setLinkValue();
    }
  },
  props: {
    focusInput: Boolean,
    showClearButton: Boolean,
  },
  async created() {
    if (this.focusInput) {
      this.focusInputTag();
    }
  },
  methods: {
    async setLinkValue(newValue, isInput) {
      const requestId = (this.linkValueRequestId += 1);
      if (isInput) {
        if (requestId !== this.linkValueRequestId) {
          return;
        }
        return (this.linkValue = newValue || '');
      }

      const value = newValue !== undefined ? newValue : this.value;

      // While user is editing, preserve raw text and avoid resolving linked
      // display values that can overwrite partial deletions/typing.
      if (this.isFocused) {
        if (requestId !== this.linkValueRequestId) {
          return;
        }
        this.linkValue = value || '';
        return;
      }

      const { fieldname, target } = this.df ?? {};
      const linkDisplayField = fyo.schemaMap[target ?? '']?.linkDisplayField;
      if (!linkDisplayField) {
        if (requestId !== this.linkValueRequestId) {
          return;
        }
        return (this.linkValue = value);
      }

      if (!this.doc) {
        if (!value || !target) {
          if (requestId !== this.linkValueRequestId) {
            return;
          }
          this.linkValue = value;
          return;
        }

        try {
          const linkDoc = await fyo.db.get(target, value, [linkDisplayField]);
          // @ts-ignore
          if (requestId !== this.linkValueRequestId) {
            return;
          }
          this.linkValue = linkDoc?.[linkDisplayField] ?? value;
          return;
        } catch {
          if (requestId !== this.linkValueRequestId) {
            return;
          }
          this.linkValue = value;
          return;
        }
      }

      const linkDoc = await this.doc?.loadAndGetLink(fieldname);
      if (requestId !== this.linkValueRequestId) {
        return;
      }
      this.linkValue = linkDoc?.get(linkDisplayField) ?? value ?? '';
    },
    getTargetSchemaName() {
      return this.df.target;
    },
    async getOptions(filters) {
      const schemaName = this.getTargetSchemaName();
      if (!schemaName) {
        return [];
      }

      if (this.results?.length) {
        return this.results;
      }

      const schema = fyo.schemaMap[schemaName];

      const fields = [
        ...new Set(['name', schema.titleField, this.df.groupBy]),
      ].filter(Boolean);

      const results = await fyo.db.getAll(schemaName, {
        filters,
        fields,
      });

      return (this.results = results
        .map((r) => {
          const option = { label: r[schema.titleField], value: r.name };
          if (this.df.groupBy) {
            option.group = r[this.df.groupBy];
          }
          return option;
        })
        .filter(Boolean));
    },
    async getSuggestions(keyword = '') {
      let filters = this.filtersDisabled ? null : await this.getFilters();
      let options = await this.getOptions(filters || {});

      if (keyword) {
        options = options
          .map((item) => ({ ...fuzzyMatch(keyword, item.label), item }))
          .filter(({ isMatch }) => isMatch)
          .sort((a, b) => a.distance - b.distance)
          .map(({ item }) => item);
      }

      if (options.length === 0 && !this.df.emptyMessage) {
        if (filters && !!fyo.singles.SystemSettings?.allowFilterBypass) {
          options = [
            {
              component: markRaw({
                template:
                  '<span class="text-gray-600 dark:text-gray-400">{{ t`No results found, disable filters` }}</span>',
              }),
              action: () => this.disableFiltering(),
              actionOnly: true,
            },
          ];
        } else if (this.isFocused && (!this.doc || !this.df.create)) {
          options = [
            {
              component: markRaw({
                template:
                  '<span class="text-gray-600 dark:text-gray-400">{{ t`No results found` }}</span>',
              }),
              action: () => {},
              actionOnly: true,
            },
          ];
        }
      }

      if (this.doc && this.df.create) {
        options = options.concat(this.getCreateNewOption());
      }

      return options;
    },
    getCreateNewOption() {
      return {
        label: t`Create`,
        action: () => this.openNewDoc(),
        actionOnly: true,
        component: markRaw({
          template:
            '<div class="flex items-center font-semibold">{{ t`Create` }}' +
            '<Badge color="blue" class="ms-2" v-if="isNewValue">{{ linkValue }}</Badge>' +
            '</div>',
          computed: {
            value: () => this.value,
            linkValue: () => this.linkValue,
            isNewValue: () => {
              const values = this.suggestions.map((d) => d.label);
              return this.linkValue && !values.includes(this.linkValue);
            },
          },
          components: { Badge },
        }),
      };
    },
    disableFiltering(keyword) {
      this.filtersDisabled = true;
      this.results = [];
      setTimeout(() => {
        this.isDropdownOpen = true;
        this.updateSuggestions(keyword);
      }, 1);
    },
    async openNewDoc() {
      const schemaName = this.df.target;
      const name =
        this.linkValue || fyo.doc.getTemporaryName(fyo.schemaMap[schemaName]);
      const filters = await this.getCreateFilters();
      const { openQuickEdit } = await import('src/utils/ui');

      const doc = fyo.doc.getNewDoc(schemaName, { name, ...filters });
      openQuickEdit({ doc });

      doc.once('afterSync', () => {
        this.$router.back();
        this.results = [];
        this.triggerChange(doc.name);
      });
    },
    async getCreateFilters() {
      const { schemaName, fieldname } = this.df;
      const getCreateFilters =
        fyo.models[schemaName]?.createFilters?.[fieldname];
      let createFilters = await getCreateFilters?.(this.doc);

      if (createFilters !== undefined) {
        return createFilters;
      }

      const filters = (await this.getFilters()) ?? {};
      return getCreateFiltersFromListViewFilters(filters);
    },
    async getFilters() {
      if (this.df.filters) {
        return this.df.filters;
      }

      if (fyo.singles.SystemSettings?.removeFilter) {
        return null;
      }

      const { schemaName, fieldname } = this.df;
      const getFilters = fyo.models[schemaName]?.filters?.[fieldname];

      if (getFilters === undefined) {
        return null;
      }

      if (this.doc) {
        return await getFilters(this.doc);
      }

      try {
        return await getFilters();
      } catch {
        return null;
      }
    },
  },
};
</script>
