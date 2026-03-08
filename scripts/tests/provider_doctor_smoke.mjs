import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runDoctor(envPath, envLocalPath) {
  const result = spawnSync('bash', ['scripts/provider_doctor.sh', '--env-path', envPath, '--env-local-path', envLocalPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert(result.status === 0, `provider_doctor should exit 0 (got ${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialos-provider-doctor-'));
  const envPath = path.join(tempDir, '.env');
  const envLocalPath = path.join(tempDir, '.env.local');

  const missingOutput = runDoctor(envPath, envLocalPath);
  assert(missingOutput.includes('.env: missing'), 'provider doctor should report missing .env');
  assert(missingOutput.includes('Demo-ready: yes'), 'provider doctor should report demo-ready on a healthy local machine');
  assert(missingOutput.includes('Embeddings'), 'provider doctor should print the capability matrix');
  assert(missingOutput.includes('degrades to local fallback'), 'provider doctor should explain the local embeddings fallback');

  fs.writeFileSync(envPath, 'OPENAI_API_KEY=test-openai-key\n', 'utf8');
  const openaiOutput = runDoctor(envPath, envLocalPath);
  assert(openaiOutput.includes('effective embeddings provider: openai'), 'provider doctor should resolve OpenAI embeddings when the key exists');
  assert(openaiOutput.includes('Voice note transcription') && openaiOutput.includes('ready now'), 'provider doctor should mark voice transcription ready when OPENAI_API_KEY exists');

  fs.writeFileSync(envPath, 'GLM_API_KEY=test-glm-key\n', 'utf8');
  const glmOutput = runDoctor(envPath, envLocalPath);
  assert(glmOutput.includes('GLM / Z.AI') && glmOutput.includes('Unlock live GLM routing'), 'provider doctor should explain the GLM unlocks');
  assert(glmOutput.includes('GLM yes'), 'provider doctor summary should reflect GLM readiness');

  fs.writeFileSync(envPath, 'FLOCK_API_KEY=test-flock-key\n', 'utf8');
  const flockOutput = runDoctor(envPath, envLocalPath);
  assert(flockOutput.includes('FLock / SDG triage') && flockOutput.includes('Unlock live SDG triage'), 'provider doctor should explain the FLock unlocks');
  assert(flockOutput.includes('FLock yes'), 'provider doctor summary should reflect FLock readiness');

  fs.writeFileSync(envPath, 'TELEGRAM_BOT_TOKEN=test-token\nTELEGRAM_DEFAULT_CHAT_ID=test-chat\n', 'utf8');
  const telegramOutput = runDoctor(envPath, envLocalPath);
  assert(telegramOutput.includes('Telegram') && telegramOutput.includes('Volunteer channel send is available'), 'provider doctor should explain Telegram send readiness');
  assert(telegramOutput.includes('Telegram yes'), 'provider doctor summary should reflect Telegram readiness');

  console.log('provider_doctor_smoke: PASS');
}

main();
