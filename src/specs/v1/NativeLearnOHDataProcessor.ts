import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  processNotices(rawJson: string, courseNamesJson: string): Promise<string>;
  processAssignments(rawJson: string, courseNamesJson: string): Promise<string>;
  processFiles(rawJson: string, courseNamesJson: string): Promise<string>;
  fetchAssignments(
    courseIds: string[],
    cookie: string,
    csrfToken: string,
  ): Promise<string>;
  fetchNotices(
    courseIds: string[],
    cookie: string,
    csrfToken: string,
  ): Promise<string>;
  fetchFiles(
    courseIds: string[],
    cookie: string,
    csrfToken: string,
  ): Promise<string>;
  post(
    url: string,
    cookie: string,
    csrfToken: string,
    params: string,
    filePath?: string,
    fileName?: string,
    fileType?: string,
    requestId?: string,
  ): Promise<string>;
  moveToBackground(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>(
  'LearnOHDataProcessor',
);
