import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedLiriosPilot, SEED_PROJECT_ID } from './seed-lirios-piloto.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--serve')) throw new Error('Use npm run dev:lirios sem argumentos.');

function runNode(file, parameters, env) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [file, ...parameters], { stdio: 'inherit', env, windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => resolveExit(code ?? 1));
    // O Firebase CLI recebe Ctrl+C e exporta o estado; não apagamos diretórios ou dados.
    const stop = () => { if (!child.killed) child.kill('SIGINT'); };
    process.once('SIGINT', stop);
    child.once('exit', () => process.removeListener('SIGINT', stop));
  });
}

if (args.includes('--serve')) {
  await seedLiriosPilot();
  console.log('Contas disponíveis em docs/PILOTO_LIRIOS.md. Aplicação local: http://127.0.0.1:5173');
  process.exitCode = await runNode(resolve('node_modules/vite/bin/vite.js'), ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    ...process.env, VITE_USE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: SEED_PROJECT_ID,
    VITE_FIREBASE_API_KEY: 'emulator-only', VITE_FIREBASE_AUTH_DOMAIN: `${SEED_PROJECT_ID}.firebaseapp.com`,
    VITE_FIREBASE_APP_ID: SEED_PROJECT_ID,
  });
} else {
  const dataDirectory = '.firebase/lirios-piloto';
  const parameters = ['emulators:exec', '--project', SEED_PROJECT_ID, '--only', 'auth,firestore',
    ...(existsSync(`${dataDirectory}/firebase-export-metadata.json`) ? ['--import', dataDirectory] : []),
    '--export-on-exit', dataDirectory, 'node --experimental-strip-types scripts/dev-lirios.mjs --serve'];
  console.log(`Ambiente LOCAL de teste. Os dados ficam em ${dataDirectory} (ignorado pelo Git).`);
  console.log('Use Ctrl+C para encerrar e exportar o estado. Não execute simultaneamente com npm run check/test:ui/test:rules.');
  process.exitCode = await runNode(resolve('node_modules/firebase-tools/lib/bin/firebase.js'), parameters, {
    ...process.env, GCLOUD_PROJECT: SEED_PROJECT_ID, GOOGLE_CLOUD_PROJECT: SEED_PROJECT_ID,
    FIREBASE_PROJECT_ID: SEED_PROJECT_ID, FIREBASE_CONFIG: JSON.stringify({ projectId: SEED_PROJECT_ID }),
  });
}
