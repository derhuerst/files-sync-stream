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



	const endCurrentFile = () => {
		if (currentFile) {
			const file = currentFile
			currentFile = null
			file.status = 'done'
			file.emit('end')
		}
	}

	const startFile = (file) => {
		if (!currentFile || currentFile.id !== file.id) {
			endCurrentFile()

			currentFile = file
			file.status = 'active'
			file.emit('start')
		}
	}

	signaling.on('receive', (fileId) => {
		if (!fileId || !files[fileId]) return
		const file = files[fileId]
		startFile(file)
	})

	signaling.on('send', (fileId) => {
		if (!fileId || !files[fileId]) return
		const file = files[fileId]

		send(file, () => {})
	})

	signaling.on('done', (fileId) => {
		if (!fileId || !files[fileId]) return
		endCurrentFile()
	})



	const send = (file, cb) => { // as leader
		if (!currentFile || currentFile.id !== file.id) startFile(file)

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
				send(file, cb)
			}
		})
	}

	const receive = (file, cb) => { // as leader
		if (!currentFile || currentFile.id !== file.id) startFile(file)
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
					signaling.send('done', file.id)
					next()
				})
			} else {
				signaling.send('send', file.id)
				receive(file, next)
			}

			return // abort loop
		}

		endpoint.emit('done')
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
