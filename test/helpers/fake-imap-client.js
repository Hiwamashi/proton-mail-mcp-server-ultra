// Fake imapflow client factory for setImapClientFactory: each connection is a fakeMailbox over the
// same folders, plus connect/usable/logout/close/append. Failures are scripted per method name:
//   failures.push({ method: "fetchOne", error: "Connection closed", disconnect: true })
// The next call of that method on any connection throws once; with disconnect the client also
// stops being usable, like imapflow after a dropped socket. Every connection and every call is recorded.
import { fakeMailbox } from "./fake-mailbox.js";

export function fakeImapFactory(folders) {
  const state = { connections: [], calls: [], failures: [] };

  function wrap(client) {
    for (const [name, fn] of Object.entries(client)) {
      if (typeof fn !== "function" || name === "current") continue;
      client[name] = (...args) => {
        state.calls.push({ connection: state.connections.indexOf(client), method: name, args });
        const index = state.failures.findIndex((f) => f.method === name);
        if (index !== -1) {
          const [failure] = state.failures.splice(index, 1);
          if (failure.disconnect) client.usable = false;
          const error = new Error(failure.error);
          if (failure.code) error.serverResponseCode = failure.code;
          // Async generator methods (fetch) have to fail when iterated.
          if (name === "fetch") return (async function* () { throw error; })();
          return Promise.reject(error);
        }
        return fn(...args);
      };
    }
    return client;
  }

  function factory() {
    const client = fakeMailbox(folders);
    client.usable = false;
    client.connect = async () => {
      client.usable = true;
    };
    client.logout = async () => {
      client.usable = false;
    };
    client.close = () => {
      client.usable = false;
    };
    client.on = () => {};
    client.append = async (path, raw, flags) => {
      if (!folders[path]) throw new Error(`Mailbox doesn't exist: ${path}`);
      const uid = Math.max(0, ...folders[path].messages.map((m) => m.uid)) + 1;
      const text = Buffer.from(raw).toString("utf-8");
      folders[path].messages.push({ uid, flags, raw: text, messageId: text.match(/^Message-ID:\s*(\S+)/im)?.[1] });
      return { destination: path, uid };
    };
    state.connections.push(client);
    return wrap(client);
  }

  return { factory, state, folders };
}
