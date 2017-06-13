'use strict'

const test = require('tape')
const DuplexStream = require('stream').Duplex

const endpoint = require('.')

const FOO = Buffer.from(
	'aef18a02dd912638b08f59dafe69a717cf8ac3af3747dd243c90bf8fd916' +
	'b378c9e7a8ad33b9895e'
, 'hex')
const BAR = Buffer.from(
	'666578e40b1975ac94e93f18ddc66315453b916dada9652deac24350101e' +
	'76f213b8d373ea'
, 'hex')

const fromBuffer = (buf) => {
	let offset = 0
	return (size, cb) => {
		if (offset >= buf.byteLength) return cb(null, null)

		const last = Math.min(offset + size, buf.byteLength)
		const chunk = buf.slice(offset, last)
		offset = last

		cb(null, chunk)
	}
}

const toBuffer = (cb) => {
	let buf = new Buffer()
	return (chunk) => {
		if (chunk === null) return cb(buf)

		buf = Buffer.concat([buf, chunk])
	}
}

test('syncs metadata', (t) => {
	const _data = new DuplexStream()
	const _signaling = new DuplexStream()

	const leader = endpoint(_data, _signaling, true)
	const follower = endpoint(_data, _signaling)

	const fooMeta = {name: 'foo.bin', size: FOO.byteLength}
	follower.add(fromBuffer(FOO), fooMeta)
	const barMeta = {name: 'bar.bin', size: BAR.byteLength}
	leader.add(fromBuffer(BAR), barMeta)

	t.plan(2)
	leader.on('file', (file) => {
		t.deepEqual(file.meta, fooMeta)
	})
	follower.on('file', (file) => {
		t.deepEqual(file.meta, barMeta)
	})
})

test('syncs data 💪', (t) => {
	const _data = new DuplexStream()
	const _signaling = new DuplexStream()

	const leader = endpoint(_data, _signaling, true)
	const follower = endpoint(_data, _signaling)

	follower.add(fromBuffer(FOO))
	leader.add(fromBuffer(BAR))

	t.plan(2)
	leader.on('file', (file) => {
		file.on('data', toBuffer((receivedFoo) => {
			t.equal(Buffer.compare(receivedFoo, FOO))
		}))
	})
	follower.on('file', (file) => {
		file.on('data', toBuffer((receivedBar) => {
			t.equal(Buffer.compare(receivedBar, BAR))
		}))
	})
})
