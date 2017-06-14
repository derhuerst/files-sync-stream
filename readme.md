# files-sync-stream

**Sync files over any transport.** Originally made for [avion](https://github.com/derhuerst/avion). Allows you to sync files (or any blobs of data) between two peers, in both directions.

[![npm version](https://img.shields.io/npm/v/files-sync-stream.svg)](https://www.npmjs.com/package/files-sync-stream)
[![build status](https://img.shields.io/travis/derhuerst/files-sync-stream.svg)](https://travis-ci.org/derhuerst/files-sync-stream)
![ISC-licensed](https://img.shields.io/github/license/derhuerst/files-sync-stream.svg)
[![chat on gitter](https://badges.gitter.im/derhuerst.svg)](https://gitter.im/derhuerst)

- `files-sync-stream` is transport-agnostic. You need to pass two channels: one for sending [signaling](https://en.wikipedia.org/wiki/Signaling_(telecommunications)) data and one for sending chunks of data.
- You decide where and how to store the files. `files-sync-stream` accepts a generic file read function and emits `data` events when receiving data.

Tings still to be implemented:

- Some kind of progress indicator. Specifying a file size should be optional (to support streams).
- Handling of connection loss, including continuing the sync. This needs a basic have/want logic.


## Installing

```shell
npm install files-sync-stream
```


## Usage

This assumes the `dataTransport` and `signalingTransport` streams are connected the other peer somehow. You would do this for both peers.

```js
const createEndpoint = require('files-sync-stream')

// 1st peer

const leader = createEndpoint(dataTransport, signalingTransport, true)

leader.on('file', (file) => {
	file.on('start', () => {
		console.log('leader started receiving', file.id)
	})
	file.on('data', (chunk) => {
		console.log('leader received', chunk.toString('hex'))
	})
	file.on('end', () => {
		console.log('leader finished receiving', file.id)
	})
})
leader.on('done', () => console.log('leader is done'))
```

```js
// 2nd peer

const follower = endpoint(dataTransport, signalingTransport)
follower.on('file', (file) => {
	// …
})
```

Use `endpoint.add(read, metadata)` to transfer a file:

```js
const fromBuffer = require('files-sync-stream/from-buffer')

const data = Buffer.from('aef18a02dd912638', 'hex')
follower.add(fromBuffer(data), {
	name: 'file.bin', size: data.byteLength
})
```


## Contributing

If you have a question or have difficulties using `files-sync-stream`, please double-check your code and setup first. If you think you have found a bug or want to propose a feature, refer to [the issues page](https://github.com/derhuerst/files-sync-stream/issues).
