import type { LayoutInput } from "./layout";

type Request = { id: number; input: LayoutInput };
type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<Request>) => void) => void;
  postMessage: (message: unknown) => void;
};

// The whole ranking runs here, off the main thread: the canvas keeps its 60 frames per
// second. ELK's bundle checks for `document` to tell a page from a worker; inside this
// worker we want its in-process engine, not its own worker protocol.
const scope = self as unknown as WorkerScope & { document?: unknown };
scope.document = {};

const ready = (async () => {
  const [{ default: ELK }, { rankGraph }] = await Promise.all([
    import("elkjs/lib/elk.bundled.js"),
    import("./layout"),
  ]);
  const elk = new ELK();
  return (input: LayoutInput) => rankGraph(elk, input);
})();

scope.addEventListener("message", (event) => {
  const { id, input } = event.data;
  ready
    .then((rank) => rank(input))
    .then(
      (ranked) => scope.postMessage({ id, ranked }),
      (error: unknown) =>
        scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
    );
});

// The bundler loads this module asynchronously: messages sent before this point would be
// lost, so the page waits for this signal.
scope.postMessage({ ready: true });
