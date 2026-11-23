import type { PixiStageHost } from '../PixiStageHost';
import { PixiProIslandScene } from './PixiProIslandScene';

export class PixiFooshaIslandScene extends PixiProIslandScene {
  constructor(host: PixiStageHost) {
    super(host, 'foosha_shells');
  }

  public override preload(): Promise<void> {
    return super.preload();
  }
}
