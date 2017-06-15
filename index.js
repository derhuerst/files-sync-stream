'use strict'

const {EventEmitter} = require('events')
const alphanumericId = require('alphanumeric-id')

const createFile = (meta, receive = true, id) => {
	const file = new EventEmitter()
	file.id = id || alphanumericId(8)
	file.meta = meta
	file.mode = receive ? 'receive' : 'send'
	file.status = 'queued'
	file.bytesTransferred = 0
	return file
}

// todo: reconnection logic
// todo: stream error handling

const createEndpoint = (data, signaling, isLeader = false, chunkSize = 1000) => {
	const signals = new EventEmitter()

	signaling.on('data', (msg) => {
		try {
			msg = JSON.parse(msg.toString('utf8'))
		} catch (err) {} // invalid message, ignore this
		if (!msg.type || msg.payload === undefined) return
		signals.emit(msg.type, msg.payload)
	})

	signals.send = (type, payload = null) => {
		const msg = JSON.stringify({type, payload})
		signaling.write(msg)
	}



	const endpoint = new EventEmitter()
	const files = {} // by id
	let currentFile = null
	let done = false

	data.on('data', (chunk) => {
		if (!currentFile) return
		currentFile.bytesTransferred += chunk.byteLength
		currentFile.emit('data', chunk)
		signals.send('ack:' + currentFile.id)
	})



	const endCurrentFile = () => {
		if (!currentFile) return
		const file = currentFile

		currentFile = null
		file.status = 'done'
		file.emit('end')
	}

	const startFile = (file) => {
		if (currentFile) {
			if (currentFile.id === file.id) return
			else endCurrentFile()
		}

		currentFile = file
		file.status = 'active'
		file.emit('start')
	}

	signals.on('receive', (fileId) => {
		if (!fileId || !files[fileId]) return
		const file = files[fileId]

		startFile(file)
	})

	signals.on('send', (fileId) => {
		if (!fileId || !files[fileId]) return
		const file = files[fileId]

		send(file, checkIfDone)
	})

	signals.on('done', (fileId) => {
		if (!fileId || !files[fileId]) return
		endCurrentFile()
	})



	const send = (file, cb) => {
		startFile(file)

		const step = () => {
			file.read(chunkSize, (err, chunk) => {
				if (err) {
					file.status = 'failed'
					file.emit('error', err)
				} else if (!chunk) { // end of file
					endCurrentFile()
					signals.removeListener('ack:' + file.id, step)
					signals.send('done', file.id)
					cb()
				} else {
					data.write(chunk)
					file.bytesTransferred += chunk.byteLength
				}
			})
		}

		step()
		signals.on('ack:' + file.id, step)
	}

	const receive = (file, cb) => {
		startFile(file)
		file.once('end', cb)
	}

	const next = () => { // check if there's something to do
		if (!isLeader || currentFile) return

		for (let id in files) {
			const file = files[id]
			if (file.status !== 'queued') continue

			if (file.mode === 'send') {
				signals.send('receive', file.id)
				send(file, () => {
					next()
				})
			} else {
				receive(file, next)
				signals.send('send', file.id)
			}

			return // abort loop
		}
		checkIfDone()
	}

	const checkIfDone = () => {
		if (done) return

		for (let id in files) {
			if (files[id].status === 'queued') return // abort loop
			if (files[id].status === 'active') return // abort loop
		}

		done = true
		endpoint.emit('done')
	}
	signals.on('done', checkIfDone)



	const add = (read, meta = {}) => {
		const file = createFile(meta, false)
		file.read = read
		files[file.id] = file

		setTimeout(() => {
			signals.send('file', {id: file.id, meta})
			next()
		}, 0)

		return file
	}

	signals.on('file', ({id, meta}) => {
		if (!id) return

		const file = createFile(meta, true, id)
		files[id] = file
		endpoint.emit('file', file)

		setTimeout(next, 0)
	})

	endpoint.files = files
	endpoint.add = add
	return endpoint
}

module.exports = createEndpoint
