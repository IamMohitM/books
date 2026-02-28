import {
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
  app,
  dialog,
  ipcMain,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { constants } from 'fs';
import fs from 'fs-extra';
import path from 'path';
import { SelectFileOptions, SelectFileReturn } from 'utils/types';
import databaseManager from '../backend/database/manager';
import { emitMainProcessError } from '../backend/helpers';
import { Main } from '../main';
import { DatabaseMethod } from '../utils/db/types';
import { IPC_ACTIONS } from '../utils/messages';
import { getUrlAndTokenString, sendError } from './contactMothership';
import { getLanguageMap } from './getLanguageMap';
import { getTemplates } from './getPrintTemplates';
import { printHtmlDocument } from './printHtmlDocument';
import {
  getConfigFilesWithModified,
  getErrorHandledReponse,
  isNetworkError,
  setAndGetCleanedConfigFiles,
} from './helpers';
import { saveHtmlAsPdf } from './saveHtmlAsPdf';
import { sendAPIRequest } from './api';
import { initScheduler } from './initSheduler';

export default function registerIpcMainActionListeners(main: Main) {
  ipcMain.handle(IPC_ACTIONS.CHECK_DB_ACCESS, async (_, filePath: string) => {
    try {
      await fs.access(filePath, constants.W_OK | constants.R_OK);
    } catch (err) {
      return false;
    }

    return true;
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_DB_DEFAULT_PATH,
    async (_, companyName: string, dbFolder?: string) => {
      const customRoot = typeof dbFolder === 'string' ? dbFolder.trim() : '';
      let dbsPath = '';

      if (customRoot) {
        dbsPath = customRoot;
      } else {
        let root: string;
        try {
          root = app.getPath('documents');
        } catch {
          root = app.getPath('userData');
        }

        if (main.isDevelopment) {
          root = 'dbs';
        }

        const legacyAppName = 'Frappe Books';
        const appName = 'Frappe Cash Books';
        const legacyPath = path.join(root, legacyAppName);
        dbsPath = path.join(root, appName);

        if (
          legacyPath !== dbsPath &&
          (await fs.pathExists(legacyPath)) &&
          !(await fs.pathExists(dbsPath))
        ) {
          try {
            await fs.move(legacyPath, dbsPath, { overwrite: false });
          } catch {
            // If migration fails, fall back to legacy path.
            dbsPath = legacyPath;
          }
        }
      }

      const backupPath = path.join(dbsPath, 'backups');
      await fs.ensureDir(backupPath);

      let dbFilePath = path.join(dbsPath, `${companyName}.books.db`);

      if (await fs.pathExists(dbFilePath)) {
        const option = await dialog.showMessageBox({
          type: 'question',
          title: 'File Exists',
          message: `Filename already exists. Do you want to overwrite the existing file or create a new one?`,
          buttons: ['Overwrite', 'New'],
        });

        if (option.response === 1) {
          const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '');

          dbFilePath = path.join(
            dbsPath,
            `${companyName}_${timestamp}.books.db`
          );

          await dialog.showMessageBox({
            type: 'info',
            message: `New file: ${path.basename(dbFilePath)}`,
          });
        }
      }

      return dbFilePath;
    }
  );

  ipcMain.handle(IPC_ACTIONS.CREATE_DB_BACKUP, async (_, dbPath: string) => {
    const sourcePath = String(dbPath ?? '').trim();
    if (!sourcePath || sourcePath === ':memory:') {
      throw new Error('Invalid database path for backup');
    }

    await fs.access(sourcePath, constants.R_OK);

    const parsed = path.parse(sourcePath);
    let fileName = parsed.name;
    if (fileName.endsWith('.books')) {
      fileName = fileName.slice(0, -6);
    }

    const backupDir = path.join(parsed.dir, 'backups');
    await fs.ensureDir(backupDir);

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '');
    const backupPath = path.join(
      backupDir,
      `${fileName}_sync_backup_${timestamp}.books.db`
    );

    await fs.copy(sourcePath, backupPath, {
      overwrite: false,
      errorOnExist: true,
    });
    await fs.access(backupPath, constants.R_OK);
    return backupPath;
  });

  ipcMain.handle(IPC_ACTIONS.GET_SYNC_INIT_SCRIPTS, () => {
    const scriptSpecs: Array<{ name: string; relativePath: string }> = [
      { name: 'base_schema', relativePath: 'supabase/schema.sql' },
      { name: 'base_policies', relativePath: 'supabase/policies.sql' },
      {
        name: 'migration_update_create_journal_entry',
        relativePath:
          'supabase/migrations/20260222000100_update_create_journal_entry.sql',
      },
      {
        name: 'migration_sync_foundation',
        relativePath: 'supabase/migrations/20260223000100_sync_foundation.sql',
      },
      {
        name: 'migration_apply_sync_event',
        relativePath: 'supabase/migrations/20260223000200_apply_sync_event.sql',
      },
      {
        name: 'migration_change_log_and_pull',
        relativePath:
          'supabase/migrations/20260223000300_change_log_and_pull.sql',
      },
      {
        name: 'migration_reconciliation_snapshot',
        relativePath:
          'supabase/migrations/20260223000400_reconciliation_snapshot.sql',
      },
      {
        name: 'migration_fix_external_key_unique_indexes',
        relativePath:
          'supabase/migrations/20260225130600_fix_external_key_unique_indexes.sql',
      },
      {
        name: 'migration_fix_apply_sync_event_empty_dates',
        relativePath:
          'supabase/migrations/20260225214500_fix_apply_sync_event_empty_dates.sql',
      },
      {
        name: 'migration_change_log_payload_key_fallbacks',
        relativePath:
          'supabase/migrations/20260225221500_change_log_payload_key_fallbacks.sql',
      },
      {
        name: 'migration_admin_invite_company_user',
        relativePath:
          'supabase/migrations/20260226110000_add_admin_invite_company_user.sql',
      },
    ];

    const scripts = scriptSpecs.map((spec) => {
      const absolutePath = path.resolve(process.cwd(), spec.relativePath);
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Missing SQL script: ${spec.relativePath}`);
      }

      return {
        name: spec.name,
        sql: fs.readFileSync(absolutePath, 'utf8'),
      };
    });

    return scripts;
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_OPEN_FILEPATH,
    async (_, options: OpenDialogOptions) => {
      return await dialog.showOpenDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_SAVE_FILEPATH,
    async (_, options: SaveDialogOptions) => {
      return await dialog.showSaveDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_DIALOG_RESPONSE,
    async (_, options: MessageBoxOptions) => {
      if (main.isDevelopment || main.isLinux) {
        Object.assign(options, { icon: main.icon });
      }

      return await dialog.showMessageBox(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SHOW_ERROR,
    (_, { title, content }: { title: string; content: string }) => {
      return dialog.showErrorBox(title, content);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_HTML_AS_PDF,
    async (
      _,
      html: string,
      savePath: string,
      width: number,
      height: number
    ) => {
      return await saveHtmlAsPdf(html, savePath, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.PRINT_HTML_DOCUMENT,
    async (_, html: string, width: number, height: number) => {
      return await printHtmlDocument(html, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_DATA,
    async (_, data: string, savePath: string) => {
      return await fs.writeFile(savePath, data, { encoding: 'utf-8' });
    }
  );

  ipcMain.handle(IPC_ACTIONS.SEND_ERROR, async (_, bodyJson: string) => {
    await sendError(bodyJson, main);
  });

  ipcMain.handle(IPC_ACTIONS.CHECK_FOR_UPDATES, async () => {
    if (main.isDevelopment || main.checkedForUpdate) {
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (isNetworkError(error as Error)) {
        return;
      }

      emitMainProcessError(error);
    }
    main.checkedForUpdate = true;
  });

  ipcMain.handle(IPC_ACTIONS.GET_LANGUAGE_MAP, async (_, code: string) => {
    const obj = { languageMap: {}, success: true, message: '' };
    try {
      obj.languageMap = await getLanguageMap(code);
    } catch (err) {
      obj.success = false;
      obj.message = (err as Error).message;
    }

    return obj;
  });

  ipcMain.handle(
    IPC_ACTIONS.SELECT_FILE,
    async (_, options: SelectFileOptions): Promise<SelectFileReturn> => {
      const response: SelectFileReturn = {
        name: '',
        filePath: '',
        success: false,
        data: Buffer.from('', 'utf-8'),
        canceled: false,
      };
      const { filePaths, canceled } = await dialog.showOpenDialog(
        main.mainWindow!,
        { ...options, properties: ['openFile'] }
      );

      response.filePath = filePaths?.[0];
      response.canceled = canceled;

      if (!response.filePath) {
        return response;
      }

      response.success = true;
      if (canceled) {
        return response;
      }

      response.name = path.basename(response.filePath);
      response.data = await fs.readFile(response.filePath);
      return response;
    }
  );

  ipcMain.handle(IPC_ACTIONS.GET_CREDS, () => {
    return getUrlAndTokenString();
  });

  ipcMain.handle(IPC_ACTIONS.DELETE_FILE, async (_, filePath: string) => {
    return getErrorHandledReponse(async () => await fs.unlink(filePath));
  });

  ipcMain.handle(IPC_ACTIONS.GET_DB_LIST, async () => {
    const files = await setAndGetCleanedConfigFiles();
    return await getConfigFilesWithModified(files);
  });

  ipcMain.handle(IPC_ACTIONS.GET_ENV, async () => {
    let version = app.getVersion();
    if (main.isDevelopment) {
      const packageJson = await fs.readFile('package.json', 'utf-8');
      version = (JSON.parse(packageJson) as { version: string }).version;
    }

    return {
      isDevelopment: main.isDevelopment,
      platform: process.platform,
      version,
    };
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_TEMPLATES,
    async (_, posPrintWidth?: number) => {
      return getTemplates(posPrintWidth);
    }
  );

  ipcMain.handle(IPC_ACTIONS.INIT_SHEDULER, async (_, interval: string) => {
    return initScheduler(interval);
  });

  ipcMain.handle(
    IPC_ACTIONS.SEND_API_REQUEST,
    async (e, endpoint: string, options: RequestInit | undefined) => {
      const isSyncRpc =
        endpoint.includes('/rpc/apply_sync_event') ||
        endpoint.includes('/rpc/fetch_sync_changes') ||
        endpoint.includes('/rpc/fetch_sync_snapshot');
      const startedAt = Date.now();
      if (isSyncRpc) {
        console.log(`[cloud-sync-ipc] invoke -> ${endpoint}`);
      }

      try {
        const response = await sendAPIRequest(endpoint, options);
        if (isSyncRpc) {
          console.log(
            `[cloud-sync-ipc] done <- ${endpoint} in ${
              Date.now() - startedAt
            }ms`
          );
        }
        return response;
      } catch (error) {
        if (isSyncRpc) {
          console.error(
            `[cloud-sync-ipc] fail !! ${endpoint} in ${
              Date.now() - startedAt
            }ms: ${(error as Error).message}`
          );
        }
        throw error;
      }
    }
  );

  /**
   * Database Related Actions
   */

  ipcMain.handle(
    IPC_ACTIONS.DB_CREATE,
    async (_, dbPath: string, countryCode: string) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.createNewDatabase(dbPath, countryCode);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CONNECT,
    async (_, dbPath: string, countryCode?: string) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.connectToDatabase(dbPath, countryCode);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CALL,
    async (_, method: DatabaseMethod, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.call(method, ...args);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_BESPOKE,
    async (_, method: string, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.callBespoke(method, ...args);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_SCHEMA, async () => {
    return await getErrorHandledReponse(() => {
      return databaseManager.getSchemaMap();
    });
  });
}
