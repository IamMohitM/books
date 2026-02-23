import { Doc } from 'fyo/model/doc';
import { HiddenMap, ListViewSettings } from 'fyo/model/types';

export class CloudSyncOutbox extends Doc {
  eventId?: string;
  referenceType?: string;
  documentName?: string;
  operation?: string;
  status?: string;
  attempts?: number;
  deviceId?: string;
  errorMessage?: string;
  payload?: string;

  hidden: HiddenMap = {
    name: () => true,
    payload: () => true,
  };

  static getListViewSettings(): ListViewSettings {
    return {
      columns: ['referenceType', 'documentName', 'operation', 'status'],
    };
  }
}
