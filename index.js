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

const createEndpoint = (data, signaling, isLeader) => {
	signaling.on('data', (msg) => {
		try {
			msg = JSON.parse(msg.toString('utf8'))
		} catch (err) {} // invalid message, ignore this
		if (!msg.type || msg.payload === undefined) return
		console.error(isLeader ? 'leader' : 'follower', '<-', msg.type)
		signaling.emit(msg.type, msg.payload)
	})
	signaling.send = (type, payload) => {
		const msg = JSON.stringify({type, payload})
		signaling.write(msg)
	}



	const endpoint = new EventEmitter()
	const files = {} // by id
	let currentFile = null

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



	signaling.on('receive', (fileId) => {
		if (!fileId || !files[fileId]) return
		if (currentFile && currentFile.id === fileId) return

		if (currentFile) currentFile.emit('end')
		currentFile = files[fileId]
		currentFile.emit('start')
	})

	const send = (file, cb) => {
		if (currentFile && currentFile.id !== file.id) {
			currentFile.emit('end')
			file.emit('start')
		}
		currentFile = files[file.id]

		file.read(5, (err, chunk) => {
			if (err) {
				file.emit('error', err)
				return
			}

			if (!chunk) { // end of file
				file.emit('end')
				cb()
			} else {
				data.write(chunk)
				send(file, cb)
			}
		})
	}

	const receive = (file, cb) => {
		if (currentFile && currentFile.id !== file.id) {
			currentFile.emit('end')
			file.emit('start')
		}
		currentFile = files[file.id]

		if (!todo) { // todo: find end
			file.emit('end')
			cb()
		}
	}



	const next = () => { // check if there's something to do
		if (!isLeader || currentFile) return

		for (let id in files) {
			const file = files[id]
			if (file.status === 'queued') {
				if (file.mode === 'send') send(file, next)
				else receive(file, next)
			}
		}
	}



	const add = (read, metadata) => {
		const file = createFile(metadata, false)
		file.read = read
		files[file.id] = file

		signaling.send('file', {id: file.id, metadata})
		// endpoint.emit('file', file)
		next()
	}

	endpoint.add = add
	return endpoint
}

module.exports = createEndpoint
