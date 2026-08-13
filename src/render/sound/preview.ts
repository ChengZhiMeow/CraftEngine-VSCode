import {
  decodeSoundInboundMessage,
  type SoundInboundMessage,
  type SoundOutboundMessage,
} from "../shared/protocol.js";
import { Messages } from "../../messages.js";
import { element, optionalElement, queryElements } from "../shared/runtime.js";

const vscode = acquireVsCodeApi<unknown, SoundOutboundMessage>();
const volume = element("volume", HTMLInputElement);
const pitch = element("pitch", HTMLInputElement);
const volumeValue = element("volumeValue", HTMLElement);
const pitchValue = element("pitchValue", HTMLElement);
const status = element("status", HTMLElement);
const soundTarget = optionalElement("sound-target", HTMLSelectElement);
let context: AudioContext | undefined;
let source: AudioBufferSourceNode | undefined;
let gain: GainNode | undefined;

function decodeBase64(value: string): ArrayBuffer {
  if (value.length === 0) throw new Error(Messages.web.sound.preview.text0001);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function updateLabels(): void {
  volumeValue.textContent = Number(volume.value).toFixed(2);
  pitchValue.textContent = Number(pitch.value).toFixed(2);
  if (gain) gain.gain.value = Number(volume.value);
  if (source) source.playbackRate.value = Number(pitch.value);
}

function stopCurrent(): void {
  if (source) {
    try {
      source.stop();
      source.disconnect();
    } catch {
      source.disconnect();
    }
    source = undefined;
  }
  if (!gain) return;
  gain.disconnect();
  gain = undefined;
}

volume.addEventListener("input", updateLabels);
pitch.addEventListener("input", updateLabels);
soundTarget?.addEventListener("change", () => {
  stopCurrent();
  status.className = "";
  status.textContent = Messages.web.sound.preview.text0002;
  vscode.postMessage({
    type: "select-target",
    index: Number(soundTarget.value),
  });
});
element("play", HTMLButtonElement).addEventListener("click", () => {
  status.className = "";
  status.textContent = Messages.web.sound.preview.text0003;
  vscode.postMessage({ type: "play" });
});
for (const button of queryElements(".play-file", HTMLButtonElement)) {
  button.addEventListener("click", () => {
    status.className = "";
    status.textContent = Messages.web.sound.preview.text0004;
    vscode.postMessage({
      type: "play-file",
      index: Number(button.dataset.index),
    });
  });
}
element("stop", HTMLButtonElement).addEventListener("click", () => {
  stopCurrent();
  status.textContent = Messages.web.sound.preview.text0005;
  vscode.postMessage({ type: "stop" });
});

async function playSound(
  message: Extract<SoundInboundMessage, { type: "play" }>,
): Promise<void> {
  try {
    vscode.postMessage({ type: "loading", id: message.id });
    stopCurrent();
    context ??= new AudioContext();
    // 这里立即恢复音频, 等待后会丢失播放按钮带来的权限
    const resume =
      context.state === "suspended"
        ? context.resume().catch(() => undefined)
        : Promise.resolve();
    const buffer = await context.decodeAudioData(
      decodeBase64(message.oggBase64),
    );
    source = context.createBufferSource();
    gain = context.createGain();
    source.buffer = buffer;
    volume.value = String(
      Math.max(0, Math.min(4, Number(message.volume) || 0)),
    );
    pitch.value = String(
      Math.max(0.01, Math.min(4, Number(message.pitch) || 1)),
    );
    source.playbackRate.value = message.pitch;
    gain.gain.value = message.volume;
    source.connect(gain).connect(context.destination);
    source.onended = () => {
      status.textContent = Messages.web.sound.preview.text0006(message.id);
      vscode.postMessage({ type: "ended", id: message.id });
    };
    updateLabels();
    source.start();
    await Promise.race([
      resume,
      new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
    ]);
    status.className = "";
    status.textContent = Messages.web.sound.preview.text0007(message.id);
    vscode.postMessage({
      type: "decoded",
      id: message.id,
      state: context.state,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    status.className = "error";
    status.textContent = Messages.web.sound.preview.text0008(detail);
    vscode.postMessage({ type: "playback-error", message: detail });
  }
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = decodeSoundInboundMessage(event.data);
  if (!message) return;

  switch (message.type) {
    case "cache-state":
      for (const value of queryElements(".sound-cache-state", HTMLElement)) {
        if (value.dataset.fileId === message.id)
          value.textContent = message.label;
      }
      return;
    case "error":
      status.className = "error";
      status.textContent = message.message;
      return;
    case "play":
      void playSound(message);
      return;
  }
});
vscode.postMessage({ type: "ready" });
