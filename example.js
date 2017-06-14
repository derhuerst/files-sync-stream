'use strict'

const multiplex = require('multiplex')

const endpoint = require('.')
const fromBuffer = require('./from-buffer')

// create dummy setup

const streamA = multiplex()
const streamAData = streamA.createSharedStream('data')
const streamASignaling = streamA.createSharedStream('signaling')

const streamB = multiplex()
const streamBData = streamB.createSharedStream('data')
const streamBSignaling = streamB.createSharedStream('signaling')

const A = endpoint(streamAData, streamASignaling, false, 5)
const B = endpoint(streamBData, streamBSignaling, true, 5)

streamA.pipe(streamB).pipe(streamA) // simulate network

// add dummy files

const fooData = Buffer.from('aef18a02dd912638b08f59dafe69a717cf8ac3af', 'hex')
const fooMeta = {name: 'foo-from-A.bin', size: fooData.byteLength}
A.add(fromBuffer(fooData), fooMeta)

const barData = Buffer.from('666578e40b1975ac94e93f18ddc66315453b401e', 'hex')
const barMeta = {name: 'bar-from-B.bin', size: barData.byteLength}
B.add(fromBuffer(barData), barMeta)

// subscribe to events

A.on('file', (file) => {
	console.log('A', file.meta.name, file.id)

	file.on('start', () => console.log('A', file.meta.name, 'start'))
	file.on('end', () => console.log('A', file.meta.name, 'end'))
	file.on('data', () => {
		console.log('A', file.meta.name, file.progress, '/', file.meta.size)
	})
})
A.on('done', () => console.log('A done'))

B.on('file', (file) => {
	console.log('B', file.meta.name, file.id)

	file.on('start', () => console.log('B', file.meta.name, 'start'))
	file.on('end', () => console.log('B', file.meta.name, 'end'))
	file.on('data', () => {
		console.log('B', file.meta.name, file.progress, '/', file.meta.size)
	})
})
B.on('done', () => console.log('B done'))
