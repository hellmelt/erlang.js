module.exports = binary_to_term
module.exports.Decoder = Decoder

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//module.exports.term_to_optlist = term_to_optlist
//module.exports.binary_to_optlist = binary_to_optlist

var util = require('util')
var debug = require('debug')('erlang:decode')

var lib = require('./lib.js')

function binary_to_term(term) {
  if (!Buffer.isBuffer(term))
    throw new Error('Not a buffer')
  if (term[0] !== lib.VERSION_MAGIC)
    throw new Error('No magic number ' + lib.VERSION_MAGIC)

  term = term.slice(1) // Cut out the version magic
  var decoder = new Decoder(term)
  var decoded = decoder.decode()

  if (decoder.bin.length !== 0)
    throw new Error('Term encoding has '+decoder.bin.length+' bytes remaining')

  return decoded
}

function Decoder (bin) {
  this.bin = bin || Buffer.from([])
}

Decoder.prototype.decode = function() {
  if (this.bin.length === 0) return null
  var NUM = lib.numbers
  var TAG = lib.tags

  var type_num = this.bin[0]
  var type = lib.numbers[type_num]

  if (!type)
    throw new Error('Unknown magic number: ' + type_num + ' ' + JSON.stringify(this.bin))

  if (!this[type])
    throw new Error('Unknown decoder: ' + type)

  return this[type]()
}

Decoder.prototype.SMALL_INTEGER = function() {
  var term = this.bin.readUInt8(1)
  debug('SMALL_INTEGER: %d', term)
  this.bin = this.bin.slice(2)
  return term
}

Decoder.prototype.INTEGER = function() {
  debug('INTEGER')
  var term = this.bin.readUInt32BE(1)
  this.bin = this.bin.slice(5) // One byte for the tag, four for the 32-bit number.
  return term
}

Decoder.prototype.NEW_FLOAT = function() {
  debug('NEW_FLOAT')
  var term = this.bin.readDoubleBE(1)
  this.bin = this.bin.slice(9) // One byte for the tag, eight for the 64-bit float.
  return term
}

// In erlang, there is no string datatype. A string is a list of integers, that might
// be interpreted as characters when relevant. When the erlang run-time system decodes a list of small
// integers (<256), the list is encoded as STRING_EXT for efficency reasons.
// That is why this function decodes to an array of integers. The array can be converted to a string
// later on, if that is what the application wants.
Decoder.prototype.STRING = function() {
  var start = 1 + 2 // The string tag and the length part
  var length = this.bin.readUInt16BE(1)
  debug('STRING[%j]', length)

  var term = this.bin.slice(start, start + length).toString('utf8')
  this.bin = this.bin.slice(start + length)

  return term
}

Decoder.prototype.ATOM =
Decoder.prototype.ATOM_UTF8 = function() {
  debug('ATOM %j', this.bin)
  var start = 1 + 2 // The string tag and the length part
  var length = this.bin.readUInt16BE(1)
  var end = start + length

  var term = this.bin.slice(start, end).toString('utf8')
  if (term == 'false')
    term = false
  else if (term == 'true')
    term = true
  else if (term == 'nil')
    term = null
  else
    term = {a:term}

  this.bin = this.bin.slice(end)

  return term
}

Decoder.prototype.SMALL_ATOM =
Decoder.prototype.SMALL_ATOM_UTF8 = function() {
  debug('SMALL_ATOM %j', this.bin)
  var start = 1 + 1 // The string tag and the length part
  var length = this.bin.readUInt8(1)
  var end = start + length

  var term = this.bin.slice(start, end).toString('utf8')
  if (term == 'false')
    term = false
  else if (term == 'true')
    term = true
  else if (term == 'nil')
    term = null
  else
    term = {a:term}

  this.bin = this.bin.slice(end)

  return term
}

Decoder.prototype.LIST = function() {
  var length = this.bin.readUInt32BE(1)
  debug('LIST[%d] %j', length, this.bin)
  var term = new Array(length)

  var body = new Decoder(this.bin.slice(5))
  for (var i = 0; i < length; i++)
    term[i] = body.decode()

  if(body.bin[0] !== lib.tags.NIL)
    throw new Error('Non-nil at end of list: ' + JSON.stringify(body.bin))

  // The body's remainder is the new position in the decoding sequence.
  this.bin = body.bin.slice(1) // Slice the array NIL out.
  return term
}

// NIL is an empty list
Decoder.prototype.NIL = function() {
  // Slice of the tag
  this.bin = this.bin.slice(1)
  return []
}

Decoder.prototype.LARGE_TUPLE =
Decoder.prototype.SMALL_TUPLE = function() {
  var tag = this.bin[0]
  if (tag === lib.tags.SMALL_TUPLE) {
    var length = this.bin[1]
    var body = new Decoder(this.bin.slice(2))
  } else if (tag === lib.tags.LARGE_TUPLE) {
    var length = this.bin.readUInt32BE(1)
    var body = new Decoder(this.bin.slice(5))
  } else
    throw new Error('Unknown tuple tag: ' + tag)

  var term = new Array(length)
  for (var i = 0; i < length; i++)
    term[i] = body.decode()

  // The body's remainder is the new position in the decoding sequence.
  this.bin = body.bin

  debug('Small tuple %j', this.bin)
  return {t:term}
}

Decoder.prototype.BINARY = function() {
  var length = this.bin.readUInt32BE(1)
  var start = 1 + 4 // The tag byte, plus four size bytes
  var end = start + length

  debug('BINARY[%j]', length)

  var binary = this.bin.slice(start, end)
  this.bin = this.bin.slice(end)

  return {b:binary}
}

Decoder.prototype.PID = function() {
  this.bin = this.bin.slice(1) // The tag byte
  var node = this.decode()
  var ID = this.bin.readUInt32BE(0)
  var serial = this.bin.readUInt32BE(4)
  var creation = this.bin.readUInt8(8)
  this.bin = this.bin.slice(9) // Two four-byte nummbers, one one-byte number
  return {p: {node, ID, serial, creation}}
}

Decoder.prototype.REFERENCE = function() {
  this.bin = this.bin.slice(1) // The tag byte
  var node = this.decode()
  var ID = this.bin.readUInt32BE(0)
  var creation = this.bin.readUInt8(4)
  this.bin = this.bin.slice(5)
  return {r: {node, creation, ID}}
}

Decoder.prototype.NEW_REFERENCE = function() {
  var length = this.bin.readUInt16BE(1)
  this.bin = this.bin.slice(3) // The tag byte, plus two size bytes
  var node = this.decode()
  var creation = this.bin.readUInt8(0)
  this.bin = this.bin.slice(1)

  var ID = new Array(length)
  for (var i = 0; i < length; i++)
    ID[i] = this.bin.readUInt32BE(i * 4)
  this.bin = this.bin.slice(length * 4)

  return {n: {node, creation, ID}}
}

Decoder.prototype.MAP = function() {
  var length = this.bin.readUInt32BE(1)
  this.bin = this.bin.slice(5) // The tag byte, plus four size bytes
  var map = new Map();
  for (var i = 0; i < length; i++) {
    var key = this.decode()
    var value = this.decode()
    map.set(key, value)
  }
  return map
}

if(require.main === module) {
  var ttb = require('./encode.js')
  var source = [1, 12, 13]
  var bin = ttb(source)
  var term = binary_to_term(bin)
  debug('binary_to_term(%j) -> %j', bin, term)
}
