#!/usr/bin/env node
// poem-on-demand-reader
// Usage: node index.js <path-to-input.txt>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  loadModel,
  completion,
  textToSpeech,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
  TTS_T3_TURBO_EN_CHATTERBOX_Q8_0,
  TTS_S3GEN_EN_CHATTERBOX,
} from '@qvac/sdk';

const inputPath = process.argv[2] || "poem-request.example.txt";

if (!existsSync(inputPath)) {
  console.error('Usage: node index.js <path-to-input-file>');
  process.exit(1);
}

const input = readFileSync(inputPath, 'utf-8').trim();

console.log('Loading language model on-device...');
const llmId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 });

const prompt = `Write a short poem for the request below, following the requested style and using the personal details. It will be read aloud, so keep it natural to speak and avoid symbols.

${input}`;

const { tokenStream } = completion({ modelId: llmId, history: [{ role: 'user', content: prompt }], stream: true });

let output = '';
console.log('\nResult:\n');
for await (const token of tokenStream) {
  process.stdout.write(token);
  output += token;
}
console.log();

writeFileSync("poem.txt", output.trim() + '\n');
await unloadModel({ modelId: llmId });

console.log('\nLoading TTS model to narrate it...');
const ttsId = await loadModel({
  modelSrc: TTS_T3_TURBO_EN_CHATTERBOX_Q8_0,
  modelConfig: { ttsEngine: 'chatterbox', language: 'en', s3genModelSrc: TTS_S3GEN_EN_CHATTERBOX.src, threads: 8 },
});

function writeWav(int16Buffer, sampleRate, outPath) {
  const dataSize = int16Buffer.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  const pcm = Buffer.from(int16Buffer.buffer, int16Buffer.byteOffset, int16Buffer.byteLength);
  writeFileSync(outPath, Buffer.concat([header, pcm]));
}

const { buffer } = textToSpeech({ modelId: ttsId, text: output.trim(), inputType: 'text', stream: false });
const audio = await buffer;
writeWav(audio, 24000, "poem.wav");
console.log('Saved poem.txt and poem.wav');

await unloadModel({ modelId: ttsId });
