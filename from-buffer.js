'use strict'

const fromBuffer = (buf) => {
	let offset = 0
	return (size, cb) => {
		if (offset >= buf.byteLength) return cb(null, null)

		const last = Math.min(offset + size, buf.byteLength)
		const chunk = buf.slice(offset, last)
		offset = last

		setTimeout(cb, 0, null, chunk)
	}
}

module.exports = fromBuffer
