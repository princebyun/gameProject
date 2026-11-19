import { defaultDataRegistry } from './data/dataRegistry';
import { defaultRpgDataRegistry } from './data/rpgDataRegistry';
import { createPlatformBridge } from './platform/platformBridge';
import { SceneManager } from './scenes/sceneManager';

async function bootstrap(): Promise<void> {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('#app root element not found');
  }

  const platformBridge = createPlatformBridge();
  const manager = new SceneManager(
    appRoot,
    defaultDataRegistry,
    defaultRpgDataRegistry,
    platformBridge
  );
  await manager.init();
}

bootstrap().catch((err) => {
  console.error('Failed to initialize One Piece Grand Voyage Engine:', err);
});
