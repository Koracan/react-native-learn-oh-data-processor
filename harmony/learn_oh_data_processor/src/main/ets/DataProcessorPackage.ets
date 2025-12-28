import {
  RNPackage,
  AnyThreadTurboModule,
  AnyThreadTurboModuleContext,
} from '@rnoh/react-native-openharmony/ts';
import { DataProcessorModule } from './DataProcessorModule';

export class DataProcessorPackage extends RNPackage {
  override getAnyThreadTurboModuleFactoryByNameMap(): Map<string, (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule | null> {
    return new Map<string, (ctx: AnyThreadTurboModuleContext) => AnyThreadTurboModule>()
      .set('LearnOHDataProcessor', (ctx) => new DataProcessorModule(ctx));
  }
}
