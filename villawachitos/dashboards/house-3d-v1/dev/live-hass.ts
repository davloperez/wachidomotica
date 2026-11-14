import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  type HassEntities as WsEntities,
} from "home-assistant-js-websocket";
import type { HomeAssistant } from "../src/types";

/**
 * Construye un objeto `hass` equivalente al que inyecta Home Assistant,
 * usando una conexión websocket real con un token de larga duración (solo desarrollo).
 */
export async function createLiveHass(
  url: string,
  token: string,
  getDarkMode: () => boolean,
  onUpdate: (hass: HomeAssistant) => void,
): Promise<void> {
  const auth = createLongLivedTokenAuth(url, token);
  const conn = await createConnection({ auth });
  let connected = true;
  let states: WsEntities = {};

  const emit = () =>
    onUpdate({
      states: states as unknown as HomeAssistant["states"],
      connected,
      language: "es",
      locale: { language: "es" },
      themes: { darkMode: getDarkMode() },
      connection: {
        subscribeMessage: (cb, msg) => conn.subscribeMessage(cb, msg as never),
      },
      callWS: (msg) => conn.sendMessagePromise(msg as never),
      callService: (domain, service, data) => callService(conn, domain, service, data),
    });

  conn.addEventListener("disconnected", () => ((connected = false), emit()));
  conn.addEventListener("ready", () => ((connected = true), emit()));
  subscribeEntities(conn, (ents) => {
    states = ents;
    emit();
  });

  window.addEventListener("adv1-dev-refresh", emit);
}
