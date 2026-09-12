import test from 'node:test';
import assert from 'node:assert/strict';
import {RECORDING_MIME_TYPES,selectRecordingMimeType} from '../src/handwalk/recording-codec.mjs';

test('prefers WebM VP8 when available',()=>{
 const checked=[];
 assert.equal(selectRecordingMimeType(type=>{checked.push(type);return type==='video/webm;codecs=vp8';}),'video/webm;codecs=vp8');
 assert.deepEqual(checked,['video/webm;codecs=vp8']);
});

test('falls back to MP4 while preserving the selected MIME string',()=>{
 const supported='video/mp4;codecs=avc1.42E01E';
 assert.equal(selectRecordingMimeType(type=>type===supported),supported);
 assert.ok(RECORDING_MIME_TYPES.indexOf(supported)>RECORDING_MIME_TYPES.indexOf('video/webm'));
});

test('returns empty when format detection is absent, throws, or supports nothing',()=>{
 assert.equal(selectRecordingMimeType(), '');
 assert.equal(selectRecordingMimeType(()=>false), '');
 assert.equal(selectRecordingMimeType(()=>{throw new Error('unsupported probe');}), '');
});
