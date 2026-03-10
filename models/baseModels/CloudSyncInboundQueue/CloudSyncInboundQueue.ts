import { Doc } from 'fyo/model/doc';
import { HiddenMap, ListViewSettings } from 'fyo/model/types';

export class CloudSyncInboundQueue extends Doc {
  seq?: number;
  docType?: string;
  operation?: string;
  status?: string;
  attempts?: number;
  nextRetryAt?: string;
  errorMessage?: string;
  payload?: string;

  hidden: HiddenMap = {
    name: () => true,
    payload: () => true,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['docType', 'operation', 'status', 'attempts'],
    };
  }
}
