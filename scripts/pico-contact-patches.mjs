import { fileURLToPath } from 'node:url';

export function patchNativeThunderContact(source, replace, file) {
  const helper = fileURLToPath(new URL('../apstat-park/native-static-contact.mjs', import.meta.url));
  source = `import { resolveNativeStaticPlayerContact } from ${JSON.stringify(helper)};\n` + source;
  return replace(source, 'const thunderAuxiliaryResult = resolveClosedGateCollision(',
    'const thunderAuxiliaryResult = resolveNativeStaticPlayerContact(', file);
}
