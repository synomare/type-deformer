import vm from 'node:vm';

// Isolated declaration tests deliberately share a controlled namespace. Editor
// calls still go through renderEngine, and renderer capabilities are explicit
// adapters to the same Canvas/media doubles used by the existing fixture.
export function createAuthoredTestContext(bindings = {}) {
  const context = vm.createContext(bindings);
  if (!('renderEngine' in context)) context.renderEngine = context;
  if (!('createRenderCanvas' in context)) context.createRenderCanvas = () => {
    if (context.document?.createElement) return context.document.createElement('canvas');
    if (context.OffscreenCanvas) return new context.OffscreenCanvas(1, 1);
    throw new Error('The authored render fixture needs an explicit Canvas capability');
  };
  if (!('matchesRenderMedia' in context)) context.matchesRenderMedia = query => !!context.window?.matchMedia?.(query)?.matches;
  if (!('renderedSourceText' in context)) Object.defineProperty(context, 'renderedSourceText', {
    configurable: true,
    get() { return context.textInput?.value || ''; },
    set(value) {
      // Once a fixture commits measured text, subsequent input remains a draft.
      Object.defineProperty(context, 'renderedSourceText', {value, writable: true, configurable: true, enumerable: true});
    }
  });
  return context;
}
