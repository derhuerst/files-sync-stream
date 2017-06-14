'use strict'

const test = require('tape')
const {PassThrough} = require('stream')
const duplexer = require('duplexer3')

const endpoint = require('.')

const FOO = Buffer.from(
	'aef18a02dd912638b08f59dafe69a717cf8ac3af3747dd243c90bf8fd916' +
	'b378c9e7a8ad33b9895e'
, 'hex')
const BAR = Buffer.from(
	'666578e40b1975ac94e93f18ddc66315453b916dada9652deac24350101e' +
	'76f213b8d373ea'
, 'hex')

const setup = () => {
	const d1read = new PassThrough()
	const d1write = new PassThrough()
	const d2read = new PassThrough()
	const d2write = new PassThrough()
	d1write.pipe(d2read)
	d2write.pipe(d1read)

	const d1 = duplexer(d1write, d1read)
	const d2 = duplexer(d2write, d2read)

	const s1read = new PassThrough()
	const s1write = new PassThrough()
	const s2read = new PassThrough()
	const s2write = new PassThrough()
	s1write.pipe(s2read)
	s2write.pipe(s1read)

	const s1 = duplexer(s1write, s1read)
	const s2 = duplexer(s2write, s2read)

	return {
		leader: endpoint(d1, s1, true),
		follower: endpoint(d2, s2)
	}
}

const fromBuffer = (buf) => {
	let offset = 0
	return (size, cb) => {
		if (offset >= buf.byteLength) return cb(null, null)

		const last = Math.min(offset + size, buf.byteLength)
		const chunk = buf.slice(offset, last)
		offset = last

		setImmediate(cb, null, chunk)
	}
}

test('syncs metadata', (t) => {
	const {leader, follower} = setup()

	const fooMeta = {name: 'foo.bin', size: FOO.byteLength}
	follower.add(fromBuffer(FOO), fooMeta)
	const barMeta = {name: 'bar.bin', size: BAR.byteLength}
	leader.add(fromBuffer(BAR), barMeta)

	t.plan(2)
	leader.on('file', (file) => {
		t.deepEqual(file.metadata, fooMeta)
	})
	follower.on('file', (file) => {
		t.deepEqual(file.metadata, barMeta)
	})
})

test('syncs data follower -> leader 💪', (t) => {
	const {leader, follower} = setup()
	follower.add(fromBuffer(FOO))
	leader.add(fromBuffer(BAR))
	t.plan(4)

	leader.on('file', (file) => {
		file.on('start', () => {
			t.equal(file.status, 'active')
		})

		let receivedFoo = Buffer.from([])
		file.on('data', (chunk) => {
			receivedFoo = Buffer.concat([receivedFoo, chunk])
		})
		file.on('end', () => {
			t.equal(file.status, 'done')
			t.equal(Buffer.compare(receivedFoo, FOO), 0)
		})
	})

	leader.on('done', (file) => {
		t.pass('endpoint emits done')
	})
})

test.only('syncs data leader -> follower 💪', (t) => {
	const {leader, follower} = setup()
	follower.add(fromBuffer(FOO))
	leader.add(fromBuffer(BAR))
	t.plan(4)

	follower.on('file', (file) => {
		file.on('start', () => {
			t.equal(file.status, 'active')
		})

		let receivedBar = Buffer.from([])
		file.on('data', (chunk) => {
			receivedBar = Buffer.concat([receivedBar, chunk])
		})
		file.on('end', () => {
			t.equal(file.status, 'done')
			t.equal(Buffer.compare(receivedBar, BAR), 0)
		})
	})

	follower.on('done', (file) => {
		t.pass('endpoint emits done')
	})
})
