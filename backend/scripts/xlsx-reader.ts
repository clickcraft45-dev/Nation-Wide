/**
 * File-path wrapper around the shared .xlsx reader in src/common/xlsx, kept so the one-off import
 * scripts can carry on calling readSheet(path, sheet).
 */
import { readFileSync } from 'node:fs';
import {
  readSheetFromBuffer,
  listSheets,
} from '../src/common/xlsx/xlsx-reader';

export function readSheet(path: string, sheetName: string): string[][] {
  return readSheetFromBuffer(readFileSync(path), sheetName);
}

export function readSheetNames(path: string): string[] {
  return listSheets(readFileSync(path));
}
