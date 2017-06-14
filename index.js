'use strict'

const {EventEmitter} = require('events')

const generateId = () => {
	let n=6, s=''
	while (n--) {
		s += (Math.random() * 16 | 0).toString(16)
	}
	return s
}

const createFile = (metadata, receive = true, id) => {
	const file = new EventEmitter()
	file.id = id || generateId()
	file.metadata = metadata
	file.mode = receive ? 'receive' : 'send'
	file.status = 'queued'
	return file
}

// todo: reconnection logic
// todo: stream error handling

const createEndpoint = (data, signaling, isLeader = false) => {
	signaling.on('data', (msg) => {
		try {
			msg = JSON.parse(msg.toString('utf8'))
		} catch (err) {} // invalid message, ignore this
		if (!msg.type || msg.payload === undefined) return
		signaling.emit(msg.type, msg.payload)
	})
	signaling.send = (type, payload) => {
		const msg = JSON.stringify({type, payload})
		signaling.write(msg)
	}



	const endpoint = new EventEmitter()
	const files = {} // by id
	let currentFile = null
	let done = false

	signaling.on('file', ({id, metadata}) => {
		if (!id) return

		const file = createFile(metadata, true, id)
		files[id] = file
		endpoint.emit('file', file)
	})

	data.on('data', (chunk) => {
		if (!currentFile) return
		currentFile.emit('data', chunk)
	})



	const endCurrentFile = () => {
		if (!currentFile) return
		const file = currentFile

		currentFile = null
		file.status = 'done'
		file.emit('end')
	}

	const startFile = (file) => {
		if (currentFile && currentFile.id === file.id) return
		if (currentFile) endCurrentFile()

		currentFile = file
		file.status = 'active'
		file.emit('start')
	}

	signaling.on('receive', (fileId) => {
		if (!fileId || !files[fileId]) return
		const file = files[fileId]

		startFile(file)
	})

	signaling.on('send', (fileId) => {
		if (!fileId || !files[fileId]) return
		const file = files[fileId]

		send(file, checkIfDone)
	})

	signaling.on('done', (fileId) => {
		if (!fileId || !files[fileId]) return
		endCurrentFile()
	})



	const send = (file, cb) => { // as leader
		startFile(file)

		const step = () => {
			file.read(5, (err, chunk) => {
				if (err) {
					file.status = 'failed'
					file.emit('error', err)
					return
				}

				if (!chunk) { // end of file
					endCurrentFile()
					signaling.send('done', file.id)
					cb()
				} else {
					data.write(chunk)
					step()
				}
			})
		}
		step()
	}

	const receive = (file, cb) => { // as leader
		startFile(file)

		file.once('end', cb)
	}

	const next = () => { // check if there's something to do
		if (!isLeader || currentFile) return

		for (let id in files) {
			const file = files[id]
			if (file.status !== 'queued') continue

			if (file.mode === 'send') {
				signaling.send('receive', file.id)
				send(file, () => {
					next()
				})
			} else {
				receive(file, next)
				signaling.send('send', file.id)
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
	signaling.on('done', checkIfDone)



	const add = (read, metadata = {}) => {
		const file = createFile(metadata, false)
		file.read = read
		files[file.id] = file

		setImmediate(() => {
			endpoint.emit('file', file)
			signaling.send('file', {id: file.id, metadata})
			next()
		})
	}

	endpoint.add = add
	return endpoint
}

module.exports = createEndpoint
