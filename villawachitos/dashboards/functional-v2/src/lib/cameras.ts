/**
 * Cámaras del panel: lista, imagen instantánea y directo.
 *
 * El directo usa WebRTC a través de Home Assistant (`camera/webrtc/offer`, con go2rtc detrás de Frigate):
 * es lo único realmente fluido y barato para la pantalla. Si no arranca, se cae a MJPEG y, en último
 * extremo, a imágenes que se refrescan cada segundo.
 */
import type { HomeAssistant } from "../types";
import { ROOMS_DEF, EXTRA_CAMERAS } from "../house/rooms";
import { st, isOn } from "./ha";

export interface CamInfo {
  name: string;
  entity: string;
  /** Sensores de movimiento / persona / gato (solo las cámaras de Frigate) */
  motion?: string;
  person?: string;
  cat?: string;
}

/**
 * Aviso de una cámara: `person` (persona, en rojo), `animal` (gato, en ámbar) o vacío.
 * El movimiento no cuenta: solo se resaltan personas y gatos.
 */
export function camAlert(
  hass: HomeAssistant | undefined,
  c: { person?: string; cat?: string },
): "" | "animal" | "person" {
  if (isOn(hass, c.person)) return "person";
  if (isOn(hass, c.cat)) return "animal";
  return "";
}

/** Todas las cámaras con imagen, en el orden del panel. */
export function allCameras(): CamInfo[] {
  const out: CamInfo[] = [];
  for (const r of ROOMS_DEF)
    for (const d of r.devices)
      if (d.type === "cameras")
        for (const c of d.cameras)
          if (c.camera)
            out.push({ name: c.name, entity: c.camera, motion: c.motion, person: c.person, cat: c.cat });
  for (const c of EXTRA_CAMERAS) out.push({ name: c.name, entity: c.camera });
  return out;
}

function url(hass: HomeAssistant | undefined, path: string): string {
  return hass?.hassUrl ? hass.hassUrl(path) : path;
}

/** Imagen instantánea; `stamp` cambia la URL para obligar a descargar una nueva. */
export function snapshotUrl(
  hass: HomeAssistant | undefined,
  entity: string,
  stamp: number,
): string | undefined {
  const pic = st(hass, entity)?.attributes.entity_picture as string | undefined;
  if (!pic) return undefined;
  if (pic.startsWith("data:")) return pic;
  return url(hass, `${pic}${pic.includes("?") ? "&" : "?"}_=${stamp}`);
}

/** Flujo MJPEG de HA (segunda opción si el directo por WebRTC no arranca). */
export function mjpegUrl(hass: HomeAssistant | undefined, entity: string): string | undefined {
  const token = st(hass, entity)?.attributes.access_token as string | undefined;
  return token ? url(hass, `/api/camera_proxy_stream/${entity}?token=${token}`) : undefined;
}

export function isUnavailableCam(hass: HomeAssistant | undefined, entity: string): boolean {
  const s = st(hass, entity)?.state;
  return !s || s === "unavailable";
}

interface RtcEvent {
  type: "session" | "answer" | "candidate" | "error";
  session_id?: string;
  answer?: string;
  candidate?: string | { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
  message?: string;
}

export interface LiveStream {
  stop(): void;
}

/**
 * Abre el directo de una cámara por WebRTC y lo enchufa al `<video>`.
 * `onFail` se llama una sola vez si no llega a conectar (error, rechazo o tiempo agotado).
 */
export async function startLive(
  hass: HomeAssistant,
  entity: string,
  video: HTMLVideoElement,
  onPlaying: () => void,
  onFail: (why: string) => void,
): Promise<LiveStream> {
  let done = false;
  let sessionId: string | undefined;
  const pending: RTCIceCandidate[] = [];
  let unsub: (() => Promise<void>) | undefined;
  let timer = 0;
  let pc: RTCPeerConnection | undefined;

  const stop = () => {
    done = true;
    window.clearTimeout(timer);
    pc?.getReceivers().forEach((r) => r.track.stop());
    pc?.close();
    pc = undefined;
    video.srcObject = null;
    void unsub?.().catch(() => undefined);
  };
  const fail = (why: string) => {
    if (done) return;
    stop();
    onFail(why);
  };

  let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  try {
    const cfg = await hass.callWS<{ configuration?: { iceServers?: RTCIceServer[] } }>({
      type: "camera/webrtc/get_client_config",
      entity_id: entity,
    });
    if (cfg.configuration?.iceServers?.length) iceServers = cfg.configuration.iceServers;
  } catch {
    /* HA antiguo o sin go2rtc: se usa el STUN por defecto */
  }

  pc = new RTCPeerConnection({ iceServers });
  const conn = pc;
  conn.addTransceiver("video", { direction: "recvonly" });
  conn.addTransceiver("audio", { direction: "recvonly" });
  // Sin algún canal de datos, algunos navegadores no generan candidatos ICE
  conn.createDataChannel("dummy_data_channel_to_trigger_ice_candidates");

  conn.addEventListener("track", (ev) => {
    const stream = (video.srcObject as MediaStream | null) ?? new MediaStream();
    stream.addTrack(ev.track);
    video.srcObject = stream;
  });
  conn.addEventListener("connectionstatechange", () => {
    if (conn.connectionState === "connected") window.clearTimeout(timer);
    if (conn.connectionState === "failed") fail("La conexión del directo ha fallado");
  });
  video.addEventListener("playing", () => !done && onPlaying(), { once: true });

  const sendCandidate = (c: RTCIceCandidate) =>
    hass
      .callWS({
        type: "camera/webrtc/candidate",
        entity_id: entity,
        session_id: sessionId,
        candidate: c.toJSON(),
      })
      .catch(() => undefined);
  conn.addEventListener("icecandidate", (ev) => {
    if (!ev.candidate) return;
    if (sessionId) void sendCandidate(ev.candidate);
    else pending.push(ev.candidate);
  });

  const offer = await conn.createOffer();
  await conn.setLocalDescription(offer);

  timer = window.setTimeout(() => fail("El directo tarda demasiado en arrancar"), 12000);
  try {
    unsub = await hass.connection.subscribeMessage<RtcEvent>(
      (ev) => {
        if (done) return;
        if (ev.type === "session") {
          sessionId = ev.session_id;
          pending.splice(0).forEach((c) => void sendCandidate(c));
        } else if (ev.type === "answer" && ev.answer) {
          void conn.setRemoteDescription({ type: "answer", sdp: ev.answer }).catch((e) => fail(String(e)));
        } else if (ev.type === "candidate" && ev.candidate) {
          const c =
            typeof ev.candidate === "string" ? { candidate: ev.candidate, sdpMid: "0" } : ev.candidate;
          void conn.addIceCandidate(c).catch(() => undefined);
        } else if (ev.type === "error") {
          fail(ev.message ?? "Error en el directo");
        }
      },
      { type: "camera/webrtc/offer", entity_id: entity, offer: offer.sdp },
    );
  } catch (err) {
    fail(String((err as { message?: string })?.message ?? err));
  }
  return { stop };
}
