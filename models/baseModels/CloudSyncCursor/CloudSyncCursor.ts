import { Doc } from 'fyo/model/doc';
import { HiddenMap, ListViewSettings } from 'fyo/model/types';

export class CloudSyncCursor extends Doc {
  companyId?: string;
  lastSeq?: number;

  hidden: HiddenMap = {
    name: () => true,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['companyId', 'lastSeq'],
    };
  }
}
