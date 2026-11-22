/**
 * Detaches Web Audio nodes from the audio graph immediately after playback ends
 * and ignores nodes already disconnected on closed/headless contexts.
 */
export function attachOnEndedDisconnect(
  source: AudioScheduledSourceNode,
  ...nodesToDisconnect: AudioNode[]
): void {
  source.onended = () => {
    disconnectAudioNodes(source, ...nodesToDisconnect);
  };
}

export function disconnectAudioNodes(
  ...nodes: (AudioNode | null | undefined)[]
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    try {
      node.disconnect();
    } catch {
      // Ignore already-disconnected or closed AudioContext errors
    }
  }
}
