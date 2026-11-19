import { BATTLE_CALC_VERSION } from '../src/core/constants';
import { MultiplayerRelayServer } from './relayServer';

const port = Number(process.env.PORT || 8787);
const server = new MultiplayerRelayServer(port, BATTLE_CALC_VERSION);

server
  .start()
  .then((boundPort) => {
    console.log(
      `[One Piece Multiplayer Relay Server] Listening on ws://localhost:${boundPort} (BATTLE_CALC_VERSION=${BATTLE_CALC_VERSION})`
    );
  })
  .catch((err) => {
    console.error('Failed to start MultiplayerRelayServer:', err);
    process.exit(1);
  });
