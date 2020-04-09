(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

require("web-streams-polyfill");
const webStreams = require('web-streams-node');
const fileReaderStream = require('filereader-stream');
const streamSaver = require('streamsaver');

const numSubClients = 4;
const sessionConfig = { mtu: 16000 };
var client;

(function () {
  client = new nkn.MultiClient({ numSubClients, sessionConfig, tls: true });

  client.listen();

  client.onConnect(() => {
    document.getElementById('local-addr').value = client.addr;
    M.updateTextFields();
  });

  client.onSession(async (session) => {
    console.log(session.localAddr, 'accepted a session from', session.remoteAddr);

    let fileNameLen = await readUint32(session);
    let fileNameEncoded = await readN(session, fileNameLen);
    let fileName = new TextDecoder().decode(fileNameEncoded);
    let fileSize = await readUint32(session);

    displayLog(`Start receiving ${fileName} (${fileSize} bytes) from ${session.remoteAddr}`);

    let sessionStream = session.getReadableStream();
    let downloadStream = streamSaver.createWriteStream(fileName, { size: fileSize });
    let timeStart = Date.now();
    sessionStream.pipeTo(downloadStream).then(() => {
      displayLog(`Finish receiving file ${fileName} (${fileSize} bytes, ${fileSize / (1<<20) / (Date.now() - timeStart) * 1000} MB/s)`);
    }, console.error);
  });

  document.getElementById('send').onclick = async () => {
    let remoteAddr = document.getElementById('remote-addr').value;
    if (!remoteAddr) {
      alert("Please enter receiver's address");
      return;
    }

    let file = document.getElementById('file-input').files[0];
    if (!file) {
      alert("Please select file to send");
      return;
    }

    let session = await client.dial(remoteAddr);
    session.setLinger(-1);
    console.log(session.localAddr, 'dialed a session to', session.remoteAddr);

    let fileNameEncoded = new TextEncoder().encode(file.name);
    await writeUint32(session, fileNameEncoded.length);
    await session.write(fileNameEncoded);
    await writeUint32(session, file.size);

    displayLog(`Start sending ${file.name} (${file.size} bytes) to ${session.remoteAddr}`);

    document.getElementById('file-input').value = '';
    document.getElementById('file-name').value = '';

    let uploadStream = webStreams.toWebReadableStream(fileReaderStream(file));
    let sessionStream = session.getWritableStream(true);
    let timeStart = Date.now();
    uploadStream.pipeTo(sessionStream).then(() => {
      displayLog(`Finish sending file ${file.name} (${file.size} bytes, ${file.size / (1<<20) / (Date.now() - timeStart) * 1000} MB/s)`);
    }, console.error);
  };
})()

function displayLog(content) {
  console.log(content);
  let li=document.createElement('li');
  li.innerHTML = content;
  document.getElementById('log-list').appendChild(li);
}

async function readN(session, n) {
  let buf = new Uint8Array(0);
  while (buf.length < n) {
    buf = mergeUint8Array(buf, await session.read(n - buf.length));
  }
  return buf;
}

async function readUint32(session) {
  let buf = await readN(session, 4);
  let dv = new DataView(buf.buffer);
  return dv.getUint32(0, true);
}

async function writeUint32(session, n) {
  let buffer = new ArrayBuffer(4);
  let dv = new DataView(buffer);
  dv.setUint32(0, n, true);
  await session.write(new Uint8Array(buffer));
}

function mergeUint8Array(head, tail) {
  let merged = new Uint8Array(head.length + tail.length);
  merged.set(head);
  merged.set(tail, head.length);
  return merged;
};

},{"filereader-stream":7,"streamsaver":34,"web-streams-node":38,"web-streams-polyfill":40}],2:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],3:[function(require,module,exports){

},{}],4:[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var customInspectSymbol =
  (typeof Symbol === 'function' && typeof Symbol.for === 'function')
    ? Symbol.for('nodejs.util.inspect.custom')
    : null

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    var proto = { foo: function () { return 42 } }
    Object.setPrototypeOf(proto, Uint8Array.prototype)
    Object.setPrototypeOf(arr, proto)
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  Object.setPrototypeOf(buf, Buffer.prototype)
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw new TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype)
Object.setPrototypeOf(Buffer, Uint8Array)

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(buf, Buffer.prototype)

  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}
if (customInspectSymbol) {
  Buffer.prototype[customInspectSymbol] = Buffer.prototype.inspect
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += hexSliceLookupTable[buf[i]]
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(newBuf, Buffer.prototype)

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  } else if (typeof val === 'boolean') {
    val = Number(val)
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

// Create lookup table for `toString('hex')`
// See: https://github.com/feross/buffer/issues/219
var hexSliceLookupTable = (function () {
  var alphabet = '0123456789abcdef'
  var table = new Array(256)
  for (var i = 0; i < 16; ++i) {
    var i16 = i * 16
    for (var j = 0; j < 16; ++j) {
      table[i16 + j] = alphabet[i] + alphabet[j]
    }
  }
  return table
})()

}).call(this,require("buffer").Buffer)
},{"base64-js":2,"buffer":4,"ieee754":9}],5:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

}).call(this,{"isBuffer":require("../../is-buffer/index.js")})
},{"../../is-buffer/index.js":11}],6:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],7:[function(require,module,exports){
/* global FileReader */
var from2 = require('from2')
var toBuffer = require('typedarray-to-buffer')

module.exports = function (file, options) {
  options = options || {}
  var offset = options.offset || 0
  var chunkSize = options.chunkSize || 1024 * 1024 // default 1MB chunk has tolerable perf on large files
  var fileReader = new FileReader(file)

  var from = from2(function (size, cb) {
    if (offset >= file.size) return cb(null, null)
    fileReader.onloadend = function loaded (event) {
      var data = event.target.result
      if (data instanceof ArrayBuffer) data = toBuffer(new Uint8Array(event.target.result))
      cb(null, data)
    }
    var end = offset + chunkSize
    var slice = file.slice(offset, end)
    fileReader.readAsArrayBuffer(slice)
    offset = end
  })

  from.name = file.name
  from.size = file.size
  from.type = file.type
  from.lastModified = file.lastModified

  fileReader.onerror = function (err) {
    from.destroy(err)
  }

  return from
}

},{"from2":8,"typedarray-to-buffer":36}],8:[function(require,module,exports){
(function (process){
var Readable = require('readable-stream').Readable
var inherits = require('inherits')

module.exports = from2

from2.ctor = ctor
from2.obj = obj

var Proto = ctor()

function toFunction(list) {
  list = list.slice()
  return function (_, cb) {
    var err = null
    var item = list.length ? list.shift() : null
    if (item instanceof Error) {
      err = item
      item = null
    }

    cb(err, item)
  }
}

function from2(opts, read) {
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    read = opts
    opts = {}
  }

  var rs = new Proto(opts)
  rs._from = Array.isArray(read) ? toFunction(read) : (read || noop)
  return rs
}

function ctor(opts, read) {
  if (typeof opts === 'function') {
    read = opts
    opts = {}
  }

  opts = defaults(opts)

  inherits(Class, Readable)
  function Class(override) {
    if (!(this instanceof Class)) return new Class(override)
    this._reading = false
    this._callback = check
    this.destroyed = false
    Readable.call(this, override || opts)

    var self = this
    var hwm = this._readableState.highWaterMark

    function check(err, data) {
      if (self.destroyed) return
      if (err) return self.destroy(err)
      if (data === null) return self.push(null)
      self._reading = false
      if (self.push(data)) self._read(hwm)
    }
  }

  Class.prototype._from = read || noop
  Class.prototype._read = function(size) {
    if (this._reading || this.destroyed) return
    this._reading = true
    this._from(size, this._callback)
  }

  Class.prototype.destroy = function(err) {
    if (this.destroyed) return
    this.destroyed = true

    var self = this
    process.nextTick(function() {
      if (err) self.emit('error', err)
      self.emit('close')
    })
  }

  return Class
}

function obj(opts, read) {
  if (typeof opts === 'function' || Array.isArray(opts)) {
    read = opts
    opts = {}
  }

  opts = defaults(opts)
  opts.objectMode = true
  opts.highWaterMark = 16

  return from2(opts, read)
}

function noop () {}

function defaults(opts) {
  opts = opts || {}
  return opts
}

}).call(this,require('_process'))
},{"_process":16,"inherits":10,"readable-stream":30}],9:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],10:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],11:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],12:[function(require,module,exports){
'use strict';

var isStream = module.exports = function (stream) {
	return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function';
};

isStream.writable = function (stream) {
	return isStream(stream) && stream.writable !== false && typeof stream._write === 'function' && typeof stream._writableState === 'object';
};

isStream.readable = function (stream) {
	return isStream(stream) && stream.readable !== false && typeof stream._read === 'function' && typeof stream._readableState === 'object';
};

isStream.duplex = function (stream) {
	return isStream.writable(stream) && isStream.readable(stream);
};

isStream.transform = function (stream) {
	return isStream.duplex(stream) && typeof stream._transform === 'function' && typeof stream._transformState === 'object';
};

},{}],13:[function(require,module,exports){
module.exports      = isTypedArray
isTypedArray.strict = isStrictTypedArray
isTypedArray.loose  = isLooseTypedArray

var toString = Object.prototype.toString
var names = {
    '[object Int8Array]': true
  , '[object Int16Array]': true
  , '[object Int32Array]': true
  , '[object Uint8Array]': true
  , '[object Uint8ClampedArray]': true
  , '[object Uint16Array]': true
  , '[object Uint32Array]': true
  , '[object Float32Array]': true
  , '[object Float64Array]': true
}

function isTypedArray(arr) {
  return (
       isStrictTypedArray(arr)
    || isLooseTypedArray(arr)
  )
}

function isStrictTypedArray(arr) {
  return (
       arr instanceof Int8Array
    || arr instanceof Int16Array
    || arr instanceof Int32Array
    || arr instanceof Uint8Array
    || arr instanceof Uint8ClampedArray
    || arr instanceof Uint16Array
    || arr instanceof Uint32Array
    || arr instanceof Float32Array
    || arr instanceof Float64Array
  )
}

function isLooseTypedArray(arr) {
  return names[toString.call(arr)]
}

},{}],14:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],15:[function(require,module,exports){
(function (process){
'use strict';

if (typeof process === 'undefined' ||
    !process.version ||
    process.version.indexOf('v0.') === 0 ||
    process.version.indexOf('v1.') === 0 && process.version.indexOf('v1.8.') !== 0) {
  module.exports = { nextTick: nextTick };
} else {
  module.exports = process
}

function nextTick(fn, arg1, arg2, arg3) {
  if (typeof fn !== 'function') {
    throw new TypeError('"callback" argument must be a function');
  }
  var len = arguments.length;
  var args, i;
  switch (len) {
  case 0:
  case 1:
    return process.nextTick(fn);
  case 2:
    return process.nextTick(function afterTickOne() {
      fn.call(null, arg1);
    });
  case 3:
    return process.nextTick(function afterTickTwo() {
      fn.call(null, arg1, arg2);
    });
  case 4:
    return process.nextTick(function afterTickThree() {
      fn.call(null, arg1, arg2, arg3);
    });
  default:
    args = new Array(len - 1);
    i = 0;
    while (i < args.length) {
      args[i++] = arguments[i];
    }
    return process.nextTick(function afterTick() {
      fn.apply(null, args);
    });
  }
}


}).call(this,require('_process'))
},{"_process":16}],16:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],17:[function(require,module,exports){

/* global ReadableStream */

module.exports = nodeToWeb
module.exports.WEBSTREAM_SUPPORT = typeof ReadableStream !== 'undefined'

function nodeToWeb (nodeStream) {
  // Assumes the nodeStream has not ended/closed
  if (!module.exports.WEBSTREAM_SUPPORT) throw new Error('No web ReadableStream support')

  var destroyed = false
  var listeners = {}

  function start (controller) {
    listeners['data'] = onData
    listeners['end'] = onData
    listeners['end'] = onDestroy
    listeners['close'] = onDestroy
    listeners['error'] = onDestroy
    for (var name in listeners) nodeStream.on(name, listeners[name])

    nodeStream.pause()

    function onData (chunk) {
      if (destroyed) return
      controller.enqueue(chunk)
      nodeStream.pause()
    }

    function onDestroy (err) {
      if (destroyed) return
      destroyed = true

      for (var name in listeners) nodeStream.removeListener(name, listeners[name])

      if (err) controller.error(err)
      else controller.close()
    }
  }

  function pull () {
    if (destroyed) return
    nodeStream.resume()
  }

  function cancel () {
    destroyed = true

    for (var name in listeners) nodeStream.removeListener(name, listeners[name])

    nodeStream.push(null)
    nodeStream.pause()
    if (nodeStream.destroy) nodeStream.destroy()
    else if (nodeStream.close) nodeStream.close()
  }

  return new ReadableStream({start: start, pull: pull, cancel: cancel})
}

},{}],18:[function(require,module,exports){
module.exports = require('./lib/_stream_duplex.js');

},{"./lib/_stream_duplex.js":19}],19:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }return keys;
};
/*</replacement>*/

module.exports = Duplex;

/*<replacement>*/
var util = Object.create(require('core-util-is'));
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

{
  // avoid scope creep, the keys array can then be collected
  var keys = objectKeys(Writable.prototype);
  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._writableState.highWaterMark;
  }
});

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  pna.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }
    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});

Duplex.prototype._destroy = function (err, cb) {
  this.push(null);
  this.end();

  pna.nextTick(cb, err);
};
},{"./_stream_readable":21,"./_stream_writable":23,"core-util-is":5,"inherits":10,"process-nextick-args":15}],20:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = Object.create(require('core-util-is'));
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
},{"./_stream_transform":22,"core-util-is":5,"inherits":10}],21:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;

/*<replacement>*/
var EE = require('events').EventEmitter;

var EElistenerCount = function (emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

/*<replacement>*/
var util = Object.create(require('core-util-is'));
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var debugUtil = require('util');
var debug = void 0;
if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/

var BufferList = require('./internal/streams/BufferList');
var destroyImpl = require('./internal/streams/destroy');
var StringDecoder;

util.inherits(Readable, Stream);

var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn);

  // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.
  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var readableHwm = options.readableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // has it been destroyed
  this.destroyed = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined) {
      return false;
    }
    return this._readableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
  }
});

Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;
Readable.prototype._destroy = function (err, cb) {
  this.push(null);
  cb(err);
};

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;
      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }
      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  var state = stream._readableState;
  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);
    if (er) {
      stream.emit('error', er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) stream.emit('error', new Error('stream.unshift() after end event'));else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        stream.emit('error', new Error('stream.push() after EOF'));
      } else {
        state.reading = false;
        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
    }
  }

  return needMoreData(state);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    stream.emit('data', chunk);
    stream.read(0);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

    if (state.needReadable) emitReadable(stream);
  }
  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;
  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) pna.nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    pna.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('_read() is not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;

  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) pna.nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');
    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = { hasUnpiped: false };

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, unpipeInfo);
    }return this;
  }

  // try to find the right one.
  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;

  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this, unpipeInfo);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        pna.nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    pna.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;

  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  }

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  this._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._readableState.highWaterMark;
  }
});

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    pna.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./_stream_duplex":19,"./internal/streams/BufferList":24,"./internal/streams/destroy":25,"./internal/streams/stream":26,"_process":16,"core-util-is":5,"events":6,"inherits":10,"isarray":14,"process-nextick-args":15,"safe-buffer":27,"string_decoder/":28,"util":3}],22:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

'use strict';

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = Object.create(require('core-util-is'));
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) {
    return this.emit('error', new Error('write callback called multiple times'));
  }

  ts.writechunk = null;
  ts.writecb = null;

  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);

  cb(er);

  var rs = this._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  };

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  // When the writable side finishes, then flush out anything remaining.
  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function') {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('_transform() is not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  var _this2 = this;

  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
    _this2.emit('close');
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);

  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  if (stream._writableState.length) throw new Error('Calling transform done when ws.length != 0');

  if (stream._transformState.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}
},{"./_stream_duplex":19,"core-util-is":5,"inherits":10}],23:[function(require,module,exports){
(function (process,global,setImmediate){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

module.exports = Writable;

/* <replacement> */
function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;
  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/
var asyncWrite = !process.browser && ['v0.10', 'v0.9.'].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;

/*<replacement>*/
var util = Object.create(require('core-util-is'));
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

var destroyImpl = require('./internal/streams/destroy');

util.inherits(Writable, Stream);

function nop() {}

function WritableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var writableHwm = options.writableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // if _final has been called
  this.finalCalled = false;

  // drain event flag.
  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // has it been destroyed
  this.destroyed = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function () {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})();

// Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.
var realHasInstance;
if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function (object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;

      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function (object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.

  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
    return new Writable(options);
  }

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;

    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  pna.nextTick(cb, er);
}

// Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;

  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    pna.nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;
  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._writableState.highWaterMark;
  }
});

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);
    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    pna.nextTick(cb, er);
    // this can emit finish, and it will always happen
    // after error
    pna.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
    // this can emit finish, but finish must
    // always follow error
    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
      asyncWrite(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    var allBuffers = true;
    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }
    buffer.allBuffers = allBuffers;

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('_write() is not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}
function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;
    if (err) {
      stream.emit('error', err);
    }
    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}
function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function') {
      state.pendingcb++;
      state.finalCalled = true;
      pna.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    prefinish(stream, state);
    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) pna.nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;
  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  }
  if (state.corkedRequestsFree) {
    state.corkedRequestsFree.next = corkReq;
  } else {
    state.corkedRequestsFree = corkReq;
  }
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  get: function () {
    if (this._writableState === undefined) {
      return false;
    }
    return this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._writableState.destroyed = value;
  }
});

Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;
Writable.prototype._destroy = function (err, cb) {
  this.end();
  cb(err);
};
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("timers").setImmediate)
},{"./_stream_duplex":19,"./internal/streams/destroy":25,"./internal/streams/stream":26,"_process":16,"core-util-is":5,"inherits":10,"process-nextick-args":15,"safe-buffer":27,"timers":35,"util-deprecate":37}],24:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Buffer = require('safe-buffer').Buffer;
var util = require('util');

function copyBuffer(src, target, offset) {
  src.copy(target, offset);
}

module.exports = function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  BufferList.prototype.push = function push(v) {
    var entry = { data: v, next: null };
    if (this.length > 0) this.tail.next = entry;else this.head = entry;
    this.tail = entry;
    ++this.length;
  };

  BufferList.prototype.unshift = function unshift(v) {
    var entry = { data: v, next: this.head };
    if (this.length === 0) this.tail = entry;
    this.head = entry;
    ++this.length;
  };

  BufferList.prototype.shift = function shift() {
    if (this.length === 0) return;
    var ret = this.head.data;
    if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
    --this.length;
    return ret;
  };

  BufferList.prototype.clear = function clear() {
    this.head = this.tail = null;
    this.length = 0;
  };

  BufferList.prototype.join = function join(s) {
    if (this.length === 0) return '';
    var p = this.head;
    var ret = '' + p.data;
    while (p = p.next) {
      ret += s + p.data;
    }return ret;
  };

  BufferList.prototype.concat = function concat(n) {
    if (this.length === 0) return Buffer.alloc(0);
    if (this.length === 1) return this.head.data;
    var ret = Buffer.allocUnsafe(n >>> 0);
    var p = this.head;
    var i = 0;
    while (p) {
      copyBuffer(p.data, ret, i);
      i += p.data.length;
      p = p.next;
    }
    return ret;
  };

  return BufferList;
}();

if (util && util.inspect && util.inspect.custom) {
  module.exports.prototype[util.inspect.custom] = function () {
    var obj = util.inspect({ length: this.length });
    return this.constructor.name + ' ' + obj;
  };
}
},{"safe-buffer":27,"util":3}],25:[function(require,module,exports){
'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

// undocumented cb() API, needed for core, not for public API
function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err && (!this._writableState || !this._writableState.errorEmitted)) {
      pna.nextTick(emitErrorNT, this, err);
    }
    return this;
  }

  // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks

  if (this._readableState) {
    this._readableState.destroyed = true;
  }

  // if this is a duplex stream mark the writable part as destroyed as well
  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      pna.nextTick(emitErrorNT, _this, err);
      if (_this._writableState) {
        _this._writableState.errorEmitted = true;
      }
    } else if (cb) {
      cb(err);
    }
  });

  return this;
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy
};
},{"process-nextick-args":15}],26:[function(require,module,exports){
module.exports = require('events').EventEmitter;

},{"events":6}],27:[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer')
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}

},{"buffer":4}],28:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}
},{"safe-buffer":27}],29:[function(require,module,exports){
module.exports = require('./readable').PassThrough

},{"./readable":30}],30:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = exports;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":19,"./lib/_stream_passthrough.js":20,"./lib/_stream_readable.js":21,"./lib/_stream_transform.js":22,"./lib/_stream_writable.js":23}],31:[function(require,module,exports){
module.exports = require('./readable').Transform

},{"./readable":30}],32:[function(require,module,exports){
module.exports = require('./lib/_stream_writable.js');

},{"./lib/_stream_writable.js":23}],33:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":6,"inherits":10,"readable-stream/duplex.js":18,"readable-stream/passthrough.js":29,"readable-stream/readable.js":30,"readable-stream/transform.js":31,"readable-stream/writable.js":32}],34:[function(require,module,exports){
/* global chrome location ReadableStream define MessageChannel TransformStream */

;((name, definition) => {
  typeof module !== 'undefined'
    ? module.exports = definition()
    : typeof define === 'function' && typeof define.amd === 'object'
      ? define(definition)
      : this[name] = definition()
})('streamSaver', () => {
  'use strict'

  let mitmTransporter = null
  let supportsTransferable = false
  const test = fn => { try { fn() } catch (e) {} }
  const ponyfill = window.WebStreamsPolyfill || {}
  const isSecureContext = window.isSecureContext
  let useBlobFallback = /constructor/i.test(window.HTMLElement) || !!window.safari
  const downloadStrategy = isSecureContext || 'MozAppearance' in document.documentElement.style
    ? 'iframe'
    : 'navigate'

  const streamSaver = {
    createWriteStream,
    WritableStream: window.WritableStream || ponyfill.WritableStream,
    supported: true,
    version: { full: '2.0.0', major: 2, minor: 0, dot: 0 },
    mitm: 'https://jimmywarting.github.io/StreamSaver.js/mitm.html?version=2.0.0'
  }

  /**
   * create a hidden iframe and append it to the DOM (body)
   *
   * @param  {string} src page to load
   * @return {HTMLIFrameElement} page to load
   */
  function makeIframe (src) {
    if (!src) throw new Error('meh')
    const iframe = document.createElement('iframe')
    iframe.hidden = true
    iframe.src = src
    iframe.loaded = false
    iframe.name = 'iframe'
    iframe.isIframe = true
    iframe.postMessage = (...args) => iframe.contentWindow.postMessage(...args)
    iframe.addEventListener('load', () => {
      iframe.loaded = true
    }, { once: true })
    document.body.appendChild(iframe)
    return iframe
  }

  /**
   * create a popup that simulates the basic things
   * of what a iframe can do
   *
   * @param  {string} src page to load
   * @return {object}     iframe like object
   */
  function makePopup (src) {
    const options = 'width=200,height=100'
    const delegate = document.createDocumentFragment()
    const popup = {
      frame: window.open(src, 'popup', options),
      loaded: false,
      isIframe: false,
      isPopup: true,
      remove () { popup.frame.close() },
      addEventListener (...args) { delegate.addEventListener(...args) },
      dispatchEvent (...args) { delegate.dispatchEvent(...args) },
      removeEventListener (...args) { delegate.removeEventListener(...args) },
      postMessage (...args) { popup.frame.postMessage(...args) }
    }

    const onReady = evt => {
      if (evt.source === popup.frame) {
        popup.loaded = true
        window.removeEventListener('message', onReady)
        popup.dispatchEvent(new Event('load'))
      }
    }

    window.addEventListener('message', onReady)

    return popup
  }

  try {
    // We can't look for service worker since it may still work on http
    new Response(new ReadableStream())
    if (isSecureContext && !('serviceWorker' in navigator)) {
      useBlobFallback = true
    }
  } catch (err) {
    useBlobFallback = true
  }

  test(() => {
    // Transfariable stream was first enabled in chrome v73 behind a flag
    const { readable } = new TransformStream()
    const mc = new MessageChannel()
    mc.port1.postMessage(readable, [readable])
    mc.port1.close()
    mc.port2.close()
    supportsTransferable = true
    // Freeze TransformStream object (can only work with native)
    Object.defineProperty(streamSaver, 'TransformStream', {
      configurable: false,
      writable: false,
      value: TransformStream
    })
  })

  function loadTransporter () {
    if (!mitmTransporter) {
      mitmTransporter = isSecureContext
        ? makeIframe(streamSaver.mitm)
        : makePopup(streamSaver.mitm)
    }
  }

  /**
   * @param  {string} filename filename that should be used
   * @param  {object} options  [description]
   * @param  {number} size     depricated
   * @return {WritableStream}
   */
  function createWriteStream (filename, options, size) {
    let opts = {
      size: null,
      pathname: null,
      writableStrategy: undefined,
      readableStrategy: undefined
    }

    // normalize arguments
    if (Number.isFinite(options)) {
      [ size, options ] = [ options, size ]
      console.warn('[StreamSaver] Depricated pass an object as 2nd argument when creating a write stream')
      opts.size = size
      opts.writableStrategy = options
    } else if (options && options.highWaterMark) {
      console.warn('[StreamSaver] Depricated pass an object as 2nd argument when creating a write stream')
      opts.size = size
      opts.writableStrategy = options
    } else {
      opts = options || {}
    }
    if (!useBlobFallback) {
      loadTransporter()

      var bytesWritten = 0 // by StreamSaver.js (not the service worker)
      var downloadUrl = null
      var channel = new MessageChannel()

      // Make filename RFC5987 compatible
      filename = encodeURIComponent(filename.replace(/\//g, ':'))
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A')

      const response = {
        transferringReadable: supportsTransferable,
        pathname: opts.pathname || Math.random().toString().slice(-6) + '/' + filename,
        headers: {
          'Content-Type': 'application/octet-stream; charset=utf-8',
          'Content-Disposition': "attachment; filename*=UTF-8''" + filename
        }
      }

      if (opts.size) {
        response.headers['Content-Length'] = opts.size
      }

      const args = [ response, '*', [ channel.port2 ] ]

      if (supportsTransferable) {
        const transformer = downloadStrategy === 'iframe' ? undefined : {
          // This transformer & flush method is only used by insecure context.
          transform (chunk, controller) {
            bytesWritten += chunk.length
            controller.enqueue(chunk)

            if (downloadUrl) {
              location.href = downloadUrl
              downloadUrl = null
            }
          },
          flush () {
            if (downloadUrl) {
              location.href = downloadUrl
            }
          }
        }
        var ts = new streamSaver.TransformStream(
          transformer,
          opts.writableStrategy,
          opts.readableStrategy
        )
        const readableStream = ts.readable

        channel.port1.postMessage({ readableStream }, [ readableStream ])
      }

      channel.port1.onmessage = evt => {
        // Service worker sent us a link that we should open.
        if (evt.data.download) {
          // Special treatment for popup...
          if (downloadStrategy === 'navigate') {
            mitmTransporter.remove()
            mitmTransporter = null
            if (bytesWritten) {
              location.href = evt.data.download
            } else {
              downloadUrl = evt.data.download
            }
          } else {
            if (mitmTransporter.isPopup) {
              mitmTransporter.remove()
              // Special case for firefox, they can keep sw alive with fetch
              if (downloadStrategy === 'iframe') {
                makeIframe(streamSaver.mitm)
              }
            }

            // We never remove this iframes b/c it can interrupt saving
            makeIframe(evt.data.download)
          }
        }
      }

      if (mitmTransporter.loaded) {
        mitmTransporter.postMessage(...args)
      } else {
        mitmTransporter.addEventListener('load', () => {
          mitmTransporter.postMessage(...args)
        }, { once: true })
      }
    }

    let chunks = []

    return (!useBlobFallback && ts && ts.writable) || new streamSaver.WritableStream({
      write (chunk) {
        if (useBlobFallback) {
          // Safari... The new IE6
          // https://github.com/jimmywarting/StreamSaver.js/issues/69
          //
          // even doe it has everything it fails to download anything
          // that comes from the service worker..!
          chunks.push(chunk)
          return
        }

        // is called when a new chunk of data is ready to be written
        // to the underlying sink. It can return a promise to signal
        // success or failure of the write operation. The stream
        // implementation guarantees that this method will be called
        // only after previous writes have succeeded, and never after
        // close or abort is called.

        // TODO: Kind of important that service worker respond back when
        // it has been written. Otherwise we can't handle backpressure
        // EDIT: Transfarable streams solvs this...
        channel.port1.postMessage(chunk)
        bytesWritten += chunk.length

        if (downloadUrl) {
          location.href = downloadUrl
          downloadUrl = null
        }
      },
      close () {
        if (useBlobFallback) {
          const blob = new Blob(chunks, { type: 'application/octet-stream; charset=utf-8' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = filename
          link.click()
        } else {
          channel.port1.postMessage('end')
        }
      },
      abort () {
        chunks = []
        channel.port1.postMessage('abort')
        channel.port1.onmessage = null
        channel.port1.close()
        channel.port2.close()
        channel = null
      }
    }, opts.writableStrategy)
  }

  return streamSaver
})

},{}],35:[function(require,module,exports){
(function (setImmediate,clearImmediate){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
}).call(this,require("timers").setImmediate,require("timers").clearImmediate)
},{"process/browser.js":16,"timers":35}],36:[function(require,module,exports){
(function (Buffer){
/**
 * Convert a typed array to a Buffer without a copy
 *
 * Author:   Feross Aboukhadijeh <https://feross.org>
 * License:  MIT
 *
 * `npm install typedarray-to-buffer`
 */

var isTypedArray = require('is-typedarray').strict

module.exports = function typedarrayToBuffer (arr) {
  if (isTypedArray(arr)) {
    // To avoid a copy, use the typed array's underlying ArrayBuffer to back new Buffer
    var buf = Buffer.from(arr.buffer)
    if (arr.byteLength !== arr.buffer.byteLength) {
      // Respect the "view", i.e. byteOffset and byteLength, without doing a copy
      buf = buf.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)
    }
    return buf
  } else {
    // Pass through all other types to `Buffer.from`
    return Buffer.from(arr)
  }
}

}).call(this,require("buffer").Buffer)
},{"buffer":4,"is-typedarray":13}],37:[function(require,module,exports){
(function (global){

/**
 * Module exports.
 */

module.exports = deprecate;

/**
 * Mark that a method should not be used.
 * Returns a modified function which warns once by default.
 *
 * If `localStorage.noDeprecation = true` is set, then it is a no-op.
 *
 * If `localStorage.throwDeprecation = true` is set, then deprecated functions
 * will throw an Error when invoked.
 *
 * If `localStorage.traceDeprecation = true` is set, then deprecated functions
 * will invoke `console.trace()` instead of `console.error()`.
 *
 * @param {Function} fn - the function to deprecate
 * @param {String} msg - the string to print to the console when `fn` is invoked
 * @returns {Function} a new "deprecated" version of `fn`
 * @api public
 */

function deprecate (fn, msg) {
  if (config('noDeprecation')) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (config('throwDeprecation')) {
        throw new Error(msg);
      } else if (config('traceDeprecation')) {
        console.trace(msg);
      } else {
        console.warn(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

/**
 * Checks `localStorage` for boolean values for the given `name`.
 *
 * @param {String} name
 * @returns {Boolean}
 * @api private
 */

function config (name) {
  // accessing global.localStorage can trigger a DOMException in sandboxed iframes
  try {
    if (!global.localStorage) return false;
  } catch (_) {
    return false;
  }
  var val = global.localStorage[name];
  if (null == val) return false;
  return String(val).toLowerCase() === 'true';
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],38:[function(require,module,exports){
(function (Buffer){
'use strict';
const nodeStream = require('stream');
const isNodeStream = require('is-stream');
const conversions = require('./lib/conversions');

module.exports = require('web-streams-ponyfill');

/**
 * Convert Web streams to Node streams. Until WritableStream / TransformStream
 * is finalized, only ReadableStream is supported.
 *
 * @param {ReadableStream} stream, a web stream.
 * @return {stream.Readable}, a Node Readable stream.
 */
module.exports.toNodeReadable = function(stream) {
    if (stream instanceof module.exports.ReadableStream
        || stream && typeof stream.getReader === 'function') {
        return conversions.readable.webToNode(stream);
    } else {
        throw new TypeError("Expected a ReadableStream.");
    }
};

/**
 * Convert Node Readable streams, an Array, Buffer or String to a Web
 * ReadableStream.
 *
 * @param {Readable|Array|Buffer|String} stream, a Node Readable stream,
 * Array, Buffer or String.
 * @return {ReadableStream}, a web ReadableStream.
 */
module.exports.toWebReadableStream = function(stream) {
    if (isNodeStream(stream) && stream.readable) {
        return conversions.readable.nodeToWeb(stream);
    } else if (Array.isArray(stream)) {
        return conversions.readable.arrayToWeb(stream);
    } else if (Buffer.isBuffer(stream) || typeof stream === 'string') {
        return conversions.readable.arrayToWeb([stream]);
    } else {
        throw new TypeError("Expected a Node streams.Readable, an Array, Buffer or String.");
    }
};

}).call(this,{"isBuffer":require("../is-buffer/index.js")})
},{"../is-buffer/index.js":11,"./lib/conversions":39,"is-stream":12,"stream":33,"web-streams-ponyfill":41}],39:[function(require,module,exports){
(function (global){
'use strict';

const Readable = require('stream').Readable;
const ReadableStream = require('web-streams-ponyfill').ReadableStream;

/**
 * Web / node stream conversion functions
 */
global.ReadableStream = global.ReadableStream || ReadableStream;
// TODO: The module 'readable-stream-node-to-web' expects `ReadableStream` in globals
const readableNodeToWeb = require('readable-stream-node-to-web');

/**
 * ReadableStream wrapping an array.
 *
 * @param {Array} arr, the array to wrap into a stream.
 * @return {ReadableStream}
 */
function arrayToWeb(arr) {
    return new ReadableStream({
        start(controller) {
            for (var i = 0; i < arr.length; i++) {
                controller.enqueue(arr[i]);
            }
            controller.close();
        }
    });
}


class NodeReadable extends Readable {
    constructor(webStream, options) {
        super(options);
        this._webStream = webStream;
        this._reader = webStream.getReader();
        this._reading = false;
    }

    _read(size) {
        if (this._reading) {
            return;
        }
        this._reading = true;
        const doRead = () => {
            this._reader.read()
                .then(res => {
                    if (this._doneReading) {
                        this._reading = false;
                        this._reader.releaseLock();
                        this._doneReading();
                    }
                    if (res.done) {
                        this.push(null);
                        this._reading = false;
                        this._reader.releaseLock();
                        return;
                    }
                    if (this.push(res.value)) {
                        return doRead(size);
                    } else {
                        this._reading = false;
                        this._reader.releaseLock();
                    }
                });
        };
        doRead();
    }
    
    _destroy(err, callback) {
        if (this._reading) {
            const promise = new Promise(resolve => {
                this._doneReading = resolve;
            });
            promise.then(() => this._handleDestroy(err, callback));
        } else {
            this._handleDestroy(err, callback);
        }
    }
        
    _handleDestroy(err, callback) {
        this._webStream.cancel();
        super._destroy(err, callback);
    }
}

function readableWebToNode(webStream) {
    return new NodeReadable(webStream);
}

module.exports = {
    readable: {
        nodeToWeb: readableNodeToWeb,
        arrayToWeb: arrayToWeb,
        webToNode: readableWebToNode,
    },
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"readable-stream-node-to-web":17,"stream":33,"web-streams-ponyfill":41}],40:[function(require,module,exports){
(function (global){
!function(e,r){"object"==typeof exports&&"undefined"!=typeof module?r(exports):"function"==typeof define&&define.amd?define(["exports"],r):r((e=e||self).WebStreamsPolyfill={})}(this,function(e){"use strict";var r="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?Symbol:function(e){return"Symbol("+e+")"};function t(){}var o="undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:void 0,n=Number.isNaN||function(e){return e!=e},i=t;function a(e){return"object"==typeof e&&null!==e||"function"==typeof e}function u(e){return e.slice()}function s(e){return!1!==function(e){if("number"!=typeof e)return!1;if(n(e))return!1;if(e<0)return!1;return!0}(e)&&e!==1/0}function l(e,r,t){if("function"!=typeof e)throw new TypeError("Argument is not a function");return Function.prototype.apply.call(e,r,t)}function c(e,r,t,o){var n=e[r];if(void 0!==n){if("function"!=typeof n)throw new TypeError(n+" is not a method");switch(t){case 0:return function(){return f(n,e,o)};case 1:return function(r){var t=[r].concat(o);return f(n,e,t)}}}return function(){return g(void 0)}}function d(e,r,t){var o=e[r];if(void 0!==o)return l(o,e,t)}function f(e,r,t){try{return g(l(e,r,t))}catch(e){return S(e)}}function _(e){return e}function h(e){if(e=Number(e),n(e)||e<0)throw new RangeError("highWaterMark property of a queuing strategy must be non-negative and non-NaN");return e}function b(e){if(void 0===e)return function(){return 1};if("function"!=typeof e)throw new TypeError("size property of a queuing strategy must be a function");return function(r){return e(r)}}var p=Promise,y=Promise.prototype.then,v=Promise.resolve.bind(p),m=Promise.reject.bind(p);function w(e){return new p(e)}function g(e){return v(e)}function S(e){return m(e)}function R(e,r,t){return y.call(e,r,t)}function T(e,r,t){R(R(e,r,t),void 0,i)}function q(e,r){T(e,r)}function E(e,r){T(e,void 0,r)}function P(e,r,t){return R(e,r,t)}function C(e){R(e,void 0,i)}var A=function(){function e(){this._cursor=0,this._size=0,this._front={_elements:[],_next:void 0},this._back=this._front,this._cursor=0,this._size=0}return Object.defineProperty(e.prototype,"length",{get:function(){return this._size},enumerable:!0,configurable:!0}),e.prototype.push=function(e){var r=this._back,t=r;16383===r._elements.length&&(t={_elements:[],_next:void 0}),r._elements.push(e),t!==r&&(this._back=t,r._next=t),++this._size},e.prototype.shift=function(){var e=this._front,r=e,t=this._cursor,o=t+1,n=e._elements,i=n[t];return 16384===o&&(r=e._next,o=0),--this._size,this._cursor=o,e!==r&&(this._front=r),n[t]=void 0,i},e.prototype.forEach=function(e){for(var r=this._cursor,t=this._front,o=t._elements;!(r===o.length&&void 0===t._next||r===o.length&&(r=0,0===(o=(t=t._next)._elements).length));)e(o[r]),++r},e.prototype.peek=function(){var e=this._front,r=this._cursor;return e._elements[r]},e}();function O(e,r,t){var o=null;!0===t&&(o=Object.prototype);var n=Object.create(o);return n.value=e,n.done=r,n}function j(e,r){e._forAuthorCode=!0,e._ownerReadableStream=r,r._reader=e,"readable"===r._state?B(e):"closed"===r._state?function(e){B(e),L(e)}(e):I(e,r._storedError)}function W(e,r){return Dr(e._ownerReadableStream,r)}function k(e){"readable"===e._ownerReadableStream._state?F(e,new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")):function(e,r){I(e,r)}(e,new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")),e._ownerReadableStream._reader=void 0,e._ownerReadableStream=void 0}function z(e){return new TypeError("Cannot "+e+" a stream using a released reader")}function B(e){e._closedPromise=w(function(r,t){e._closedPromise_resolve=r,e._closedPromise_reject=t})}function I(e,r){B(e),F(e,r)}function F(e,r){C(e._closedPromise),e._closedPromise_reject(r),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0}function L(e){e._closedPromise_resolve(void 0),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0}var M=r("[[CancelSteps]]"),x=r("[[PullSteps]]");function D(e,r){void 0===r&&(r=!1);var t=new G(e);return t._forAuthorCode=r,t}function N(e){return w(function(r,t){var o={_resolve:r,_reject:t};e._reader._readRequests.push(o)})}function Y(e,r,t){var o=e._reader;o._readRequests.shift()._resolve(O(r,t,o._forAuthorCode))}function H(e){return e._reader._readRequests.length}function U(e){var r=e._reader;return void 0!==r&&!!J(r)}var V,Q,G=function(){function e(e){if(!1===Mr(e))throw new TypeError("ReadableStreamDefaultReader can only be constructed with a ReadableStream instance");if(!0===xr(e))throw new TypeError("This stream has already been locked for exclusive reading by another reader");j(this,e),this._readRequests=new A}return Object.defineProperty(e.prototype,"closed",{get:function(){return J(this)?this._closedPromise:S(X("closed"))},enumerable:!0,configurable:!0}),e.prototype.cancel=function(e){return J(this)?void 0===this._ownerReadableStream?S(z("cancel")):W(this,e):S(X("cancel"))},e.prototype.read=function(){return J(this)?void 0===this._ownerReadableStream?S(z("read from")):K(this):S(X("read"))},e.prototype.releaseLock=function(){if(!J(this))throw X("releaseLock");if(void 0!==this._ownerReadableStream){if(this._readRequests.length>0)throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");k(this)}},e}();function J(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_readRequests")}function K(e){var r=e._ownerReadableStream;return r._disturbed=!0,"closed"===r._state?g(O(void 0,!0,e._forAuthorCode)):"errored"===r._state?S(r._storedError):r._readableStreamController[x]()}function X(e){return new TypeError("ReadableStreamDefaultReader.prototype."+e+" can only be used on a ReadableStreamDefaultReader")}"symbol"==typeof r.asyncIterator&&((V={})[r.asyncIterator]=function(){return this},Q=V,Object.defineProperty(Q,r.asyncIterator,{enumerable:!1}));var Z={next:function(){if(!1===$(this))return S(ee("next"));var e=this._asyncIteratorReader;return void 0===e._ownerReadableStream?S(z("iterate")):P(K(e),function(r){var t=r.done;return t&&k(e),O(r.value,t,!0)})},return:function(e){if(!1===$(this))return S(ee("next"));var r=this._asyncIteratorReader;if(void 0===r._ownerReadableStream)return S(z("finish iterating"));if(r._readRequests.length>0)return S(new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled"));if(!1===this._preventCancel){var t=W(r,e);return k(r),P(t,function(){return O(e,!0,!0)})}return k(r),g(O(e,!0,!0))}};function $(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_asyncIteratorReader")}function ee(e){return new TypeError("ReadableStreamAsyncIterator."+e+" can only be used on a ReadableSteamAsyncIterator")}function re(e){var r=e._queue.shift();return e._queueTotalSize-=r.size,e._queueTotalSize<0&&(e._queueTotalSize=0),r.value}function te(e,r,t){if(!s(t=Number(t)))throw new RangeError("Size must be a finite, non-NaN, non-negative number.");e._queue.push({value:r,size:t}),e._queueTotalSize+=t}function oe(e){e._queue=new A,e._queueTotalSize=0}void 0!==Q&&Object.setPrototypeOf(Z,Q),Object.defineProperty(Z,"next",{enumerable:!1}),Object.defineProperty(Z,"return",{enumerable:!1});var ne=r("[[AbortSteps]]"),ie=r("[[ErrorSteps]]"),ae=function(){function e(e,r){void 0===e&&(e={}),void 0===r&&(r={}),se(this);var t=r.size,o=r.highWaterMark;if(void 0!==e.type)throw new RangeError("Invalid type is specified");var n=b(t);void 0===o&&(o=1),function(e,r,t,o){var n=Object.create(qe.prototype);var i=c(r,"write",1,[n]),a=c(r,"close",0,[]),u=c(r,"abort",1,[]);Ee(e,n,function(){return d(r,"start",[n])},i,a,u,t,o)}(this,e,o=h(o),n)}return Object.defineProperty(e.prototype,"locked",{get:function(){if(!1===le(this))throw ke("locked");return ce(this)},enumerable:!0,configurable:!0}),e.prototype.abort=function(e){return!1===le(this)?S(ke("abort")):!0===ce(this)?S(new TypeError("Cannot abort a stream that already has a writer")):de(this,e)},e.prototype.getWriter=function(){if(!1===le(this))throw ke("getWriter");return ue(this)},e}();function ue(e){return new ve(e)}function se(e){e._state="writable",e._storedError=void 0,e._writer=void 0,e._writableStreamController=void 0,e._writeRequests=new A,e._inFlightWriteRequest=void 0,e._closeRequest=void 0,e._inFlightCloseRequest=void 0,e._pendingAbortRequest=void 0,e._backpressure=!1}function le(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_writableStreamController")}function ce(e){return void 0!==e._writer}function de(e,r){var t=e._state;if("closed"===t||"errored"===t)return g(void 0);if(void 0!==e._pendingAbortRequest)return e._pendingAbortRequest._promise;var o=!1;"erroring"===t&&(o=!0,r=void 0);var n=w(function(t,n){e._pendingAbortRequest={_promise:void 0,_resolve:t,_reject:n,_reason:r,_wasAlreadyErroring:o}});return e._pendingAbortRequest._promise=n,!1===o&&_e(e,r),n}function fe(e,r){"writable"!==e._state?he(e):_e(e,r)}function _e(e,r){var t=e._writableStreamController;e._state="erroring",e._storedError=r;var o=e._writer;void 0!==o&&Se(o,r),!1===function(e){if(void 0===e._inFlightWriteRequest&&void 0===e._inFlightCloseRequest)return!1;return!0}(e)&&!0===t._started&&he(e)}function he(e){e._state="errored",e._writableStreamController[ie]();var r=e._storedError;if(e._writeRequests.forEach(function(e){e._reject(r)}),e._writeRequests=new A,void 0!==e._pendingAbortRequest){var t=e._pendingAbortRequest;if(e._pendingAbortRequest=void 0,!0===t._wasAlreadyErroring)return t._reject(r),void pe(e);T(e._writableStreamController[ne](t._reason),function(){t._resolve(),pe(e)},function(r){t._reject(r),pe(e)})}else pe(e)}function be(e){return void 0!==e._closeRequest||void 0!==e._inFlightCloseRequest}function pe(e){void 0!==e._closeRequest&&(e._closeRequest._reject(e._storedError),e._closeRequest=void 0);var r=e._writer;void 0!==r&&Le(r,e._storedError)}function ye(e,r){var t=e._writer;void 0!==t&&r!==e._backpressure&&(!0===r?function(e){xe(e)}(t):He(t)),e._backpressure=r}var ve=function(){function e(e){if(!1===le(e))throw new TypeError("WritableStreamDefaultWriter can only be constructed with a WritableStream instance");if(!0===ce(e))throw new TypeError("This stream has already been locked for exclusive writing by another writer");this._ownerWritableStream=e,e._writer=this;var r,t=e._state;if("writable"===t)!1===be(e)&&!0===e._backpressure?xe(this):Ne(this),Ie(this);else if("erroring"===t)De(this,e._storedError),Ie(this);else if("closed"===t)Ne(this),Ie(r=this),Me(r);else{var o=e._storedError;De(this,o),Fe(this,o)}}return Object.defineProperty(e.prototype,"closed",{get:function(){return!1===me(this)?S(ze("closed")):this._closedPromise},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"desiredSize",{get:function(){if(!1===me(this))throw ze("desiredSize");if(void 0===this._ownerWritableStream)throw Be("desiredSize");return function(e){var r=e._ownerWritableStream,t=r._state;if("errored"===t||"erroring"===t)return null;if("closed"===t)return 0;return Ce(r._writableStreamController)}(this)},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"ready",{get:function(){return!1===me(this)?S(ze("ready")):this._readyPromise},enumerable:!0,configurable:!0}),e.prototype.abort=function(e){return!1===me(this)?S(ze("abort")):void 0===this._ownerWritableStream?S(Be("abort")):function(e,r){return de(e._ownerWritableStream,r)}(this,e)},e.prototype.close=function(){if(!1===me(this))return S(ze("close"));var e=this._ownerWritableStream;return void 0===e?S(Be("close")):!0===be(e)?S(new TypeError("cannot close an already-closing stream")):we(this)},e.prototype.releaseLock=function(){if(!1===me(this))throw ze("releaseLock");void 0!==this._ownerWritableStream&&Re(this)},e.prototype.write=function(e){return!1===me(this)?S(ze("write")):void 0===this._ownerWritableStream?S(Be("write to")):Te(this,e)},e}();function me(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_ownerWritableStream")}function we(e){var r=e._ownerWritableStream,t=r._state;if("closed"===t||"errored"===t)return S(new TypeError("The stream (in "+t+" state) is not in the writable state and cannot be closed"));var o,n=w(function(e,t){var o={_resolve:e,_reject:t};r._closeRequest=o});return!0===r._backpressure&&"writable"===t&&He(e),te(o=r._writableStreamController,"close",0),Ae(o),n}function ge(e,r){"pending"===e._closedPromiseState?Le(e,r):function(e,r){Fe(e,r)}(e,r)}function Se(e,r){"pending"===e._readyPromiseState?Ye(e,r):function(e,r){De(e,r)}(e,r)}function Re(e){var r=e._ownerWritableStream,t=new TypeError("Writer was released and can no longer be used to monitor the stream's closedness");Se(e,t),ge(e,t),r._writer=void 0,e._ownerWritableStream=void 0}function Te(e,r){var t=e._ownerWritableStream,o=t._writableStreamController,n=function(e,r){try{return e._strategySizeAlgorithm(r)}catch(r){return Oe(e,r),1}}(o,r);if(t!==e._ownerWritableStream)return S(Be("write to"));var i=t._state;if("errored"===i)return S(t._storedError);if(!0===be(t)||"closed"===i)return S(new TypeError("The stream is closing or closed and cannot be written to"));if("erroring"===i)return S(t._storedError);var a=function(e){return w(function(r,t){var o={_resolve:r,_reject:t};e._writeRequests.push(o)})}(t);return function(e,r,t){var o={chunk:r};try{te(e,o,t)}catch(r){return void Oe(e,r)}var n=e._controlledWritableStream;if(!1===be(n)&&"writable"===n._state){var i=je(e);ye(n,i)}Ae(e)}(o,r,n),a}var qe=function(){function e(){throw new TypeError("WritableStreamDefaultController cannot be constructed explicitly")}return e.prototype.error=function(e){if(!1===function(e){if(!a(e))return!1;if(!Object.prototype.hasOwnProperty.call(e,"_controlledWritableStream"))return!1;return!0}(this))throw new TypeError("WritableStreamDefaultController.prototype.error can only be used on a WritableStreamDefaultController");"writable"===this._controlledWritableStream._state&&We(this,e)},e.prototype[ne]=function(e){var r=this._abortAlgorithm(e);return Pe(this),r},e.prototype[ie]=function(){oe(this)},e}();function Ee(e,r,t,o,n,i,a,u){r._controlledWritableStream=e,e._writableStreamController=r,r._queue=void 0,r._queueTotalSize=void 0,oe(r),r._started=!1,r._strategySizeAlgorithm=u,r._strategyHWM=a,r._writeAlgorithm=o,r._closeAlgorithm=n,r._abortAlgorithm=i;var s=je(r);ye(e,s),T(g(t()),function(){r._started=!0,Ae(r)},function(t){r._started=!0,fe(e,t)})}function Pe(e){e._writeAlgorithm=void 0,e._closeAlgorithm=void 0,e._abortAlgorithm=void 0,e._strategySizeAlgorithm=void 0}function Ce(e){return e._strategyHWM-e._queueTotalSize}function Ae(e){var r=e._controlledWritableStream;if(!1!==e._started&&void 0===r._inFlightWriteRequest)if("erroring"!==r._state){if(0!==e._queue.length){var t=e._queue.peek().value;"close"===t?function(e){var r=e._controlledWritableStream;(function(e){e._inFlightCloseRequest=e._closeRequest,e._closeRequest=void 0})(r),re(e);var t=e._closeAlgorithm();Pe(e),T(t,function(){!function(e){e._inFlightCloseRequest._resolve(void 0),e._inFlightCloseRequest=void 0,"erroring"===e._state&&(e._storedError=void 0,void 0!==e._pendingAbortRequest&&(e._pendingAbortRequest._resolve(),e._pendingAbortRequest=void 0)),e._state="closed";var r=e._writer;void 0!==r&&Me(r)}(r)},function(e){!function(e,r){e._inFlightCloseRequest._reject(r),e._inFlightCloseRequest=void 0,void 0!==e._pendingAbortRequest&&(e._pendingAbortRequest._reject(r),e._pendingAbortRequest=void 0),fe(e,r)}(r,e)})}(e):function(e,r){var t=e._controlledWritableStream;(function(e){e._inFlightWriteRequest=e._writeRequests.shift()})(t),T(e._writeAlgorithm(r),function(){!function(e){e._inFlightWriteRequest._resolve(void 0),e._inFlightWriteRequest=void 0}(t);var r=t._state;if(re(e),!1===be(t)&&"writable"===r){var o=je(e);ye(t,o)}Ae(e)},function(r){"writable"===t._state&&Pe(e),function(e,r){e._inFlightWriteRequest._reject(r),e._inFlightWriteRequest=void 0,fe(e,r)}(t,r)})}(e,t.chunk)}}else he(r)}function Oe(e,r){"writable"===e._controlledWritableStream._state&&We(e,r)}function je(e){return Ce(e)<=0}function We(e,r){var t=e._controlledWritableStream;Pe(e),_e(t,r)}function ke(e){return new TypeError("WritableStream.prototype."+e+" can only be used on a WritableStream")}function ze(e){return new TypeError("WritableStreamDefaultWriter.prototype."+e+" can only be used on a WritableStreamDefaultWriter")}function Be(e){return new TypeError("Cannot "+e+" a stream using a released writer")}function Ie(e){e._closedPromise=w(function(r,t){e._closedPromise_resolve=r,e._closedPromise_reject=t,e._closedPromiseState="pending"})}function Fe(e,r){Ie(e),Le(e,r)}function Le(e,r){C(e._closedPromise),e._closedPromise_reject(r),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0,e._closedPromiseState="rejected"}function Me(e){e._closedPromise_resolve(void 0),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0,e._closedPromiseState="resolved"}function xe(e){e._readyPromise=w(function(r,t){e._readyPromise_resolve=r,e._readyPromise_reject=t}),e._readyPromiseState="pending"}function De(e,r){xe(e),Ye(e,r)}function Ne(e){xe(e),He(e)}function Ye(e,r){C(e._readyPromise),e._readyPromise_reject(r),e._readyPromise_resolve=void 0,e._readyPromise_reject=void 0,e._readyPromiseState="rejected"}function He(e){e._readyPromise_resolve(void 0),e._readyPromise_resolve=void 0,e._readyPromise_reject=void 0,e._readyPromiseState="fulfilled"}function Ue(e){if("object"!=typeof e||null===e)return!1;try{return"boolean"==typeof e.aborted}catch(e){return!1}}var Ve="undefined"!=typeof DOMException?DOMException:void 0;var Qe,Ge=function(e){if("function"!=typeof e&&"object"!=typeof e)return!1;try{return new e,!0}catch(e){return!1}}(Ve)?Ve:((Qe=function(e,r){this.message=e||"",this.name=r||"Error",Error.captureStackTrace&&Error.captureStackTrace(this,this.constructor)}).prototype=Object.create(Error.prototype),Object.defineProperty(Qe.prototype,"constructor",{value:Qe,writable:!0,configurable:!0}),Qe);function Je(e,r,o,n,i,a){var u=D(e),s=ue(r),l=!1,c=g(void 0);return w(function(d,f){var _,h,b,p;if(void 0!==a){if(_=function(){var t=new Ge("Aborted","AbortError"),o=[];!1===n&&o.push(function(){return"writable"===r._state?de(r,t):g(void 0)}),!1===i&&o.push(function(){return"readable"===e._state?Dr(e,t):g(void 0)}),P(function(){return Promise.all(o.map(function(e){return e()}))},!0,t)},!0===a.aborted)return void _();a.addEventListener("abort",_)}if(m(e,u._closedPromise,function(e){!1===n?P(function(){return de(r,e)},!0,e):A(!0,e)}),m(r,s._closedPromise,function(r){!1===i?P(function(){return Dr(e,r)},!0,r):A(!0,r)}),h=e,b=u._closedPromise,p=function(){!1===o?P(function(){return function(e){var r=e._ownerWritableStream,t=r._state;return!0===be(r)||"closed"===t?g(void 0):"errored"===t?S(r._storedError):we(e)}(s)}):A()},"closed"===h._state?p():q(b,p),!0===be(r)||"closed"===r._state){var y=new TypeError("the destination writable stream closed before all data could be piped to it");!1===i?P(function(){return Dr(e,y)},!0,y):A(!0,y)}function v(){var e=c;return R(c,function(){return e!==c?v():void 0})}function m(e,r,t){"errored"===e._state?t(e._storedError):E(r,t)}function P(e,t,o){function n(){T(e(),function(){return O(t,o)},function(e){return O(!0,e)})}!0!==l&&(l=!0,"writable"===r._state&&!1===be(r)?q(v(),n):n())}function A(e,t){!0!==l&&(l=!0,"writable"===r._state&&!1===be(r)?q(v(),function(){return O(e,t)}):O(e,t))}function O(e,r){Re(s),k(u),void 0!==a&&a.removeEventListener("abort",_),e?f(r):d(void 0)}C(w(function(e,r){!function o(n){n?e():R(!0===l?g(!0):R(s._readyPromise,function(){return R(K(u),function(e){var r=e.value,o=e.done;return!0===o||(c=R(Te(s,r),void 0,t),!1)})}),o,r)}(!1)}))})}var Ke=function(){function e(){throw new TypeError}return Object.defineProperty(e.prototype,"desiredSize",{get:function(){if(!1===Xe(this))throw ur("desiredSize");return nr(this)},enumerable:!0,configurable:!0}),e.prototype.close=function(){if(!1===Xe(this))throw ur("close");if(!1===ir(this))throw new TypeError("The stream is not in a state that permits close");rr(this)},e.prototype.enqueue=function(e){if(!1===Xe(this))throw ur("enqueue");if(!1===ir(this))throw new TypeError("The stream is not in a state that permits enqueue");return tr(this,e)},e.prototype.error=function(e){if(!1===Xe(this))throw ur("error");or(this,e)},e.prototype[M]=function(e){oe(this);var r=this._cancelAlgorithm(e);return er(this),r},e.prototype[x]=function(){var e=this._controlledReadableStream;if(this._queue.length>0){var r=re(this);return!0===this._closeRequested&&0===this._queue.length?(er(this),Nr(e)):Ze(this),g(O(r,!1,e._reader._forAuthorCode))}var t=N(e);return Ze(this),t},e}();function Xe(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_controlledReadableStream")}function Ze(e){!1!==$e(e)&&(!0!==e._pulling?(e._pulling=!0,T(e._pullAlgorithm(),function(){e._pulling=!1,!0===e._pullAgain&&(e._pullAgain=!1,Ze(e))},function(r){or(e,r)})):e._pullAgain=!0)}function $e(e){var r=e._controlledReadableStream;return!1!==ir(e)&&(!1!==e._started&&(!0===xr(r)&&H(r)>0||nr(e)>0))}function er(e){e._pullAlgorithm=void 0,e._cancelAlgorithm=void 0,e._strategySizeAlgorithm=void 0}function rr(e){var r=e._controlledReadableStream;e._closeRequested=!0,0===e._queue.length&&(er(e),Nr(r))}function tr(e,r){var t=e._controlledReadableStream;if(!0===xr(t)&&H(t)>0)Y(t,r,!1);else{var o=void 0;try{o=e._strategySizeAlgorithm(r)}catch(r){throw or(e,r),r}try{te(e,r,o)}catch(r){throw or(e,r),r}}Ze(e)}function or(e,r){var t=e._controlledReadableStream;"readable"===t._state&&(oe(e),er(e),Yr(t,r))}function nr(e){var r=e._controlledReadableStream._state;return"errored"===r?null:"closed"===r?0:e._strategyHWM-e._queueTotalSize}function ir(e){var r=e._controlledReadableStream._state;return!1===e._closeRequested&&"readable"===r}function ar(e,r,t,o,n,i,a){r._controlledReadableStream=e,r._queue=void 0,r._queueTotalSize=void 0,oe(r),r._started=!1,r._closeRequested=!1,r._pullAgain=!1,r._pulling=!1,r._strategySizeAlgorithm=a,r._strategyHWM=i,r._pullAlgorithm=o,r._cancelAlgorithm=n,e._readableStreamController=r,T(g(t()),function(){r._started=!0,Ze(r)},function(e){or(r,e)})}function ur(e){return new TypeError("ReadableStreamDefaultController.prototype."+e+" can only be used on a ReadableStreamDefaultController")}var sr=Number.isInteger||function(e){return"number"==typeof e&&isFinite(e)&&Math.floor(e)===e},lr=function(){function e(){throw new TypeError("ReadableStreamBYOBRequest cannot be used directly")}return Object.defineProperty(e.prototype,"view",{get:function(){if(!1===fr(this))throw Cr("view");return this._view},enumerable:!0,configurable:!0}),e.prototype.respond=function(e){if(!1===fr(this))throw Cr("respond");if(void 0===this._associatedReadableByteStreamController)throw new TypeError("This BYOB request has been invalidated");this._view.buffer,function(e,r){if(!1===s(r=Number(r)))throw new RangeError("bytesWritten must be a finite");Sr(e,r)}(this._associatedReadableByteStreamController,e)},e.prototype.respondWithNewView=function(e){if(!1===fr(this))throw Cr("respond");if(void 0===this._associatedReadableByteStreamController)throw new TypeError("This BYOB request has been invalidated");if(!ArrayBuffer.isView(e))throw new TypeError("You can only respond with array buffer views");e.buffer,function(e,r){var t=e._pendingPullIntos.peek();if(t.byteOffset+t.bytesFilled!==r.byteOffset)throw new RangeError("The region specified by view does not match byobRequest");if(t.byteLength!==r.byteLength)throw new RangeError("The buffer of view has different capacity than byobRequest");t.buffer=r.buffer,Sr(e,r.byteLength)}(this._associatedReadableByteStreamController,e)},e}(),cr=function(){function e(){throw new TypeError("ReadableByteStreamController constructor cannot be used directly")}return Object.defineProperty(e.prototype,"byobRequest",{get:function(){if(!1===dr(this))throw Ar("byobRequest");if(void 0===this._byobRequest&&this._pendingPullIntos.length>0){var e=this._pendingPullIntos.peek(),r=new Uint8Array(e.buffer,e.byteOffset+e.bytesFilled,e.byteLength-e.bytesFilled),t=Object.create(lr.prototype);!function(e,r,t){e._associatedReadableByteStreamController=r,e._view=t}(t,this,r),this._byobRequest=t}return this._byobRequest},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"desiredSize",{get:function(){if(!1===dr(this))throw Ar("desiredSize");return Er(this)},enumerable:!0,configurable:!0}),e.prototype.close=function(){if(!1===dr(this))throw Ar("close");if(!0===this._closeRequested)throw new TypeError("The stream has already been closed; do not close it again!");var e=this._controlledReadableByteStream._state;if("readable"!==e)throw new TypeError("The stream (in "+e+" state) is not in the readable state and cannot be closed");!function(e){var r=e._controlledReadableByteStream;if(e._queueTotalSize>0)return void(e._closeRequested=!0);if(e._pendingPullIntos.length>0){var t=e._pendingPullIntos.peek();if(t.bytesFilled>0){var o=new TypeError("Insufficient bytes to fill elements in the given buffer");throw qr(e,o),o}}Tr(e),Nr(r)}(this)},e.prototype.enqueue=function(e){if(!1===dr(this))throw Ar("enqueue");if(!0===this._closeRequested)throw new TypeError("stream is closed or draining");var r=this._controlledReadableByteStream._state;if("readable"!==r)throw new TypeError("The stream (in "+r+" state) is not in the readable state and cannot be enqueued to");if(!ArrayBuffer.isView(e))throw new TypeError("You can only enqueue array buffer views when using a ReadableByteStreamController");e.buffer,function(e,r){var t=e._controlledReadableByteStream,o=r.buffer,n=r.byteOffset,i=r.byteLength,a=_(o);if(!0===U(t))if(0===H(t))pr(e,a,n,i);else{var u=new Uint8Array(a,n,i);Y(t,u,!1)}else!0===Wr(t)?(pr(e,a,n,i),gr(e)):pr(e,a,n,i);_r(e)}(this,e)},e.prototype.error=function(e){if(!1===dr(this))throw Ar("error");qr(this,e)},e.prototype[M]=function(e){this._pendingPullIntos.length>0&&(this._pendingPullIntos.peek().bytesFilled=0);oe(this);var r=this._cancelAlgorithm(e);return Tr(this),r},e.prototype[x]=function(){var e=this._controlledReadableByteStream;if(this._queueTotalSize>0){var r=this._queue.shift();this._queueTotalSize-=r.byteLength,mr(this);var t=void 0;try{t=new Uint8Array(r.buffer,r.byteOffset,r.byteLength)}catch(e){return S(e)}return g(O(t,!1,e._reader._forAuthorCode))}var o=this._autoAllocateChunkSize;if(void 0!==o){var n=void 0;try{n=new ArrayBuffer(o)}catch(e){return S(e)}var i={buffer:n,byteOffset:0,byteLength:o,bytesFilled:0,elementSize:1,ctor:Uint8Array,readerType:"default"};this._pendingPullIntos.push(i)}var a=N(e);return _r(this),a},e}();function dr(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_controlledReadableByteStream")}function fr(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_associatedReadableByteStreamController")}function _r(e){!1!==function(e){var r=e._controlledReadableByteStream;if("readable"!==r._state)return!1;if(!0===e._closeRequested)return!1;if(!1===e._started)return!1;if(!0===U(r)&&H(r)>0)return!0;if(!0===Wr(r)&&jr(r)>0)return!0;if(Er(e)>0)return!0;return!1}(e)&&(!0!==e._pulling?(e._pulling=!0,T(e._pullAlgorithm(),function(){e._pulling=!1,!0===e._pullAgain&&(e._pullAgain=!1,_r(e))},function(r){qr(e,r)})):e._pullAgain=!0)}function hr(e,r){var t=!1;"closed"===e._state&&(t=!0);var o=br(r);"default"===r.readerType?Y(e,o,t):function(e,r,t){var o=e._reader;o._readIntoRequests.shift()._resolve(O(r,t,o._forAuthorCode))}(e,o,t)}function br(e){var r=e.bytesFilled,t=e.elementSize;return new e.ctor(e.buffer,e.byteOffset,r/t)}function pr(e,r,t,o){e._queue.push({buffer:r,byteOffset:t,byteLength:o}),e._queueTotalSize+=o}function yr(e,r){var t=r.elementSize,o=r.bytesFilled-r.bytesFilled%t,n=Math.min(e._queueTotalSize,r.byteLength-r.bytesFilled),i=r.bytesFilled+n,a=i-i%t,u=n,s=!1;a>o&&(u=a-r.bytesFilled,s=!0);for(var l,c,d,f,_,h=e._queue;u>0;){var b=h.peek(),p=Math.min(u,b.byteLength),y=r.byteOffset+r.bytesFilled;l=r.buffer,c=y,d=b.buffer,f=b.byteOffset,_=p,new Uint8Array(l).set(new Uint8Array(d,f,_),c),b.byteLength===p?h.shift():(b.byteOffset+=p,b.byteLength-=p),e._queueTotalSize-=p,vr(e,p,r),u-=p}return s}function vr(e,r,t){wr(e),t.bytesFilled+=r}function mr(e){0===e._queueTotalSize&&!0===e._closeRequested?(Tr(e),Nr(e._controlledReadableByteStream)):_r(e)}function wr(e){void 0!==e._byobRequest&&(e._byobRequest._associatedReadableByteStreamController=void 0,e._byobRequest._view=void 0,e._byobRequest=void 0)}function gr(e){for(;e._pendingPullIntos.length>0;){if(0===e._queueTotalSize)return;var r=e._pendingPullIntos.peek();!0===yr(e,r)&&(Rr(e),hr(e._controlledReadableByteStream,r))}}function Sr(e,r){var t=e._pendingPullIntos.peek();if("closed"===e._controlledReadableByteStream._state){if(0!==r)throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");!function(e,r){r.buffer=_(r.buffer);var t=e._controlledReadableByteStream;if(!0===Wr(t))for(;jr(t)>0;)hr(t,Rr(e))}(e,t)}else!function(e,r,t){if(t.bytesFilled+r>t.byteLength)throw new RangeError("bytesWritten out of range");if(vr(e,r,t),!(t.bytesFilled<t.elementSize)){Rr(e);var o=t.bytesFilled%t.elementSize;if(o>0){var n=t.byteOffset+t.bytesFilled,i=t.buffer.slice(n-o,n);pr(e,i,0,i.byteLength)}t.buffer=_(t.buffer),t.bytesFilled-=o,hr(e._controlledReadableByteStream,t),gr(e)}}(e,r,t);_r(e)}function Rr(e){var r=e._pendingPullIntos.shift();return wr(e),r}function Tr(e){e._pullAlgorithm=void 0,e._cancelAlgorithm=void 0}function qr(e,r){var t=e._controlledReadableByteStream;"readable"===t._state&&(!function(e){wr(e),e._pendingPullIntos=new A}(e),oe(e),Tr(e),Yr(t,r))}function Er(e){var r=e._controlledReadableByteStream._state;return"errored"===r?null:"closed"===r?0:e._strategyHWM-e._queueTotalSize}function Pr(e,r,t){var o=Object.create(cr.prototype);var n=c(r,"pull",0,[o]),i=c(r,"cancel",1,[]),a=r.autoAllocateChunkSize;if(void 0!==a&&(a=Number(a),!1===sr(a)||a<=0))throw new RangeError("autoAllocateChunkSize must be a positive integer");!function(e,r,t,o,n,i,a){r._controlledReadableByteStream=e,r._pullAgain=!1,r._pulling=!1,r._byobRequest=void 0,r._queue=r._queueTotalSize=void 0,oe(r),r._closeRequested=!1,r._started=!1,r._strategyHWM=h(i),r._pullAlgorithm=o,r._cancelAlgorithm=n,r._autoAllocateChunkSize=a,r._pendingPullIntos=new A,e._readableStreamController=r,T(g(t()),function(){r._started=!0,_r(r)},function(e){qr(r,e)})}(e,o,function(){return d(r,"start",[o])},n,i,t,a)}function Cr(e){return new TypeError("ReadableStreamBYOBRequest.prototype."+e+" can only be used on a ReadableStreamBYOBRequest")}function Ar(e){return new TypeError("ReadableByteStreamController.prototype."+e+" can only be used on a ReadableByteStreamController")}function Or(e){return w(function(r,t){var o={_resolve:r,_reject:t};e._reader._readIntoRequests.push(o)})}function jr(e){return e._reader._readIntoRequests.length}function Wr(e){var r=e._reader;return void 0!==r&&!!zr(r)}var kr=function(){function e(e){if(!Mr(e))throw new TypeError("ReadableStreamBYOBReader can only be constructed with a ReadableStream instance given a byte source");if(!1===dr(e._readableStreamController))throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");if(xr(e))throw new TypeError("This stream has already been locked for exclusive reading by another reader");j(this,e),this._readIntoRequests=new A}return Object.defineProperty(e.prototype,"closed",{get:function(){return zr(this)?this._closedPromise:S(Br("closed"))},enumerable:!0,configurable:!0}),e.prototype.cancel=function(e){return zr(this)?void 0===this._ownerReadableStream?S(z("cancel")):W(this,e):S(Br("cancel"))},e.prototype.read=function(e){return zr(this)?void 0===this._ownerReadableStream?S(z("read from")):ArrayBuffer.isView(e)?(e.buffer,0===e.byteLength?S(new TypeError("view must have non-zero byteLength")):function(e,r){var t=e._ownerReadableStream;if(t._disturbed=!0,"errored"===t._state)return S(t._storedError);return function(e,r){var t=e._controlledReadableByteStream,o=1;r.constructor!==DataView&&(o=r.constructor.BYTES_PER_ELEMENT);var n=r.constructor,i={buffer:_(r.buffer),byteOffset:r.byteOffset,byteLength:r.byteLength,bytesFilled:0,elementSize:o,ctor:n,readerType:"byob"};if(e._pendingPullIntos.length>0)return e._pendingPullIntos.push(i),Or(t);if("closed"===t._state)return g(O(new n(i.buffer,i.byteOffset,0),!0,t._reader._forAuthorCode));if(e._queueTotalSize>0){if(!0===yr(e,i)){var a=br(i);return mr(e),g(O(a,!1,t._reader._forAuthorCode))}if(!0===e._closeRequested){var u=new TypeError("Insufficient bytes to fill elements in the given buffer");return qr(e,u),S(u)}}e._pendingPullIntos.push(i);var s=Or(t);return _r(e),s}(t._readableStreamController,r)}(this,e)):S(new TypeError("view must be an array buffer view")):S(Br("read"))},e.prototype.releaseLock=function(){if(!zr(this))throw Br("releaseLock");if(void 0!==this._ownerReadableStream){if(this._readIntoRequests.length>0)throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");k(this)}},e}();function zr(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_readIntoRequests")}function Br(e){return new TypeError("ReadableStreamBYOBReader.prototype."+e+" can only be used on a ReadableStreamBYOBReader")}var Ir=function(){function e(e,r){void 0===e&&(e={}),void 0===r&&(r={}),Lr(this);var t=r.size,o=r.highWaterMark,n=e.type;if("bytes"===String(n)){if(void 0!==t)throw new RangeError("The strategy for a byte stream cannot have a size function");void 0===o&&(o=0),Pr(this,e,o=h(o))}else{if(void 0!==n)throw new RangeError("Invalid type is specified");var i=b(t);void 0===o&&(o=1),function(e,r,t,o){var n=Object.create(Ke.prototype),i=c(r,"pull",0,[n]),a=c(r,"cancel",1,[]);ar(e,n,function(){return d(r,"start",[n])},i,a,t,o)}(this,e,o=h(o),i)}}return Object.defineProperty(e.prototype,"locked",{get:function(){if(!1===Mr(this))throw Hr("locked");return xr(this)},enumerable:!0,configurable:!0}),e.prototype.cancel=function(e){return!1===Mr(this)?S(Hr("cancel")):!0===xr(this)?S(new TypeError("Cannot cancel a stream that already has a reader")):Dr(this,e)},e.prototype.getReader=function(e){var r=(void 0===e?{}:e).mode;if(!1===Mr(this))throw Hr("getReader");if(void 0===r)return D(this,!0);if("byob"===(r=String(r)))return function(e,r){void 0===r&&(r=!1);var t=new kr(e);return t._forAuthorCode=r,t}(this,!0);throw new RangeError("Invalid mode is specified")},e.prototype.pipeThrough=function(e,r){var t=e.writable,o=e.readable,n=void 0===r?{}:r,i=n.preventClose,a=n.preventAbort,u=n.preventCancel,s=n.signal;if(!1===Mr(this))throw Hr("pipeThrough");if(!1===le(t))throw new TypeError("writable argument to pipeThrough must be a WritableStream");if(!1===Mr(o))throw new TypeError("readable argument to pipeThrough must be a ReadableStream");if(i=Boolean(i),a=Boolean(a),u=Boolean(u),void 0!==s&&!Ue(s))throw new TypeError("ReadableStream.prototype.pipeThrough's signal option must be an AbortSignal");if(!0===xr(this))throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream");if(!0===ce(t))throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream");return C(Je(this,t,i,a,u,s)),o},e.prototype.pipeTo=function(e,r){var t=void 0===r?{}:r,o=t.preventClose,n=t.preventAbort,i=t.preventCancel,a=t.signal;return!1===Mr(this)?S(Hr("pipeTo")):!1===le(e)?S(new TypeError("ReadableStream.prototype.pipeTo's first argument must be a WritableStream")):(o=Boolean(o),n=Boolean(n),i=Boolean(i),void 0===a||Ue(a)?!0===xr(this)?S(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream")):!0===ce(e)?S(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream")):Je(this,e,o,n,i,a):S(new TypeError("ReadableStream.prototype.pipeTo's signal option must be an AbortSignal")))},e.prototype.tee=function(){if(!1===Mr(this))throw Hr("tee");var e=function(e,r){var t,o,n,i,a,s=D(e),l=!1,c=!1,d=!1,f=w(function(e){a=e});function _(){return!0===l?g(void 0):(l=!0,C(P(K(s),function(e){if(l=!1,!0===e.done)return!1===c&&rr(n._readableStreamController),void(!1===d&&rr(i._readableStreamController));var r=e.value,t=r,o=r;!1===c&&tr(n._readableStreamController,t),!1===d&&tr(i._readableStreamController,o)})),g(void 0))}function h(){}return n=Fr(h,_,function(r){if(c=!0,t=r,!0===d){var n=u([t,o]),i=Dr(e,n);a(i)}return f}),i=Fr(h,_,function(r){if(d=!0,o=r,!0===c){var n=u([t,o]),i=Dr(e,n);a(i)}return f}),E(s._closedPromise,function(e){or(n._readableStreamController,e),or(i._readableStreamController,e)}),[n,i]}(this);return u(e)},e.prototype.getIterator=function(e){var r=(void 0===e?{}:e).preventCancel,t=void 0!==r&&r;if(!1===Mr(this))throw Hr("getIterator");return function(e,r){void 0===r&&(r=!1);var t=D(e),o=Object.create(Z);return o._asyncIteratorReader=t,o._preventCancel=Boolean(r),o}(this,t)},e}();function Fr(e,r,t,o,n){void 0===o&&(o=1),void 0===n&&(n=function(){return 1});var i=Object.create(Ir.prototype);return Lr(i),ar(i,Object.create(Ke.prototype),e,r,t,o,n),i}function Lr(e){e._state="readable",e._reader=void 0,e._storedError=void 0,e._disturbed=!1}function Mr(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_readableStreamController")}function xr(e){return void 0!==e._reader}function Dr(e,r){return e._disturbed=!0,"closed"===e._state?g(void 0):"errored"===e._state?S(e._storedError):(Nr(e),P(e._readableStreamController[M](r),t))}function Nr(e){e._state="closed";var r=e._reader;void 0!==r&&(J(r)&&(r._readRequests.forEach(function(e){e._resolve(O(void 0,!0,r._forAuthorCode))}),r._readRequests=new A),L(r))}function Yr(e,r){e._state="errored",e._storedError=r;var t=e._reader;void 0!==t&&(J(t)?(t._readRequests.forEach(function(e){e._reject(r)}),t._readRequests=new A):(t._readIntoRequests.forEach(function(e){e._reject(r)}),t._readIntoRequests=new A),F(t,r))}function Hr(e){return new TypeError("ReadableStream.prototype."+e+" can only be used on a ReadableStream")}"symbol"==typeof r.asyncIterator&&Object.defineProperty(Ir.prototype,r.asyncIterator,{value:Ir.prototype.getIterator,enumerable:!1,writable:!0,configurable:!0});var Ur=function(){function e(e){var r=e.highWaterMark;this.highWaterMark=r}return e.prototype.size=function(e){return e.byteLength},e}(),Vr=function(){function e(e){var r=e.highWaterMark;this.highWaterMark=r}return e.prototype.size=function(){return 1},e}(),Qr=function(){function e(e,r,t){void 0===e&&(e={}),void 0===r&&(r={}),void 0===t&&(t={});var o=r.size,n=r.highWaterMark,i=t.size,a=t.highWaterMark;if(void 0!==e.writableType)throw new RangeError("Invalid writable type specified");var u=b(o);if(void 0===n&&(n=1),n=h(n),void 0!==e.readableType)throw new RangeError("Invalid readable type specified");var s,l=b(i);void 0===a&&(a=0),a=h(a),function(e,r,t,o,n,i){function a(){return r}e._writable=function(e,r,t,o,n,i){void 0===n&&(n=1),void 0===i&&(i=function(){return 1});var a=Object.create(ae.prototype);return se(a),Ee(a,Object.create(qe.prototype),e,r,t,o,n,i),a}(a,function(r){return function(e,r){var t=e._transformStreamController;if(!0===e._backpressure){var o=e._backpressureChangePromise;return P(o,function(){var o=e._writable,n=o._state;if("erroring"===n)throw o._storedError;return tt(t,r)})}return tt(t,r)}(e,r)},function(){return function(e){var r=e._readable,t=e._transformStreamController,o=t._flushAlgorithm();return et(t),P(o,function(){if("errored"===r._state)throw r._storedError;var e=r._readableStreamController;!0===ir(e)&&rr(e)},function(t){throw Jr(e,t),r._storedError})}(e)},function(r){return function(e,r){return Jr(e,r),g(void 0)}(e,r)},t,o),e._readable=Fr(a,function(){return function(e){return Xr(e,!1),e._backpressureChangePromise}(e)},function(r){return Kr(e,r),g(void 0)},n,i),e._backpressure=void 0,e._backpressureChangePromise=void 0,e._backpressureChangePromise_resolve=void 0,Xr(e,!0),e._transformStreamController=void 0}(this,w(function(e){s=e}),n,u,a,l),function(e,r){var t=Object.create(Zr.prototype),o=function(e){try{return rt(t,e),g(void 0)}catch(e){return S(e)}},n=r.transform;if(void 0!==n){if("function"!=typeof n)throw new TypeError("transform is not a method");o=function(e){return f(n,r,[e,t])}}var i=c(r,"flush",0,[t]);!function(e,r,t,o){r._controlledTransformStream=e,e._transformStreamController=r,r._transformAlgorithm=t,r._flushAlgorithm=o}(e,t,o,i)}(this,e);var _=d(e,"start",[this._transformStreamController]);s(_)}return Object.defineProperty(e.prototype,"readable",{get:function(){if(!1===Gr(this))throw nt("readable");return this._readable},enumerable:!0,configurable:!0}),Object.defineProperty(e.prototype,"writable",{get:function(){if(!1===Gr(this))throw nt("writable");return this._writable},enumerable:!0,configurable:!0}),e}();function Gr(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_transformStreamController")}function Jr(e,r){or(e._readable._readableStreamController,r),Kr(e,r)}function Kr(e,r){et(e._transformStreamController),Oe(e._writable._writableStreamController,r),!0===e._backpressure&&Xr(e,!1)}function Xr(e,r){void 0!==e._backpressureChangePromise&&e._backpressureChangePromise_resolve(),e._backpressureChangePromise=w(function(r){e._backpressureChangePromise_resolve=r}),e._backpressure=r}var Zr=function(){function e(){throw new TypeError("TransformStreamDefaultController instances cannot be created directly")}return Object.defineProperty(e.prototype,"desiredSize",{get:function(){if(!1===$r(this))throw ot("desiredSize");return nr(this._controlledTransformStream._readable._readableStreamController)},enumerable:!0,configurable:!0}),e.prototype.enqueue=function(e){if(!1===$r(this))throw ot("enqueue");rt(this,e)},e.prototype.error=function(e){if(!1===$r(this))throw ot("error");var r;r=e,Jr(this._controlledTransformStream,r)},e.prototype.terminate=function(){if(!1===$r(this))throw ot("terminate");!function(e){var r=e._controlledTransformStream,t=r._readable._readableStreamController;!0===ir(t)&&rr(t);var o=new TypeError("TransformStream terminated");Kr(r,o)}(this)},e}();function $r(e){return!!a(e)&&!!Object.prototype.hasOwnProperty.call(e,"_controlledTransformStream")}function et(e){e._transformAlgorithm=void 0,e._flushAlgorithm=void 0}function rt(e,r){var t=e._controlledTransformStream,o=t._readable._readableStreamController;if(!1===ir(o))throw new TypeError("Readable side is not in a state that permits enqueue");try{tr(o,r)}catch(e){throw Kr(t,e),t._readable._storedError}(function(e){return!0!==$e(e)})(o)!==t._backpressure&&Xr(t,!0)}function tt(e,r){return P(e._transformAlgorithm(r),void 0,function(r){throw Jr(e._controlledTransformStream,r),r})}function ot(e){return new TypeError("TransformStreamDefaultController.prototype."+e+" can only be used on a TransformStreamDefaultController")}function nt(e){return new TypeError("TransformStream.prototype."+e+" can only be used on a TransformStream")}var it=Object.assign||function(e){for(var r=[],t=1;t<arguments.length;t++)r[t-1]=arguments[t];for(var o=Object(e),n=0,i=r;n<i.length;n++){var a=i[n];for(var u in a)Object.prototype.hasOwnProperty.call(a,u)&&(o[u]=a[u])}return o};void 0!==o&&it(o,{ReadableStream:Ir,WritableStream:ae,ByteLengthQueuingStrategy:Ur,CountQueuingStrategy:Vr,TransformStream:Qr}),e.ByteLengthQueuingStrategy=Ur,e.CountQueuingStrategy=Vr,e.ReadableStream=Ir,e.TransformStream=Qr,e.WritableStream=ae,Object.defineProperty(e,"__esModule",{value:!0})});


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],41:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.default = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var _require=_dereq_("./spec/reference-implementation/lib/readable-stream"),ReadableStream=_require.ReadableStream,_require2=_dereq_("./spec/reference-implementation/lib/writable-stream"),WritableStream=_require2.WritableStream,ByteLengthQueuingStrategy=_dereq_("./spec/reference-implementation/lib/byte-length-queuing-strategy"),CountQueuingStrategy=_dereq_("./spec/reference-implementation/lib/count-queuing-strategy"),_require3=_dereq_("./spec/reference-implementation/lib/transform-stream"),TransformStream=_require3.TransformStream;exports.ByteLengthQueuingStrategy=ByteLengthQueuingStrategy,exports.CountQueuingStrategy=CountQueuingStrategy,exports.ReadableStream=ReadableStream,exports.WritableStream=WritableStream,exports.TransformStream=TransformStream;var interfaces={ReadableStream:ReadableStream,WritableStream:WritableStream,ByteLengthQueuingStrategy:ByteLengthQueuingStrategy,CountQueuingStrategy:CountQueuingStrategy,TransformStream:TransformStream};exports.default=interfaces;

},{"./spec/reference-implementation/lib/byte-length-queuing-strategy":8,"./spec/reference-implementation/lib/count-queuing-strategy":9,"./spec/reference-implementation/lib/readable-stream":12,"./spec/reference-implementation/lib/transform-stream":13,"./spec/reference-implementation/lib/writable-stream":15}],2:[function(_dereq_,module,exports){
(function (global){
"use strict";function compare(t,e){if(t===e)return 0;for(var r=t.length,n=e.length,i=0,a=Math.min(r,n);i<a;++i)if(t[i]!==e[i]){r=t[i],n=e[i];break}return r<n?-1:n<r?1:0}function isBuffer(t){return global.Buffer&&"function"==typeof global.Buffer.isBuffer?global.Buffer.isBuffer(t):!(null==t||!t._isBuffer)}function pToString(t){return Object.prototype.toString.call(t)}function isView(t){return!isBuffer(t)&&("function"==typeof global.ArrayBuffer&&("function"==typeof ArrayBuffer.isView?ArrayBuffer.isView(t):!!t&&(t instanceof DataView||!!(t.buffer&&t.buffer instanceof ArrayBuffer))))}function getName(t){if(util.isFunction(t)){if(functionsHaveNames)return t.name;var e=t.toString().match(regex);return e&&e[1]}}function truncate(t,e){return"string"==typeof t?t.length<e?t:t.slice(0,e):t}function inspect(t){if(functionsHaveNames||!util.isFunction(t))return util.inspect(t);var e=getName(t);return"[Function"+(e?": "+e:"")+"]"}function getMessage(t){return truncate(inspect(t.actual),128)+" "+t.operator+" "+truncate(inspect(t.expected),128)}function fail(t,e,r,n,i){throw new assert.AssertionError({message:r,actual:t,expected:e,operator:n,stackStartFunction:i})}function ok(t,e){t||fail(t,!0,e,"==",assert.ok)}function _deepEqual(t,e,r,n){if(t===e)return!0;if(isBuffer(t)&&isBuffer(e))return 0===compare(t,e);if(util.isDate(t)&&util.isDate(e))return t.getTime()===e.getTime();if(util.isRegExp(t)&&util.isRegExp(e))return t.source===e.source&&t.global===e.global&&t.multiline===e.multiline&&t.lastIndex===e.lastIndex&&t.ignoreCase===e.ignoreCase;if(null!==t&&"object"==typeof t||null!==e&&"object"==typeof e){if(isView(t)&&isView(e)&&pToString(t)===pToString(e)&&!(t instanceof Float32Array||t instanceof Float64Array))return 0===compare(new Uint8Array(t.buffer),new Uint8Array(e.buffer));if(isBuffer(t)!==isBuffer(e))return!1;var i=(n=n||{actual:[],expected:[]}).actual.indexOf(t);return-1!==i&&i===n.expected.indexOf(e)||(n.actual.push(t),n.expected.push(e),objEquiv(t,e,r,n))}return r?t===e:t==e}function isArguments(t){return"[object Arguments]"==Object.prototype.toString.call(t)}function objEquiv(t,e,r,n){if(null===t||void 0===t||null===e||void 0===e)return!1;if(util.isPrimitive(t)||util.isPrimitive(e))return t===e;if(r&&Object.getPrototypeOf(t)!==Object.getPrototypeOf(e))return!1;var i=isArguments(t),a=isArguments(e);if(i&&!a||!i&&a)return!1;if(i)return t=pSlice.call(t),e=pSlice.call(e),_deepEqual(t,e,r);var o,s,u=objectKeys(t),f=objectKeys(e);if(u.length!==f.length)return!1;for(u.sort(),f.sort(),s=u.length-1;s>=0;s--)if(u[s]!==f[s])return!1;for(s=u.length-1;s>=0;s--)if(o=u[s],!_deepEqual(t[o],e[o],r,n))return!1;return!0}function notDeepStrictEqual(t,e,r){_deepEqual(t,e,!0)&&fail(t,e,r,"notDeepStrictEqual",notDeepStrictEqual)}function expectedException(t,e){if(!t||!e)return!1;if("[object RegExp]"==Object.prototype.toString.call(e))return e.test(t);try{if(t instanceof e)return!0}catch(t){}return!Error.isPrototypeOf(e)&&!0===e.call({},t)}function _tryBlock(t){var e;try{t()}catch(t){e=t}return e}function _throws(t,e,r,n){var i;if("function"!=typeof e)throw new TypeError('"block" argument must be a function');"string"==typeof r&&(n=r,r=null),i=_tryBlock(e),n=(r&&r.name?" ("+r.name+").":".")+(n?" "+n:"."),t&&!i&&fail(i,r,"Missing expected exception"+n);var a="string"==typeof n,o=!t&&util.isError(i),s=!t&&i&&!r;if((o&&a&&expectedException(i,r)||s)&&fail(i,r,"Got unwanted exception"+n),t&&i&&r&&!expectedException(i,r)||!t&&i)throw i}var util=_dereq_("util/"),hasOwn=Object.prototype.hasOwnProperty,pSlice=Array.prototype.slice,functionsHaveNames="foo"===function foo(){}.name,assert=module.exports=ok,regex=/\s*function\s+([^\(\s]*)\s*/;assert.AssertionError=function AssertionError(t){this.name="AssertionError",this.actual=t.actual,this.expected=t.expected,this.operator=t.operator,t.message?(this.message=t.message,this.generatedMessage=!1):(this.message=getMessage(this),this.generatedMessage=!0);var e=t.stackStartFunction||fail;if(Error.captureStackTrace)Error.captureStackTrace(this,e);else{var r=new Error;if(r.stack){var n=r.stack,i=getName(e),a=n.indexOf("\n"+i);if(a>=0){var o=n.indexOf("\n",a+1);n=n.substring(o+1)}this.stack=n}}},util.inherits(assert.AssertionError,Error),assert.fail=fail,assert.ok=ok,assert.equal=function equal(t,e,r){t!=e&&fail(t,e,r,"==",assert.equal)},assert.notEqual=function notEqual(t,e,r){t==e&&fail(t,e,r,"!=",assert.notEqual)},assert.deepEqual=function deepEqual(t,e,r){_deepEqual(t,e,!1)||fail(t,e,r,"deepEqual",assert.deepEqual)},assert.deepStrictEqual=function deepStrictEqual(t,e,r){_deepEqual(t,e,!0)||fail(t,e,r,"deepStrictEqual",assert.deepStrictEqual)},assert.notDeepEqual=function notDeepEqual(t,e,r){_deepEqual(t,e,!1)&&fail(t,e,r,"notDeepEqual",assert.notDeepEqual)},assert.notDeepStrictEqual=notDeepStrictEqual,assert.strictEqual=function strictEqual(t,e,r){t!==e&&fail(t,e,r,"===",assert.strictEqual)},assert.notStrictEqual=function notStrictEqual(t,e,r){t===e&&fail(t,e,r,"!==",assert.notStrictEqual)},assert.throws=function(t,e,r){_throws(!0,t,e,r)},assert.doesNotThrow=function(t,e,r){_throws(!1,t,e,r)},assert.ifError=function(t){if(t)throw t};var objectKeys=Object.keys||function(t){var e=[];for(var r in t)hasOwn.call(t,r)&&e.push(r);return e};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"util/":7}],3:[function(_dereq_,module,exports){

},{}],4:[function(_dereq_,module,exports){
function defaultSetTimout(){throw new Error("setTimeout has not been defined")}function defaultClearTimeout(){throw new Error("clearTimeout has not been defined")}function runTimeout(e){if(cachedSetTimeout===setTimeout)return setTimeout(e,0);if((cachedSetTimeout===defaultSetTimout||!cachedSetTimeout)&&setTimeout)return cachedSetTimeout=setTimeout,setTimeout(e,0);try{return cachedSetTimeout(e,0)}catch(t){try{return cachedSetTimeout.call(null,e,0)}catch(t){return cachedSetTimeout.call(this,e,0)}}}function runClearTimeout(e){if(cachedClearTimeout===clearTimeout)return clearTimeout(e);if((cachedClearTimeout===defaultClearTimeout||!cachedClearTimeout)&&clearTimeout)return cachedClearTimeout=clearTimeout,clearTimeout(e);try{return cachedClearTimeout(e)}catch(t){try{return cachedClearTimeout.call(null,e)}catch(t){return cachedClearTimeout.call(this,e)}}}function cleanUpNextTick(){draining&&currentQueue&&(draining=!1,currentQueue.length?queue=currentQueue.concat(queue):queueIndex=-1,queue.length&&drainQueue())}function drainQueue(){if(!draining){var e=runTimeout(cleanUpNextTick);draining=!0;for(var t=queue.length;t;){for(currentQueue=queue,queue=[];++queueIndex<t;)currentQueue&&currentQueue[queueIndex].run();queueIndex=-1,t=queue.length}currentQueue=null,draining=!1,runClearTimeout(e)}}function Item(e,t){this.fun=e,this.array=t}function noop(){}var cachedSetTimeout,cachedClearTimeout,process=module.exports={};!function(){try{cachedSetTimeout="function"==typeof setTimeout?setTimeout:defaultSetTimout}catch(e){cachedSetTimeout=defaultSetTimout}try{cachedClearTimeout="function"==typeof clearTimeout?clearTimeout:defaultClearTimeout}catch(e){cachedClearTimeout=defaultClearTimeout}}();var currentQueue,queue=[],draining=!1,queueIndex=-1;process.nextTick=function(e){var t=new Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)t[r-1]=arguments[r];queue.push(new Item(e,t)),1!==queue.length||draining||runTimeout(drainQueue)},Item.prototype.run=function(){this.fun.apply(null,this.array)},process.title="browser",process.browser=!0,process.env={},process.argv=[],process.version="",process.versions={},process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.prependListener=noop,process.prependOnceListener=noop,process.listeners=function(e){return[]},process.binding=function(e){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(e){throw new Error("process.chdir is not supported")},process.umask=function(){return 0};

},{}],5:[function(_dereq_,module,exports){
"function"==typeof Object.create?module.exports=function inherits(t,e){t.super_=e,t.prototype=Object.create(e.prototype,{constructor:{value:t,enumerable:!1,writable:!0,configurable:!0}})}:module.exports=function inherits(t,e){t.super_=e;var o=function(){};o.prototype=e.prototype,t.prototype=new o,t.prototype.constructor=t};

},{}],6:[function(_dereq_,module,exports){
module.exports=function isBuffer(o){return o&&"object"==typeof o&&"function"==typeof o.copy&&"function"==typeof o.fill&&"function"==typeof o.readUInt8};

},{}],7:[function(_dereq_,module,exports){
(function (process,global){
function inspect(e,r){var t={seen:[],stylize:stylizeNoColor};return arguments.length>=3&&(t.depth=arguments[2]),arguments.length>=4&&(t.colors=arguments[3]),isBoolean(r)?t.showHidden=r:r&&exports._extend(t,r),isUndefined(t.showHidden)&&(t.showHidden=!1),isUndefined(t.depth)&&(t.depth=2),isUndefined(t.colors)&&(t.colors=!1),isUndefined(t.customInspect)&&(t.customInspect=!0),t.colors&&(t.stylize=stylizeWithColor),formatValue(t,e,t.depth)}function stylizeWithColor(e,r){var t=inspect.styles[r];return t?"["+inspect.colors[t][0]+"m"+e+"["+inspect.colors[t][1]+"m":e}function stylizeNoColor(e,r){return e}function arrayToHash(e){var r={};return e.forEach(function(e,t){r[e]=!0}),r}function formatValue(e,r,t){if(e.customInspect&&r&&isFunction(r.inspect)&&r.inspect!==exports.inspect&&(!r.constructor||r.constructor.prototype!==r)){var n=r.inspect(t,e);return isString(n)||(n=formatValue(e,n,t)),n}var i=formatPrimitive(e,r);if(i)return i;var o=Object.keys(r),s=arrayToHash(o);if(e.showHidden&&(o=Object.getOwnPropertyNames(r)),isError(r)&&(o.indexOf("message")>=0||o.indexOf("description")>=0))return formatError(r);if(0===o.length){if(isFunction(r)){var u=r.name?": "+r.name:"";return e.stylize("[Function"+u+"]","special")}if(isRegExp(r))return e.stylize(RegExp.prototype.toString.call(r),"regexp");if(isDate(r))return e.stylize(Date.prototype.toString.call(r),"date");if(isError(r))return formatError(r)}var c="",a=!1,l=["{","}"];if(isArray(r)&&(a=!0,l=["[","]"]),isFunction(r)&&(c=" [Function"+(r.name?": "+r.name:"")+"]"),isRegExp(r)&&(c=" "+RegExp.prototype.toString.call(r)),isDate(r)&&(c=" "+Date.prototype.toUTCString.call(r)),isError(r)&&(c=" "+formatError(r)),0===o.length&&(!a||0==r.length))return l[0]+c+l[1];if(t<0)return isRegExp(r)?e.stylize(RegExp.prototype.toString.call(r),"regexp"):e.stylize("[Object]","special");e.seen.push(r);var p;return p=a?formatArray(e,r,t,s,o):o.map(function(n){return formatProperty(e,r,t,s,n,a)}),e.seen.pop(),reduceToSingleString(p,c,l)}function formatPrimitive(e,r){if(isUndefined(r))return e.stylize("undefined","undefined");if(isString(r)){var t="'"+JSON.stringify(r).replace(/^"|"$/g,"").replace(/'/g,"\\'").replace(/\\"/g,'"')+"'";return e.stylize(t,"string")}return isNumber(r)?e.stylize(""+r,"number"):isBoolean(r)?e.stylize(""+r,"boolean"):isNull(r)?e.stylize("null","null"):void 0}function formatError(e){return"["+Error.prototype.toString.call(e)+"]"}function formatArray(e,r,t,n,i){for(var o=[],s=0,u=r.length;s<u;++s)hasOwnProperty(r,String(s))?o.push(formatProperty(e,r,t,n,String(s),!0)):o.push("");return i.forEach(function(i){i.match(/^\d+$/)||o.push(formatProperty(e,r,t,n,i,!0))}),o}function formatProperty(e,r,t,n,i,o){var s,u,c;if((c=Object.getOwnPropertyDescriptor(r,i)||{value:r[i]}).get?u=c.set?e.stylize("[Getter/Setter]","special"):e.stylize("[Getter]","special"):c.set&&(u=e.stylize("[Setter]","special")),hasOwnProperty(n,i)||(s="["+i+"]"),u||(e.seen.indexOf(c.value)<0?(u=isNull(t)?formatValue(e,c.value,null):formatValue(e,c.value,t-1)).indexOf("\n")>-1&&(u=o?u.split("\n").map(function(e){return"  "+e}).join("\n").substr(2):"\n"+u.split("\n").map(function(e){return"   "+e}).join("\n")):u=e.stylize("[Circular]","special")),isUndefined(s)){if(o&&i.match(/^\d+$/))return u;(s=JSON.stringify(""+i)).match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?(s=s.substr(1,s.length-2),s=e.stylize(s,"name")):(s=s.replace(/'/g,"\\'").replace(/\\"/g,'"').replace(/(^"|"$)/g,"'"),s=e.stylize(s,"string"))}return s+": "+u}function reduceToSingleString(e,r,t){var n=0;return e.reduce(function(e,r){return n++,r.indexOf("\n")>=0&&n++,e+r.replace(/\u001b\[\d\d?m/g,"").length+1},0)>60?t[0]+(""===r?"":r+"\n ")+" "+e.join(",\n  ")+" "+t[1]:t[0]+r+" "+e.join(", ")+" "+t[1]}function isArray(e){return Array.isArray(e)}function isBoolean(e){return"boolean"==typeof e}function isNull(e){return null===e}function isNullOrUndefined(e){return null==e}function isNumber(e){return"number"==typeof e}function isString(e){return"string"==typeof e}function isSymbol(e){return"symbol"==typeof e}function isUndefined(e){return void 0===e}function isRegExp(e){return isObject(e)&&"[object RegExp]"===objectToString(e)}function isObject(e){return"object"==typeof e&&null!==e}function isDate(e){return isObject(e)&&"[object Date]"===objectToString(e)}function isError(e){return isObject(e)&&("[object Error]"===objectToString(e)||e instanceof Error)}function isFunction(e){return"function"==typeof e}function isPrimitive(e){return null===e||"boolean"==typeof e||"number"==typeof e||"string"==typeof e||"symbol"==typeof e||void 0===e}function objectToString(e){return Object.prototype.toString.call(e)}function pad(e){return e<10?"0"+e.toString(10):e.toString(10)}function timestamp(){var e=new Date,r=[pad(e.getHours()),pad(e.getMinutes()),pad(e.getSeconds())].join(":");return[e.getDate(),months[e.getMonth()],r].join(" ")}function hasOwnProperty(e,r){return Object.prototype.hasOwnProperty.call(e,r)}var formatRegExp=/%[sdj%]/g;exports.format=function(e){if(!isString(e)){for(var r=[],t=0;t<arguments.length;t++)r.push(inspect(arguments[t]));return r.join(" ")}for(var t=1,n=arguments,i=n.length,o=String(e).replace(formatRegExp,function(e){if("%%"===e)return"%";if(t>=i)return e;switch(e){case"%s":return String(n[t++]);case"%d":return Number(n[t++]);case"%j":try{return JSON.stringify(n[t++])}catch(e){return"[Circular]"}default:return e}}),s=n[t];t<i;s=n[++t])isNull(s)||!isObject(s)?o+=" "+s:o+=" "+inspect(s);return o},exports.deprecate=function(e,r){if(isUndefined(global.process))return function(){return exports.deprecate(e,r).apply(this,arguments)};if(!0===process.noDeprecation)return e;var t=!1;return function deprecated(){if(!t){if(process.throwDeprecation)throw new Error(r);process.traceDeprecation?console.trace(r):console.error(r),t=!0}return e.apply(this,arguments)}};var debugEnviron,debugs={};exports.debuglog=function(e){if(isUndefined(debugEnviron)&&(debugEnviron=process.env.NODE_DEBUG||""),e=e.toUpperCase(),!debugs[e])if(new RegExp("\\b"+e+"\\b","i").test(debugEnviron)){var r=process.pid;debugs[e]=function(){var t=exports.format.apply(exports,arguments);console.error("%s %d: %s",e,r,t)}}else debugs[e]=function(){};return debugs[e]},exports.inspect=inspect,inspect.colors={bold:[1,22],italic:[3,23],underline:[4,24],inverse:[7,27],white:[37,39],grey:[90,39],black:[30,39],blue:[34,39],cyan:[36,39],green:[32,39],magenta:[35,39],red:[31,39],yellow:[33,39]},inspect.styles={special:"cyan",number:"yellow",boolean:"yellow",undefined:"grey",null:"bold",string:"green",date:"magenta",regexp:"red"},exports.isArray=isArray,exports.isBoolean=isBoolean,exports.isNull=isNull,exports.isNullOrUndefined=isNullOrUndefined,exports.isNumber=isNumber,exports.isString=isString,exports.isSymbol=isSymbol,exports.isUndefined=isUndefined,exports.isRegExp=isRegExp,exports.isObject=isObject,exports.isDate=isDate,exports.isError=isError,exports.isFunction=isFunction,exports.isPrimitive=isPrimitive,exports.isBuffer=_dereq_("./support/isBuffer");var months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];exports.log=function(){console.log("%s - %s",timestamp(),exports.format.apply(exports,arguments))},exports.inherits=_dereq_("inherits"),exports._extend=function(e,r){if(!r||!isObject(r))return e;for(var t=Object.keys(r),n=t.length;n--;)e[t[n]]=r[t[n]];return e};

}).call(this,_dereq_('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":6,"_process":4,"inherits":5}],8:[function(_dereq_,module,exports){
"use strict";function _classCallCheck(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}var _createClass=function(){function defineProperties(e,t){for(var r=0;r<t.length;r++){var n=t[r];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(e,n.key,n)}}return function(e,t,r){return t&&defineProperties(e.prototype,t),r&&defineProperties(e,r),e}}(),_require=_dereq_("./helpers.js"),createDataProperty=_require.createDataProperty;module.exports=function(){function ByteLengthQueuingStrategy(e){var t=e.highWaterMark;_classCallCheck(this,ByteLengthQueuingStrategy),createDataProperty(this,"highWaterMark",t)}return _createClass(ByteLengthQueuingStrategy,[{key:"size",value:function size(e){return e.byteLength}}]),ByteLengthQueuingStrategy}();

},{"./helpers.js":10}],9:[function(_dereq_,module,exports){
"use strict";function _classCallCheck(e,r){if(!(e instanceof r))throw new TypeError("Cannot call a class as a function")}var _createClass=function(){function defineProperties(e,r){for(var t=0;t<r.length;t++){var a=r[t];a.enumerable=a.enumerable||!1,a.configurable=!0,"value"in a&&(a.writable=!0),Object.defineProperty(e,a.key,a)}}return function(e,r,t){return r&&defineProperties(e.prototype,r),t&&defineProperties(e,t),e}}(),_require=_dereq_("./helpers.js"),createDataProperty=_require.createDataProperty;module.exports=function(){function CountQueuingStrategy(e){var r=e.highWaterMark;_classCallCheck(this,CountQueuingStrategy),createDataProperty(this,"highWaterMark",r)}return _createClass(CountQueuingStrategy,[{key:"size",value:function size(){return 1}}]),CountQueuingStrategy}();

},{"./helpers.js":10}],10:[function(_dereq_,module,exports){
"use strict";function IsPropertyKey(e){return"string"==typeof e||"symbol"===(void 0===e?"undefined":_typeof(e))}function Call(e,r,t){if("function"!=typeof e)throw new TypeError("Argument is not a function");return Function.prototype.apply.call(e,r,t)}function PromiseCall(e,r,t){try{return Promise.resolve(Call(e,r,t))}catch(e){return Promise.reject(e)}}var _typeof="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},assert=_dereq_("better-assert"),isFakeDetached=Symbol('is "detached" for our purposes');exports.typeIsObject=function(e){return"object"===(void 0===e?"undefined":_typeof(e))&&null!==e||"function"==typeof e},exports.createDataProperty=function(e,r,t){Object.defineProperty(e,r,{value:t,writable:!0,enumerable:!0,configurable:!0})},exports.createArrayFromList=function(e){return e.slice()},exports.ArrayBufferCopy=function(e,r,t,n,o){new Uint8Array(e).set(new Uint8Array(t,n,o),r)},exports.CreateIterResultObject=function(e,r){var t={};return Object.defineProperty(t,"value",{value:e,enumerable:!0,writable:!0,configurable:!0}),Object.defineProperty(t,"done",{value:r,enumerable:!0,writable:!0,configurable:!0}),t},exports.IsFiniteNonNegativeNumber=function(e){return!1!==exports.IsNonNegativeNumber(e)&&e!==1/0},exports.IsNonNegativeNumber=function(e){return"number"==typeof e&&(!Number.isNaN(e)&&!(e<0))},exports.Call=Call,exports.CreateAlgorithmFromUnderlyingMethod=function(e,r,t,n){var o=e[r];if(void 0!==o){if("function"!=typeof o)throw new TypeError(o+" is not a method");switch(t){case 0:return function(){return PromiseCall(o,e,n)};case 1:return function(r){var t=[r].concat(n);return PromiseCall(o,e,t)}}}return function(){return Promise.resolve()}},exports.InvokeOrNoop=function(e,r,t){var n=e[r];if(void 0!==n)return Call(n,e,t)},exports.PromiseCall=PromiseCall,exports.TransferArrayBuffer=function(e){var r=e.slice();return Object.defineProperty(e,"byteLength",{get:function get(){return 0}}),e[isFakeDetached]=!0,r},exports.IsDetachedBuffer=function(e){return isFakeDetached in e},exports.ValidateAndNormalizeHighWaterMark=function(e){if(e=Number(e),Number.isNaN(e)||e<0)throw new RangeError("highWaterMark property of a queuing strategy must be non-negative and non-NaN");return e},exports.MakeSizeAlgorithmFromSizeFunction=function(e){if(void 0===e)return function(){return 1};if("function"!=typeof e)throw new TypeError("size property of a queuing strategy must be a function");return function(r){return e(r)}};

},{"better-assert":16}],11:[function(_dereq_,module,exports){
"use strict";var assert=_dereq_("better-assert"),_require=_dereq_("./helpers.js"),IsFiniteNonNegativeNumber=_require.IsFiniteNonNegativeNumber;exports.DequeueValue=function(e){var u=e._queue.shift();return e._queueTotalSize-=u.size,e._queueTotalSize<0&&(e._queueTotalSize=0),u.value},exports.EnqueueValueWithSize=function(e,u,t){if(t=Number(t),!IsFiniteNonNegativeNumber(t))throw new RangeError("Size must be a finite, non-NaN, non-negative number.");e._queue.push({value:u,size:t}),e._queueTotalSize+=t},exports.PeekQueueValue=function(e){return e._queue[0].value},exports.ResetQueue=function(e){e._queue=[],e._queueTotalSize=0};

},{"./helpers.js":10,"better-assert":16}],12:[function(_dereq_,module,exports){
"use strict";function _classCallCheck(e,r){if(!(e instanceof r))throw new TypeError("Cannot call a class as a function")}function AcquireReadableStreamBYOBReader(e){return new ReadableStreamBYOBReader(e)}function AcquireReadableStreamDefaultReader(e){return new ReadableStreamDefaultReader(e)}function CreateReadableStream(e,r,t){var a=arguments.length>3&&void 0!==arguments[3]?arguments[3]:1,l=arguments.length>4&&void 0!==arguments[4]?arguments[4]:function(){return 1},o=Object.create(ReadableStream.prototype);return InitializeReadableStream(o),SetUpReadableStreamDefaultController(o,Object.create(ReadableStreamDefaultController.prototype),e,r,t,a,l),o}function CreateReadableByteStream(e,r,t){var a=arguments.length>3&&void 0!==arguments[3]?arguments[3]:0,l=arguments.length>4&&void 0!==arguments[4]?arguments[4]:void 0,o=Object.create(ReadableStream.prototype);return InitializeReadableStream(o),SetUpReadableByteStreamController(o,Object.create(ReadableByteStreamController.prototype),e,r,t,a,l),o}function InitializeReadableStream(e){e._state="readable",e._reader=void 0,e._storedError=void 0,e._disturbed=!1}function IsReadableStream(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_readableStreamController")}function IsReadableStreamDisturbed(e){return e._disturbed}function IsReadableStreamLocked(e){return void 0!==e._reader}function ReadableStreamTee(e,r){function pullAlgorithm(){return ReadableStreamDefaultReaderRead(t).then(function(e){var r=e.value;if(!0===e.done&&!1===a&&(!1===l&&ReadableStreamDefaultControllerClose(d._readableStreamController),!1===o&&ReadableStreamDefaultControllerClose(s._readableStreamController),a=!0),!0!==a){var t=r,n=r;!1===l&&ReadableStreamDefaultControllerEnqueue(d._readableStreamController,t),!1===o&&ReadableStreamDefaultControllerEnqueue(s._readableStreamController,n)}})}function startAlgorithm(){}var t=AcquireReadableStreamDefaultReader(e),a=!1,l=!1,o=!1,n=void 0,i=void 0,d=void 0,s=void 0,u=void 0,c=new Promise(function(e){u=e});return d=CreateReadableStream(startAlgorithm,pullAlgorithm,function cancel1Algorithm(r){if(l=!0,n=r,!0===o){var t=createArrayFromList([n,i]),a=ReadableStreamCancel(e,t);u(a)}return c}),s=CreateReadableStream(startAlgorithm,pullAlgorithm,function cancel2Algorithm(r){if(o=!0,i=r,!0===l){var t=createArrayFromList([n,i]),a=ReadableStreamCancel(e,t);u(a)}return c}),t._closedPromise.catch(function(e){!0!==a&&(ReadableStreamDefaultControllerErrorIfNeeded(d._readableStreamController,e),ReadableStreamDefaultControllerErrorIfNeeded(s._readableStreamController,e),a=!0)}),[d,s]}function ReadableStreamAddReadIntoRequest(e){return new Promise(function(r,t){var a={_resolve:r,_reject:t};e._reader._readIntoRequests.push(a)})}function ReadableStreamAddReadRequest(e){return new Promise(function(r,t){var a={_resolve:r,_reject:t};e._reader._readRequests.push(a)})}function ReadableStreamCancel(e,r){return e._disturbed=!0,"closed"===e._state?Promise.resolve(void 0):"errored"===e._state?Promise.reject(e._storedError):(ReadableStreamClose(e),e._readableStreamController[CancelSteps](r).then(function(){}))}function ReadableStreamClose(e){e._state="closed";var r=e._reader;if(void 0!==r){if(!0===IsReadableStreamDefaultReader(r)){var t=!0,a=!1,l=void 0;try{for(var o,n=r._readRequests[Symbol.iterator]();!(t=(o=n.next()).done);t=!0)(0,o.value._resolve)(CreateIterResultObject(void 0,!0))}catch(e){a=!0,l=e}finally{try{!t&&n.return&&n.return()}finally{if(a)throw l}}r._readRequests=[]}defaultReaderClosedPromiseResolve(r)}}function ReadableStreamError(e,r){e._state="errored",e._storedError=r;var t=e._reader;if(void 0!==t){if(!0===IsReadableStreamDefaultReader(t)){var a=!0,l=!1,o=void 0;try{for(var n,i=t._readRequests[Symbol.iterator]();!(a=(n=i.next()).done);a=!0)n.value._reject(r)}catch(e){l=!0,o=e}finally{try{!a&&i.return&&i.return()}finally{if(l)throw o}}t._readRequests=[]}else{var d=!0,s=!1,u=void 0;try{for(var c,b=t._readIntoRequests[Symbol.iterator]();!(d=(c=b.next()).done);d=!0)c.value._reject(r)}catch(e){s=!0,u=e}finally{try{!d&&b.return&&b.return()}finally{if(s)throw u}}t._readIntoRequests=[]}defaultReaderClosedPromiseReject(t,r),t._closedPromise.catch(function(){})}}function ReadableStreamFulfillReadIntoRequest(e,r,t){e._reader._readIntoRequests.shift()._resolve(CreateIterResultObject(r,t))}function ReadableStreamFulfillReadRequest(e,r,t){e._reader._readRequests.shift()._resolve(CreateIterResultObject(r,t))}function ReadableStreamGetNumReadIntoRequests(e){return e._reader._readIntoRequests.length}function ReadableStreamGetNumReadRequests(e){return e._reader._readRequests.length}function ReadableStreamHasBYOBReader(e){var r=e._reader;return void 0!==r&&!1!==IsReadableStreamBYOBReader(r)}function ReadableStreamHasDefaultReader(e){var r=e._reader;return void 0!==r&&!1!==IsReadableStreamDefaultReader(r)}function IsReadableStreamBYOBReader(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_readIntoRequests")}function IsReadableStreamDefaultReader(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_readRequests")}function ReadableStreamReaderGenericInitialize(e,r){e._ownerReadableStream=r,r._reader=e,"readable"===r._state?defaultReaderClosedPromiseInitialize(e):"closed"===r._state?defaultReaderClosedPromiseInitializeAsResolved(e):(defaultReaderClosedPromiseInitializeAsRejected(e,r._storedError),e._closedPromise.catch(function(){}))}function ReadableStreamReaderGenericCancel(e,r){return ReadableStreamCancel(e._ownerReadableStream,r)}function ReadableStreamReaderGenericRelease(e){"readable"===e._ownerReadableStream._state?defaultReaderClosedPromiseReject(e,new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")):defaultReaderClosedPromiseResetToRejected(e,new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")),e._closedPromise.catch(function(){}),e._ownerReadableStream._reader=void 0,e._ownerReadableStream=void 0}function ReadableStreamBYOBReaderRead(e,r){var t=e._ownerReadableStream;return t._disturbed=!0,"errored"===t._state?Promise.reject(t._storedError):ReadableByteStreamControllerPullInto(t._readableStreamController,r)}function ReadableStreamDefaultReaderRead(e){var r=e._ownerReadableStream;return r._disturbed=!0,"closed"===r._state?Promise.resolve(CreateIterResultObject(void 0,!0)):"errored"===r._state?Promise.reject(r._storedError):r._readableStreamController[PullSteps]()}function IsReadableStreamDefaultController(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_controlledReadableStream")}function ReadableStreamDefaultControllerCallPullIfNeeded(e){!1!==ReadableStreamDefaultControllerShouldCallPull(e)&&(!0!==e._pulling?(e._pulling=!0,e._pullAlgorithm().then(function(){if(e._pulling=!1,!0===e._pullAgain)return e._pullAgain=!1,ReadableStreamDefaultControllerCallPullIfNeeded(e)},function(r){ReadableStreamDefaultControllerErrorIfNeeded(e,r)}).catch(rethrowAssertionErrorRejection)):e._pullAgain=!0)}function ReadableStreamDefaultControllerShouldCallPull(e){var r=e._controlledReadableStream;return!1!==ReadableStreamDefaultControllerCanCloseOrEnqueue(e)&&(!1!==e._started&&(!0===IsReadableStreamLocked(r)&&ReadableStreamGetNumReadRequests(r)>0||ReadableStreamDefaultControllerGetDesiredSize(e)>0))}function ReadableStreamDefaultControllerClose(e){var r=e._controlledReadableStream;e._closeRequested=!0,0===e._queue.length&&ReadableStreamClose(r)}function ReadableStreamDefaultControllerEnqueue(e,r){var t=e._controlledReadableStream;if(!0===IsReadableStreamLocked(t)&&ReadableStreamGetNumReadRequests(t)>0)ReadableStreamFulfillReadRequest(t,r,!1);else{var a=void 0;try{a=e._strategySizeAlgorithm(r)}catch(r){throw ReadableStreamDefaultControllerErrorIfNeeded(e,r),r}try{EnqueueValueWithSize(e,r,a)}catch(r){throw ReadableStreamDefaultControllerErrorIfNeeded(e,r),r}}ReadableStreamDefaultControllerCallPullIfNeeded(e)}function ReadableStreamDefaultControllerError(e,r){var t=e._controlledReadableStream;ResetQueue(e),ReadableStreamError(t,r)}function ReadableStreamDefaultControllerErrorIfNeeded(e,r){"readable"===e._controlledReadableStream._state&&ReadableStreamDefaultControllerError(e,r)}function ReadableStreamDefaultControllerGetDesiredSize(e){var r=e._controlledReadableStream._state;return"errored"===r?null:"closed"===r?0:e._strategyHWM-e._queueTotalSize}function ReadableStreamDefaultControllerHasBackpressure(e){return!0!==ReadableStreamDefaultControllerShouldCallPull(e)}function ReadableStreamDefaultControllerCanCloseOrEnqueue(e){var r=e._controlledReadableStream._state;return!1===e._closeRequested&&"readable"===r}function SetUpReadableStreamDefaultController(e,r,t,a,l,o,n){r._controlledReadableStream=e,r._queue=void 0,r._queueTotalSize=void 0,ResetQueue(r),r._started=!1,r._closeRequested=!1,r._pullAgain=!1,r._pulling=!1,r._strategySizeAlgorithm=n,r._strategyHWM=o,r._pullAlgorithm=a,r._cancelAlgorithm=l,e._readableStreamController=r;var i=t();Promise.resolve(i).then(function(){r._started=!0,ReadableStreamDefaultControllerCallPullIfNeeded(r)},function(e){ReadableStreamDefaultControllerErrorIfNeeded(r,e)}).catch(rethrowAssertionErrorRejection)}function SetUpReadableStreamDefaultControllerFromUnderlyingSource(e,r,t,a){var l=Object.create(ReadableStreamDefaultController.prototype),o=CreateAlgorithmFromUnderlyingMethod(r,"pull",0,[l]),n=CreateAlgorithmFromUnderlyingMethod(r,"cancel",1,[]);SetUpReadableStreamDefaultController(e,l,function startAlgorithm(){return InvokeOrNoop(r,"start",[l])},o,n,t,a)}function IsReadableByteStreamController(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_controlledReadableByteStream")}function IsReadableStreamBYOBRequest(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_associatedReadableByteStreamController")}function ReadableByteStreamControllerCallPullIfNeeded(e){!1!==ReadableByteStreamControllerShouldCallPull(e)&&(!0!==e._pulling?(e._pulling=!0,e._pullAlgorithm().then(function(){e._pulling=!1,!0===e._pullAgain&&(e._pullAgain=!1,ReadableByteStreamControllerCallPullIfNeeded(e))},function(r){"readable"===e._controlledReadableByteStream._state&&ReadableByteStreamControllerError(e,r)}).catch(rethrowAssertionErrorRejection)):e._pullAgain=!0)}function ReadableByteStreamControllerClearPendingPullIntos(e){ReadableByteStreamControllerInvalidateBYOBRequest(e),e._pendingPullIntos=[]}function ReadableByteStreamControllerCommitPullIntoDescriptor(e,r){var t=!1;"closed"===e._state&&(t=!0);var a=ReadableByteStreamControllerConvertPullIntoDescriptor(r);"default"===r.readerType?ReadableStreamFulfillReadRequest(e,a,t):ReadableStreamFulfillReadIntoRequest(e,a,t)}function ReadableByteStreamControllerConvertPullIntoDescriptor(e){var r=e.bytesFilled,t=e.elementSize;return new e.ctor(e.buffer,e.byteOffset,r/t)}function ReadableByteStreamControllerEnqueueChunkToQueue(e,r,t,a){e._queue.push({buffer:r,byteOffset:t,byteLength:a}),e._queueTotalSize+=a}function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(e,r){var t=r.elementSize,a=r.bytesFilled-r.bytesFilled%t,l=Math.min(e._queueTotalSize,r.byteLength-r.bytesFilled),o=r.bytesFilled+l,n=o-o%t,i=l,d=!1;n>a&&(i=n-r.bytesFilled,d=!0);for(var s=e._queue;i>0;){var u=s[0],c=Math.min(i,u.byteLength),b=r.byteOffset+r.bytesFilled;ArrayBufferCopy(r.buffer,b,u.buffer,u.byteOffset,c),u.byteLength===c?s.shift():(u.byteOffset+=c,u.byteLength-=c),e._queueTotalSize-=c,ReadableByteStreamControllerFillHeadPullIntoDescriptor(e,c,r),i-=c}return d}function ReadableByteStreamControllerFillHeadPullIntoDescriptor(e,r,t){ReadableByteStreamControllerInvalidateBYOBRequest(e),t.bytesFilled+=r}function ReadableByteStreamControllerHandleQueueDrain(e){0===e._queueTotalSize&&!0===e._closeRequested?ReadableStreamClose(e._controlledReadableByteStream):ReadableByteStreamControllerCallPullIfNeeded(e)}function ReadableByteStreamControllerInvalidateBYOBRequest(e){void 0!==e._byobRequest&&(e._byobRequest._associatedReadableByteStreamController=void 0,e._byobRequest._view=void 0,e._byobRequest=void 0)}function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(e){for(;e._pendingPullIntos.length>0;){if(0===e._queueTotalSize)return;var r=e._pendingPullIntos[0];!0===ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(e,r)&&(ReadableByteStreamControllerShiftPendingPullInto(e),ReadableByteStreamControllerCommitPullIntoDescriptor(e._controlledReadableByteStream,r))}}function ReadableByteStreamControllerPullInto(e,r){var t=e._controlledReadableByteStream,a=1;r.constructor!==DataView&&(a=r.constructor.BYTES_PER_ELEMENT);var l=r.constructor,o={buffer:TransferArrayBuffer(r.buffer),byteOffset:r.byteOffset,byteLength:r.byteLength,bytesFilled:0,elementSize:a,ctor:l,readerType:"byob"};if(e._pendingPullIntos.length>0)return e._pendingPullIntos.push(o),ReadableStreamAddReadIntoRequest(t);if("closed"===t._state){var n=new r.constructor(o.buffer,o.byteOffset,0);return Promise.resolve(CreateIterResultObject(n,!0))}if(e._queueTotalSize>0){if(!0===ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(e,o)){var i=ReadableByteStreamControllerConvertPullIntoDescriptor(o);return ReadableByteStreamControllerHandleQueueDrain(e),Promise.resolve(CreateIterResultObject(i,!1))}if(!0===e._closeRequested){var d=new TypeError("Insufficient bytes to fill elements in the given buffer");return ReadableByteStreamControllerError(e,d),Promise.reject(d)}}e._pendingPullIntos.push(o);var s=ReadableStreamAddReadIntoRequest(t);return ReadableByteStreamControllerCallPullIfNeeded(e),s}function ReadableByteStreamControllerRespondInClosedState(e,r){r.buffer=TransferArrayBuffer(r.buffer);var t=e._controlledReadableByteStream;if(!0===ReadableStreamHasBYOBReader(t))for(;ReadableStreamGetNumReadIntoRequests(t)>0;)ReadableByteStreamControllerCommitPullIntoDescriptor(t,ReadableByteStreamControllerShiftPendingPullInto(e))}function ReadableByteStreamControllerRespondInReadableState(e,r,t){if(t.bytesFilled+r>t.byteLength)throw new RangeError("bytesWritten out of range");if(ReadableByteStreamControllerFillHeadPullIntoDescriptor(e,r,t),!(t.bytesFilled<t.elementSize)){ReadableByteStreamControllerShiftPendingPullInto(e);var a=t.bytesFilled%t.elementSize;if(a>0){var l=t.byteOffset+t.bytesFilled,o=t.buffer.slice(l-a,l);ReadableByteStreamControllerEnqueueChunkToQueue(e,o,0,o.byteLength)}t.buffer=TransferArrayBuffer(t.buffer),t.bytesFilled-=a,ReadableByteStreamControllerCommitPullIntoDescriptor(e._controlledReadableByteStream,t),ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(e)}}function ReadableByteStreamControllerRespondInternal(e,r){var t=e._pendingPullIntos[0];if("closed"===e._controlledReadableByteStream._state){if(0!==r)throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");ReadableByteStreamControllerRespondInClosedState(e,t)}else ReadableByteStreamControllerRespondInReadableState(e,r,t)}function ReadableByteStreamControllerShiftPendingPullInto(e){var r=e._pendingPullIntos.shift();return ReadableByteStreamControllerInvalidateBYOBRequest(e),r}function ReadableByteStreamControllerShouldCallPull(e){var r=e._controlledReadableByteStream;return"readable"===r._state&&(!0!==e._closeRequested&&(!1!==e._started&&(!0===ReadableStreamHasDefaultReader(r)&&ReadableStreamGetNumReadRequests(r)>0||(!0===ReadableStreamHasBYOBReader(r)&&ReadableStreamGetNumReadIntoRequests(r)>0||ReadableByteStreamControllerGetDesiredSize(e)>0))))}function ReadableByteStreamControllerClose(e){var r=e._controlledReadableByteStream;if(e._queueTotalSize>0)e._closeRequested=!0;else{if(e._pendingPullIntos.length>0&&e._pendingPullIntos[0].bytesFilled>0){var t=new TypeError("Insufficient bytes to fill elements in the given buffer");throw ReadableByteStreamControllerError(e,t),t}ReadableStreamClose(r)}}function ReadableByteStreamControllerEnqueue(e,r){var t=e._controlledReadableByteStream,a=r.buffer,l=r.byteOffset,o=r.byteLength,n=TransferArrayBuffer(a);!0===ReadableStreamHasDefaultReader(t)?0===ReadableStreamGetNumReadRequests(t)?ReadableByteStreamControllerEnqueueChunkToQueue(e,n,l,o):ReadableStreamFulfillReadRequest(t,new Uint8Array(n,l,o),!1):!0===ReadableStreamHasBYOBReader(t)?(ReadableByteStreamControllerEnqueueChunkToQueue(e,n,l,o),ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(e)):ReadableByteStreamControllerEnqueueChunkToQueue(e,n,l,o)}function ReadableByteStreamControllerError(e,r){var t=e._controlledReadableByteStream;ReadableByteStreamControllerClearPendingPullIntos(e),ResetQueue(e),ReadableStreamError(t,r)}function ReadableByteStreamControllerGetDesiredSize(e){var r=e._controlledReadableByteStream._state;return"errored"===r?null:"closed"===r?0:e._strategyHWM-e._queueTotalSize}function ReadableByteStreamControllerRespond(e,r){if(r=Number(r),!1===IsFiniteNonNegativeNumber(r))throw new RangeError("bytesWritten must be a finite");ReadableByteStreamControllerRespondInternal(e,r)}function ReadableByteStreamControllerRespondWithNewView(e,r){var t=e._pendingPullIntos[0];if(t.byteOffset+t.bytesFilled!==r.byteOffset)throw new RangeError("The region specified by view does not match byobRequest");if(t.byteLength!==r.byteLength)throw new RangeError("The buffer of view has different capacity than byobRequest");t.buffer=r.buffer,ReadableByteStreamControllerRespondInternal(e,r.byteLength)}function SetUpReadableByteStreamController(e,r,t,a,l,o,n){r._controlledReadableByteStream=e,r._pullAgain=!1,r._pulling=!1,ReadableByteStreamControllerClearPendingPullIntos(r),r._queue=r._queueTotalSize=void 0,ResetQueue(r),r._closeRequested=!1,r._started=!1,r._strategyHWM=ValidateAndNormalizeHighWaterMark(o),r._pullAlgorithm=a,r._cancelAlgorithm=l,r._autoAllocateChunkSize=n,r._pendingPullIntos=[],e._readableStreamController=r;var i=t();Promise.resolve(i).then(function(){r._started=!0,ReadableByteStreamControllerCallPullIfNeeded(r)},function(t){"readable"===e._state&&ReadableByteStreamControllerError(r,t)}).catch(rethrowAssertionErrorRejection)}function SetUpReadableByteStreamControllerFromUnderlyingSource(e,r,t){var a=Object.create(ReadableByteStreamController.prototype),l=CreateAlgorithmFromUnderlyingMethod(r,"pull",0,[a]),o=CreateAlgorithmFromUnderlyingMethod(r,"cancel",1,[]),n=r.autoAllocateChunkSize;if(void 0!==n&&(!1===Number.isInteger(n)||n<=0))throw new RangeError("autoAllocateChunkSize must be a positive integer");SetUpReadableByteStreamController(e,a,function startAlgorithm(){return InvokeOrNoop(r,"start",[a])},l,o,t,n)}function SetUpReadableStreamBYOBRequest(e,r,t){e._associatedReadableByteStreamController=r,e._view=t}function streamBrandCheckException(e){return new TypeError("ReadableStream.prototype."+e+" can only be used on a ReadableStream")}function readerLockException(e){return new TypeError("Cannot "+e+" a stream using a released reader")}function defaultReaderBrandCheckException(e){return new TypeError("ReadableStreamDefaultReader.prototype."+e+" can only be used on a ReadableStreamDefaultReader")}function defaultReaderClosedPromiseInitialize(e){e._closedPromise=new Promise(function(r,t){e._closedPromise_resolve=r,e._closedPromise_reject=t})}function defaultReaderClosedPromiseInitializeAsRejected(e,r){e._closedPromise=Promise.reject(r),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0}function defaultReaderClosedPromiseInitializeAsResolved(e){e._closedPromise=Promise.resolve(void 0),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0}function defaultReaderClosedPromiseReject(e,r){e._closedPromise_reject(r),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0}function defaultReaderClosedPromiseResetToRejected(e,r){e._closedPromise=Promise.reject(r)}function defaultReaderClosedPromiseResolve(e){e._closedPromise_resolve(void 0),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0}function byobReaderBrandCheckException(e){return new TypeError("ReadableStreamBYOBReader.prototype."+e+" can only be used on a ReadableStreamBYOBReader")}function defaultControllerBrandCheckException(e){return new TypeError("ReadableStreamDefaultController.prototype."+e+" can only be used on a ReadableStreamDefaultController")}function byobRequestBrandCheckException(e){return new TypeError("ReadableStreamBYOBRequest.prototype."+e+" can only be used on a ReadableStreamBYOBRequest")}function byteStreamControllerBrandCheckException(e){return new TypeError("ReadableByteStreamController.prototype."+e+" can only be used on a ReadableByteStreamController")}function ifIsObjectAndHasAPromiseIsHandledInternalSlotSetPromiseIsHandledToTrue(e){try{Promise.prototype.then.call(e,void 0,function(){})}catch(e){}}var _createClass=function(){function defineProperties(e,r){for(var t=0;t<r.length;t++){var a=r[t];a.enumerable=a.enumerable||!1,a.configurable=!0,"value"in a&&(a.writable=!0),Object.defineProperty(e,a.key,a)}}return function(e,r,t){return r&&defineProperties(e.prototype,r),t&&defineProperties(e,t),e}}(),assert=_dereq_("better-assert"),_require=_dereq_("./helpers.js"),ArrayBufferCopy=_require.ArrayBufferCopy,CreateAlgorithmFromUnderlyingMethod=_require.CreateAlgorithmFromUnderlyingMethod,CreateIterResultObject=_require.CreateIterResultObject,IsFiniteNonNegativeNumber=_require.IsFiniteNonNegativeNumber,InvokeOrNoop=_require.InvokeOrNoop,IsDetachedBuffer=_require.IsDetachedBuffer,TransferArrayBuffer=_require.TransferArrayBuffer,ValidateAndNormalizeHighWaterMark=_require.ValidateAndNormalizeHighWaterMark,IsNonNegativeNumber=_require.IsNonNegativeNumber,MakeSizeAlgorithmFromSizeFunction=_require.MakeSizeAlgorithmFromSizeFunction,createArrayFromList=_require.createArrayFromList,typeIsObject=_require.typeIsObject,_require2=_dereq_("./utils.js"),rethrowAssertionErrorRejection=_require2.rethrowAssertionErrorRejection,_require3=_dereq_("./queue-with-sizes.js"),DequeueValue=_require3.DequeueValue,EnqueueValueWithSize=_require3.EnqueueValueWithSize,ResetQueue=_require3.ResetQueue,_require4=_dereq_("./writable-stream.js"),AcquireWritableStreamDefaultWriter=_require4.AcquireWritableStreamDefaultWriter,IsWritableStream=_require4.IsWritableStream,IsWritableStreamLocked=_require4.IsWritableStreamLocked,WritableStreamAbort=_require4.WritableStreamAbort,WritableStreamDefaultWriterCloseWithErrorPropagation=_require4.WritableStreamDefaultWriterCloseWithErrorPropagation,WritableStreamDefaultWriterRelease=_require4.WritableStreamDefaultWriterRelease,WritableStreamDefaultWriterWrite=_require4.WritableStreamDefaultWriterWrite,WritableStreamCloseQueuedOrInFlight=_require4.WritableStreamCloseQueuedOrInFlight,CancelSteps=Symbol("[[CancelSteps]]"),PullSteps=Symbol("[[PullSteps]]"),ReadableStream=function(){function ReadableStream(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},t=r.size,a=r.highWaterMark;_classCallCheck(this,ReadableStream),InitializeReadableStream(this);var l=e.type;if("bytes"===String(l)){if(void 0===a&&(a=0),a=ValidateAndNormalizeHighWaterMark(a),void 0!==t)throw new RangeError("The strategy for a byte stream cannot have a size function");SetUpReadableByteStreamControllerFromUnderlyingSource(this,e,a)}else{if(void 0!==l)throw new RangeError("Invalid type is specified");void 0===a&&(a=1),SetUpReadableStreamDefaultControllerFromUnderlyingSource(this,e,a=ValidateAndNormalizeHighWaterMark(a),MakeSizeAlgorithmFromSizeFunction(t))}}return _createClass(ReadableStream,[{key:"cancel",value:function cancel(e){return!1===IsReadableStream(this)?Promise.reject(streamBrandCheckException("cancel")):!0===IsReadableStreamLocked(this)?Promise.reject(new TypeError("Cannot cancel a stream that already has a reader")):ReadableStreamCancel(this,e)}},{key:"getReader",value:function getReader(){var e=(arguments.length>0&&void 0!==arguments[0]?arguments[0]:{}).mode;if(!1===IsReadableStream(this))throw streamBrandCheckException("getReader");if(void 0===e)return AcquireReadableStreamDefaultReader(this);if("byob"===(e=String(e)))return AcquireReadableStreamBYOBReader(this);throw new RangeError("Invalid mode is specified")}},{key:"pipeThrough",value:function pipeThrough(e,r){var t=e.writable,a=e.readable;if(void 0===t||void 0===a)throw new TypeError("readable and writable arguments must be defined");return ifIsObjectAndHasAPromiseIsHandledInternalSlotSetPromiseIsHandledToTrue(this.pipeTo(t,r)),a}},{key:"pipeTo",value:function pipeTo(e){var r=this,t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},a=t.preventClose,l=t.preventAbort,o=t.preventCancel;if(!1===IsReadableStream(this))return Promise.reject(streamBrandCheckException("pipeTo"));if(!1===IsWritableStream(e))return Promise.reject(new TypeError("ReadableStream.prototype.pipeTo's first argument must be a WritableStream"));if(a=Boolean(a),l=Boolean(l),o=Boolean(o),!0===IsReadableStreamLocked(this))return Promise.reject(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream"));if(!0===IsWritableStreamLocked(e))return Promise.reject(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream"));var n=AcquireReadableStreamDefaultReader(this),i=AcquireWritableStreamDefaultWriter(e),d=!1,s=Promise.resolve();return new Promise(function(t,u){function pipeLoop(){return!0===d?Promise.resolve():i._readyPromise.then(function(){return ReadableStreamDefaultReaderRead(n).then(function(e){var r=e.value;!0!==e.done&&(s=WritableStreamDefaultWriterWrite(i,r).catch(function(){}))})}).then(pipeLoop)}function waitForWritesToFinish(){var e=s;return s.then(function(){return e!==s?waitForWritesToFinish():void 0})}function isOrBecomesErrored(e,r,t){"errored"===e._state?t(e._storedError):r.catch(t).catch(rethrowAssertionErrorRejection)}function shutdownWithAction(r,t,a){function doTheRest(){r().then(function(){return finalize(t,a)},function(e){return finalize(!0,e)}).catch(rethrowAssertionErrorRejection)}!0!==d&&(d=!0,"writable"===e._state&&!1===WritableStreamCloseQueuedOrInFlight(e)?waitForWritesToFinish().then(doTheRest):doTheRest())}function shutdown(r,t){!0!==d&&(d=!0,"writable"===e._state&&!1===WritableStreamCloseQueuedOrInFlight(e)?waitForWritesToFinish().then(function(){return finalize(r,t)}).catch(rethrowAssertionErrorRejection):finalize(r,t))}function finalize(e,r){WritableStreamDefaultWriterRelease(i),ReadableStreamReaderGenericRelease(n),e?u(r):t(void 0)}if(isOrBecomesErrored(r,n._closedPromise,function(r){!1===l?shutdownWithAction(function(){return WritableStreamAbort(e,r)},!0,r):shutdown(!0,r)}),isOrBecomesErrored(e,i._closedPromise,function(e){!1===o?shutdownWithAction(function(){return ReadableStreamCancel(r,e)},!0,e):shutdown(!0,e)}),function isOrBecomesClosed(e,r,t){"closed"===e._state?t():r.then(t).catch(rethrowAssertionErrorRejection)}(r,n._closedPromise,function(){!1===a?shutdownWithAction(function(){return WritableStreamDefaultWriterCloseWithErrorPropagation(i)}):shutdown()}),!0===WritableStreamCloseQueuedOrInFlight(e)||"closed"===e._state){var c=new TypeError("the destination writable stream closed before all data could be piped to it");!1===o?shutdownWithAction(function(){return ReadableStreamCancel(r,c)},!0,c):shutdown(!0,c)}pipeLoop().catch(function(e){s=Promise.resolve(),rethrowAssertionErrorRejection(e)})})}},{key:"tee",value:function tee(){if(!1===IsReadableStream(this))throw streamBrandCheckException("tee");var e=ReadableStreamTee(this,!1);return createArrayFromList(e)}},{key:"locked",get:function get(){if(!1===IsReadableStream(this))throw streamBrandCheckException("locked");return IsReadableStreamLocked(this)}}]),ReadableStream}();module.exports={CreateReadableByteStream:CreateReadableByteStream,CreateReadableStream:CreateReadableStream,ReadableStream:ReadableStream,IsReadableStreamDisturbed:IsReadableStreamDisturbed,ReadableStreamDefaultControllerClose:ReadableStreamDefaultControllerClose,ReadableStreamDefaultControllerEnqueue:ReadableStreamDefaultControllerEnqueue,ReadableStreamDefaultControllerError:ReadableStreamDefaultControllerError,ReadableStreamDefaultControllerGetDesiredSize:ReadableStreamDefaultControllerGetDesiredSize,ReadableStreamDefaultControllerHasBackpressure:ReadableStreamDefaultControllerHasBackpressure,ReadableStreamDefaultControllerCanCloseOrEnqueue:ReadableStreamDefaultControllerCanCloseOrEnqueue};var ReadableStreamDefaultReader=function(){function ReadableStreamDefaultReader(e){if(_classCallCheck(this,ReadableStreamDefaultReader),!1===IsReadableStream(e))throw new TypeError("ReadableStreamDefaultReader can only be constructed with a ReadableStream instance");if(!0===IsReadableStreamLocked(e))throw new TypeError("This stream has already been locked for exclusive reading by another reader");ReadableStreamReaderGenericInitialize(this,e),this._readRequests=[]}return _createClass(ReadableStreamDefaultReader,[{key:"cancel",value:function cancel(e){return!1===IsReadableStreamDefaultReader(this)?Promise.reject(defaultReaderBrandCheckException("cancel")):void 0===this._ownerReadableStream?Promise.reject(readerLockException("cancel")):ReadableStreamReaderGenericCancel(this,e)}},{key:"read",value:function read(){return!1===IsReadableStreamDefaultReader(this)?Promise.reject(defaultReaderBrandCheckException("read")):void 0===this._ownerReadableStream?Promise.reject(readerLockException("read from")):ReadableStreamDefaultReaderRead(this)}},{key:"releaseLock",value:function releaseLock(){if(!1===IsReadableStreamDefaultReader(this))throw defaultReaderBrandCheckException("releaseLock");if(void 0!==this._ownerReadableStream){if(this._readRequests.length>0)throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");ReadableStreamReaderGenericRelease(this)}}},{key:"closed",get:function get(){return!1===IsReadableStreamDefaultReader(this)?Promise.reject(defaultReaderBrandCheckException("closed")):this._closedPromise}}]),ReadableStreamDefaultReader}(),ReadableStreamBYOBReader=function(){function ReadableStreamBYOBReader(e){if(_classCallCheck(this,ReadableStreamBYOBReader),!IsReadableStream(e))throw new TypeError("ReadableStreamBYOBReader can only be constructed with a ReadableStream instance given a byte source");if(!1===IsReadableByteStreamController(e._readableStreamController))throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");if(IsReadableStreamLocked(e))throw new TypeError("This stream has already been locked for exclusive reading by another reader");ReadableStreamReaderGenericInitialize(this,e),this._readIntoRequests=[]}return _createClass(ReadableStreamBYOBReader,[{key:"cancel",value:function cancel(e){return IsReadableStreamBYOBReader(this)?void 0===this._ownerReadableStream?Promise.reject(readerLockException("cancel")):ReadableStreamReaderGenericCancel(this,e):Promise.reject(byobReaderBrandCheckException("cancel"))}},{key:"read",value:function read(e){return IsReadableStreamBYOBReader(this)?void 0===this._ownerReadableStream?Promise.reject(readerLockException("read from")):ArrayBuffer.isView(e)?!0===IsDetachedBuffer(e.buffer)?Promise.reject(new TypeError("Cannot read into a view onto a detached ArrayBuffer")):0===e.byteLength?Promise.reject(new TypeError("view must have non-zero byteLength")):ReadableStreamBYOBReaderRead(this,e):Promise.reject(new TypeError("view must be an array buffer view")):Promise.reject(byobReaderBrandCheckException("read"))}},{key:"releaseLock",value:function releaseLock(){if(!IsReadableStreamBYOBReader(this))throw byobReaderBrandCheckException("releaseLock");if(void 0!==this._ownerReadableStream){if(this._readIntoRequests.length>0)throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");ReadableStreamReaderGenericRelease(this)}}},{key:"closed",get:function get(){return IsReadableStreamBYOBReader(this)?this._closedPromise:Promise.reject(byobReaderBrandCheckException("closed"))}}]),ReadableStreamBYOBReader}(),ReadableStreamDefaultController=function(){function ReadableStreamDefaultController(){throw _classCallCheck(this,ReadableStreamDefaultController),new TypeError}return _createClass(ReadableStreamDefaultController,[{key:"close",value:function close(){if(!1===IsReadableStreamDefaultController(this))throw defaultControllerBrandCheckException("close");if(!1===ReadableStreamDefaultControllerCanCloseOrEnqueue(this))throw new TypeError("The stream is not in a state that permits close");ReadableStreamDefaultControllerClose(this)}},{key:"enqueue",value:function enqueue(e){if(!1===IsReadableStreamDefaultController(this))throw defaultControllerBrandCheckException("enqueue");if(!1===ReadableStreamDefaultControllerCanCloseOrEnqueue(this))throw new TypeError("The stream is not in a state that permits enqueue");return ReadableStreamDefaultControllerEnqueue(this,e)}},{key:"error",value:function error(e){if(!1===IsReadableStreamDefaultController(this))throw defaultControllerBrandCheckException("error");var r=this._controlledReadableStream;if("readable"!==r._state)throw new TypeError("The stream is "+r._state+" and so cannot be errored");ReadableStreamDefaultControllerError(this,e)}},{key:CancelSteps,value:function value(e){return ResetQueue(this),this._cancelAlgorithm(e)}},{key:PullSteps,value:function value(){var e=this._controlledReadableStream;if(this._queue.length>0){var r=DequeueValue(this);return!0===this._closeRequested&&0===this._queue.length?ReadableStreamClose(e):ReadableStreamDefaultControllerCallPullIfNeeded(this),Promise.resolve(CreateIterResultObject(r,!1))}var t=ReadableStreamAddReadRequest(e);return ReadableStreamDefaultControllerCallPullIfNeeded(this),t}},{key:"desiredSize",get:function get(){if(!1===IsReadableStreamDefaultController(this))throw defaultControllerBrandCheckException("desiredSize");return ReadableStreamDefaultControllerGetDesiredSize(this)}}]),ReadableStreamDefaultController}(),ReadableStreamBYOBRequest=function(){function ReadableStreamBYOBRequest(){throw _classCallCheck(this,ReadableStreamBYOBRequest),new TypeError("ReadableStreamBYOBRequest cannot be used directly")}return _createClass(ReadableStreamBYOBRequest,[{key:"respond",value:function respond(e){if(!1===IsReadableStreamBYOBRequest(this))throw byobRequestBrandCheckException("respond");if(void 0===this._associatedReadableByteStreamController)throw new TypeError("This BYOB request has been invalidated");if(!0===IsDetachedBuffer(this._view.buffer))throw new TypeError("The BYOB request's buffer has been detached and so cannot be used as a response");ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController,e)}},{key:"respondWithNewView",value:function respondWithNewView(e){if(!1===IsReadableStreamBYOBRequest(this))throw byobRequestBrandCheckException("respond");if(void 0===this._associatedReadableByteStreamController)throw new TypeError("This BYOB request has been invalidated");if(!ArrayBuffer.isView(e))throw new TypeError("You can only respond with array buffer views");if(!0===IsDetachedBuffer(e.buffer))throw new TypeError("The supplied view's buffer has been detached and so cannot be used as a response");ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController,e)}},{key:"view",get:function get(){if(!1===IsReadableStreamBYOBRequest(this))throw byobRequestBrandCheckException("view");return this._view}}]),ReadableStreamBYOBRequest}(),ReadableByteStreamController=function(){function ReadableByteStreamController(){throw _classCallCheck(this,ReadableByteStreamController),new TypeError("ReadableByteStreamController constructor cannot be used directly")}return _createClass(ReadableByteStreamController,[{key:"close",value:function close(){if(!1===IsReadableByteStreamController(this))throw byteStreamControllerBrandCheckException("close");if(!0===this._closeRequested)throw new TypeError("The stream has already been closed; do not close it again!");var e=this._controlledReadableByteStream._state;if("readable"!==e)throw new TypeError("The stream (in "+e+" state) is not in the readable state and cannot be closed");ReadableByteStreamControllerClose(this)}},{key:"enqueue",value:function enqueue(e){if(!1===IsReadableByteStreamController(this))throw byteStreamControllerBrandCheckException("enqueue");if(!0===this._closeRequested)throw new TypeError("stream is closed or draining");var r=this._controlledReadableByteStream._state;if("readable"!==r)throw new TypeError("The stream (in "+r+" state) is not in the readable state and cannot be enqueued to");if(!ArrayBuffer.isView(e))throw new TypeError("You can only enqueue array buffer views when using a ReadableByteStreamController");if(!0===IsDetachedBuffer(e.buffer))throw new TypeError("Cannot enqueue a view onto a detached ArrayBuffer");ReadableByteStreamControllerEnqueue(this,e)}},{key:"error",value:function error(e){if(!1===IsReadableByteStreamController(this))throw byteStreamControllerBrandCheckException("error");var r=this._controlledReadableByteStream;if("readable"!==r._state)throw new TypeError("The stream is "+r._state+" and so cannot be errored");ReadableByteStreamControllerError(this,e)}},{key:CancelSteps,value:function value(e){return this._pendingPullIntos.length>0&&(this._pendingPullIntos[0].bytesFilled=0),ResetQueue(this),this._cancelAlgorithm(e)}},{key:PullSteps,value:function value(){var e=this._controlledReadableByteStream;if(this._queueTotalSize>0){var r=this._queue.shift();this._queueTotalSize-=r.byteLength,ReadableByteStreamControllerHandleQueueDrain(this);var t=void 0;try{t=new Uint8Array(r.buffer,r.byteOffset,r.byteLength)}catch(e){return Promise.reject(e)}return Promise.resolve(CreateIterResultObject(t,!1))}var a=this._autoAllocateChunkSize;if(void 0!==a){var l=void 0;try{l=new ArrayBuffer(a)}catch(e){return Promise.reject(e)}var o={buffer:l,byteOffset:0,byteLength:a,bytesFilled:0,elementSize:1,ctor:Uint8Array,readerType:"default"};this._pendingPullIntos.push(o)}var n=ReadableStreamAddReadRequest(e);return ReadableByteStreamControllerCallPullIfNeeded(this),n}},{key:"byobRequest",get:function get(){if(!1===IsReadableByteStreamController(this))throw byteStreamControllerBrandCheckException("byobRequest");if(void 0===this._byobRequest&&this._pendingPullIntos.length>0){var e=this._pendingPullIntos[0],r=new Uint8Array(e.buffer,e.byteOffset+e.bytesFilled,e.byteLength-e.bytesFilled),t=Object.create(ReadableStreamBYOBRequest.prototype);SetUpReadableStreamBYOBRequest(t,this,r),this._byobRequest=t}return this._byobRequest}},{key:"desiredSize",get:function get(){if(!1===IsReadableByteStreamController(this))throw byteStreamControllerBrandCheckException("desiredSize");return ReadableByteStreamControllerGetDesiredSize(this)}}]),ReadableByteStreamController}();

},{"./helpers.js":10,"./queue-with-sizes.js":11,"./utils.js":14,"./writable-stream.js":15,"better-assert":16}],13:[function(_dereq_,module,exports){
"use strict";function _classCallCheck(r,e){if(!(r instanceof e))throw new TypeError("Cannot call a class as a function")}function CreateTransformStream(r,e,t){var a=arguments.length>3&&void 0!==arguments[3]?arguments[3]:1,o=arguments.length>4&&void 0!==arguments[4]?arguments[4]:function(){return 1},n=arguments.length>5&&void 0!==arguments[5]?arguments[5]:0,l=arguments.length>6&&void 0!==arguments[6]?arguments[6]:function(){return 1},i=Object.create(TransformStream.prototype),m=void 0;InitializeTransformStream(i,new Promise(function(r){m=r}),a,o,n,l),SetUpTransformStreamDefaultController(i,Object.create(TransformStreamDefaultController.prototype),e,t);var s=r();return m(s),i}function InitializeTransformStream(r,e,t,a,o,n){function startAlgorithm(){return e}r._writable=CreateWritableStream(startAlgorithm,function writeAlgorithm(e){return TransformStreamDefaultSinkWriteAlgorithm(r,e)},function closeAlgorithm(){return TransformStreamDefaultSinkCloseAlgorithm(r)},function abortAlgorithm(){return TransformStreamDefaultSinkAbortAlgorithm(r)},t,a),r._readable=CreateReadableStream(startAlgorithm,function pullAlgorithm(){return TransformStreamDefaultSourcePullAlgorithm(r)},function cancelAlgorithm(e){return TransformStreamErrorWritableAndUnblockWrite(r,e),Promise.resolve()},o,n),r._backpressure=void 0,r._backpressureChangePromise=void 0,r._backpressureChangePromise_resolve=void 0,TransformStreamSetBackpressure(r,!0),r._transformStreamController=void 0}function IsTransformStream(r){return!!typeIsObject(r)&&!!Object.prototype.hasOwnProperty.call(r,"_transformStreamController")}function TransformStreamError(r,e){verbose("TransformStreamError()"),"readable"===r._readable._state&&ReadableStreamDefaultControllerError(r._readable._readableStreamController,e),TransformStreamErrorWritableAndUnblockWrite(r,e)}function TransformStreamErrorWritableAndUnblockWrite(r,e){WritableStreamDefaultControllerErrorIfNeeded(r._writable._writableStreamController,e),!0===r._backpressure&&TransformStreamSetBackpressure(r,!1)}function TransformStreamSetBackpressure(r,e){verbose("TransformStreamSetBackpressure() [backpressure = "+e+"]"),void 0!==r._backpressureChangePromise&&r._backpressureChangePromise_resolve(),r._backpressureChangePromise=new Promise(function(e){r._backpressureChangePromise_resolve=e}),r._backpressure=e}function IsTransformStreamDefaultController(r){return!!typeIsObject(r)&&!!Object.prototype.hasOwnProperty.call(r,"_controlledTransformStream")}function SetUpTransformStreamDefaultController(r,e,t,a){e._controlledTransformStream=r,r._transformStreamController=e,e._transformAlgorithm=t,e._flushAlgorithm=a}function SetUpTransformStreamDefaultControllerFromTransformer(r,e){var t=Object.create(TransformStreamDefaultController.prototype),a=function transformAlgorithm(r){try{return TransformStreamDefaultControllerEnqueue(t,r),Promise.resolve()}catch(r){return Promise.reject(r)}},o=e.transform;if(void 0!==o){if("function"!=typeof o)throw new TypeError("transform is not a method");a=function transformAlgorithm(a){return PromiseCall(o,e,[a,t]).catch(function(e){throw TransformStreamError(r,e),e})}}var n=CreateAlgorithmFromUnderlyingMethod(e,"flush",0,[t]);SetUpTransformStreamDefaultController(r,t,a,n)}function TransformStreamDefaultControllerEnqueue(r,e){verbose("TransformStreamDefaultControllerEnqueue()");var t=r._controlledTransformStream,a=t._readable._readableStreamController;if(!1===ReadableStreamDefaultControllerCanCloseOrEnqueue(a))throw new TypeError("Readable side is not in a state that permits enqueue");try{ReadableStreamDefaultControllerEnqueue(a,e)}catch(r){throw TransformStreamErrorWritableAndUnblockWrite(t,r),t._readable._storedError}ReadableStreamDefaultControllerHasBackpressure(a)!==t._backpressure&&TransformStreamSetBackpressure(t,!0)}function TransformStreamDefaultControllerError(r,e){TransformStreamError(r._controlledTransformStream,e)}function TransformStreamDefaultControllerTerminate(r){verbose("TransformStreamDefaultControllerTerminate()");var e=r._controlledTransformStream,t=e._readable._readableStreamController;!0===ReadableStreamDefaultControllerCanCloseOrEnqueue(t)&&ReadableStreamDefaultControllerClose(t),TransformStreamErrorWritableAndUnblockWrite(e,new TypeError("TransformStream terminated"))}function TransformStreamDefaultSinkWriteAlgorithm(r,e){verbose("TransformStreamDefaultSinkWriteAlgorithm()");var t=r._transformStreamController;return!0===r._backpressure?r._backpressureChangePromise.then(function(){var a=r._writable;if("erroring"===a._state)throw a._storedError;return t._transformAlgorithm(e)}):t._transformAlgorithm(e)}function TransformStreamDefaultSinkAbortAlgorithm(r){return TransformStreamError(r,new TypeError("Writable side aborted")),Promise.resolve()}function TransformStreamDefaultSinkCloseAlgorithm(r){verbose("TransformStreamDefaultSinkCloseAlgorithm()");var e=r._readable;return r._transformStreamController._flushAlgorithm().then(function(){if("errored"===e._state)throw e._storedError;var r=e._readableStreamController;!0===ReadableStreamDefaultControllerCanCloseOrEnqueue(r)&&ReadableStreamDefaultControllerClose(r)}).catch(function(t){throw TransformStreamError(r,t),e._storedError})}function TransformStreamDefaultSourcePullAlgorithm(r){return verbose("TransformStreamDefaultSourcePullAlgorithm()"),TransformStreamSetBackpressure(r,!1),r._backpressureChangePromise}function defaultControllerBrandCheckException(r){return new TypeError("TransformStreamDefaultController.prototype."+r+" can only be used on a TransformStreamDefaultController")}function streamBrandCheckException(r){return new TypeError("TransformStream.prototype."+r+" can only be used on a TransformStream")}var _createClass=function(){function defineProperties(r,e){for(var t=0;t<e.length;t++){var a=e[t];a.enumerable=a.enumerable||!1,a.configurable=!0,"value"in a&&(a.writable=!0),Object.defineProperty(r,a.key,a)}}return function(r,e,t){return e&&defineProperties(r.prototype,e),t&&defineProperties(r,t),r}}(),assert=_dereq_("better-assert"),verbose=_dereq_("debug")("streams:transform-stream:verbose"),_require=_dereq_("./helpers.js"),InvokeOrNoop=_require.InvokeOrNoop,CreateAlgorithmFromUnderlyingMethod=_require.CreateAlgorithmFromUnderlyingMethod,PromiseCall=_require.PromiseCall,typeIsObject=_require.typeIsObject,ValidateAndNormalizeHighWaterMark=_require.ValidateAndNormalizeHighWaterMark,IsNonNegativeNumber=_require.IsNonNegativeNumber,MakeSizeAlgorithmFromSizeFunction=_require.MakeSizeAlgorithmFromSizeFunction,_require2=_dereq_("./readable-stream.js"),CreateReadableStream=_require2.CreateReadableStream,ReadableStreamDefaultControllerClose=_require2.ReadableStreamDefaultControllerClose,ReadableStreamDefaultControllerEnqueue=_require2.ReadableStreamDefaultControllerEnqueue,ReadableStreamDefaultControllerError=_require2.ReadableStreamDefaultControllerError,ReadableStreamDefaultControllerGetDesiredSize=_require2.ReadableStreamDefaultControllerGetDesiredSize,ReadableStreamDefaultControllerHasBackpressure=_require2.ReadableStreamDefaultControllerHasBackpressure,ReadableStreamDefaultControllerCanCloseOrEnqueue=_require2.ReadableStreamDefaultControllerCanCloseOrEnqueue,_require3=_dereq_("./writable-stream.js"),CreateWritableStream=_require3.CreateWritableStream,WritableStreamDefaultControllerErrorIfNeeded=_require3.WritableStreamDefaultControllerErrorIfNeeded,TransformStream=function(){function TransformStream(){var r=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},e=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},t=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};if(_classCallCheck(this,TransformStream),void 0!==r.readableType)throw new RangeError("Invalid readable type specified");if(void 0!==r.writableType)throw new RangeError("Invalid writable type specified");var a=e.size,o=MakeSizeAlgorithmFromSizeFunction(a),n=e.highWaterMark;void 0===n&&(n=1),n=ValidateAndNormalizeHighWaterMark(n);var l=t.size,i=MakeSizeAlgorithmFromSizeFunction(l),m=t.highWaterMark;void 0===m&&(m=0),m=ValidateAndNormalizeHighWaterMark(m);var s=void 0;InitializeTransformStream(this,new Promise(function(r){s=r}),n,o,m,i),SetUpTransformStreamDefaultControllerFromTransformer(this,r);var u=InvokeOrNoop(r,"start",[this._transformStreamController]);s(u)}return _createClass(TransformStream,[{key:"readable",get:function get(){if(!1===IsTransformStream(this))throw streamBrandCheckException("readable");return this._readable}},{key:"writable",get:function get(){if(!1===IsTransformStream(this))throw streamBrandCheckException("writable");return this._writable}}]),TransformStream}(),TransformStreamDefaultController=function(){function TransformStreamDefaultController(){throw _classCallCheck(this,TransformStreamDefaultController),new TypeError("TransformStreamDefaultController instances cannot be created directly")}return _createClass(TransformStreamDefaultController,[{key:"enqueue",value:function enqueue(r){if(!1===IsTransformStreamDefaultController(this))throw defaultControllerBrandCheckException("enqueue");TransformStreamDefaultControllerEnqueue(this,r)}},{key:"error",value:function error(r){if(!1===IsTransformStreamDefaultController(this))throw defaultControllerBrandCheckException("error");TransformStreamDefaultControllerError(this,r)}},{key:"terminate",value:function terminate(){if(!1===IsTransformStreamDefaultController(this))throw defaultControllerBrandCheckException("terminate");TransformStreamDefaultControllerTerminate(this)}},{key:"desiredSize",get:function get(){if(!1===IsTransformStreamDefaultController(this))throw defaultControllerBrandCheckException("desiredSize");var r=this._controlledTransformStream._readable._readableStreamController;return ReadableStreamDefaultControllerGetDesiredSize(r)}}]),TransformStreamDefaultController}();module.exports={CreateTransformStream:CreateTransformStream,TransformStream:TransformStream};

},{"./helpers.js":10,"./readable-stream.js":12,"./writable-stream.js":15,"better-assert":16,"debug":18}],14:[function(_dereq_,module,exports){
"use strict";var assert=_dereq_("better-assert");exports.rethrowAssertionErrorRejection=function(r){r&&r.constructor===assert.AssertionError&&setTimeout(function(){throw r},0)};

},{"better-assert":16}],15:[function(_dereq_,module,exports){
"use strict";function _classCallCheck(e,r){if(!(e instanceof r))throw new TypeError("Cannot call a class as a function")}function AcquireWritableStreamDefaultWriter(e){return new WritableStreamDefaultWriter(e)}function CreateWritableStream(e,r,t,i){var a=arguments.length>4&&void 0!==arguments[4]?arguments[4]:1,o=arguments.length>5&&void 0!==arguments[5]?arguments[5]:function(){return 1},l=Object.create(WritableStream.prototype);return InitializeWritableStream(l),SetUpWritableStreamDefaultController(l,Object.create(WritableStreamDefaultController.prototype),e,r,t,i,a,o),l}function InitializeWritableStream(e){e._state="writable",e._storedError=void 0,e._writer=void 0,e._writableStreamController=void 0,e._writeRequests=[],e._inFlightWriteRequest=void 0,e._closeRequest=void 0,e._inFlightCloseRequest=void 0,e._pendingAbortRequest=void 0,e._backpressure=!1}function IsWritableStream(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_writableStreamController")}function IsWritableStreamLocked(e){return void 0!==e._writer}function WritableStreamAbort(e,r){var t=e._state;if("closed"===t)return Promise.resolve(void 0);if("errored"===t)return Promise.reject(e._storedError);var i=new TypeError("Requested to abort");if(void 0!==e._pendingAbortRequest)return Promise.reject(i);var a=!1;"erroring"===t&&(a=!0,r=void 0);var o=new Promise(function(t,i){e._pendingAbortRequest={_resolve:t,_reject:i,_reason:r,_wasAlreadyErroring:a}});return!1===a&&WritableStreamStartErroring(e,i),o}function WritableStreamAddWriteRequest(e){return new Promise(function(r,t){var i={_resolve:r,_reject:t};e._writeRequests.push(i)})}function WritableStreamDealWithRejection(e,r){verbose("WritableStreamDealWithRejection(stream, %o)",r),"writable"!==e._state?WritableStreamFinishErroring(e):WritableStreamStartErroring(e,r)}function WritableStreamStartErroring(e,r){verbose("WritableStreamStartErroring(stream, %o)",r);var t=e._writableStreamController;e._state="erroring",e._storedError=r;var i=e._writer;void 0!==i&&WritableStreamDefaultWriterEnsureReadyPromiseRejected(i,r),!1===WritableStreamHasOperationMarkedInFlight(e)&&!0===t._started&&WritableStreamFinishErroring(e)}function WritableStreamFinishErroring(e){verbose("WritableStreamFinishErroring()"),e._state="errored",e._writableStreamController[ErrorSteps]();var r=e._storedError,t=!0,i=!1,a=void 0;try{for(var o,l=e._writeRequests[Symbol.iterator]();!(t=(o=l.next()).done);t=!0)o.value._reject(r)}catch(e){i=!0,a=e}finally{try{!t&&l.return&&l.return()}finally{if(i)throw a}}if(e._writeRequests=[],void 0!==e._pendingAbortRequest){var s=e._pendingAbortRequest;if(e._pendingAbortRequest=void 0,!0===s._wasAlreadyErroring)return s._reject(r),void WritableStreamRejectCloseAndClosedPromiseIfNeeded(e);e._writableStreamController[AbortSteps](s._reason).then(function(){s._resolve(),WritableStreamRejectCloseAndClosedPromiseIfNeeded(e)},function(r){s._reject(r),WritableStreamRejectCloseAndClosedPromiseIfNeeded(e)})}else WritableStreamRejectCloseAndClosedPromiseIfNeeded(e)}function WritableStreamFinishInFlightWrite(e){e._inFlightWriteRequest._resolve(void 0),e._inFlightWriteRequest=void 0}function WritableStreamFinishInFlightWriteWithError(e,r){e._inFlightWriteRequest._reject(r),e._inFlightWriteRequest=void 0,WritableStreamDealWithRejection(e,r)}function WritableStreamFinishInFlightClose(e){e._inFlightCloseRequest._resolve(void 0),e._inFlightCloseRequest=void 0,"erroring"===e._state&&(e._storedError=void 0,void 0!==e._pendingAbortRequest&&(e._pendingAbortRequest._resolve(),e._pendingAbortRequest=void 0)),e._state="closed";var r=e._writer;void 0!==r&&defaultWriterClosedPromiseResolve(r)}function WritableStreamFinishInFlightCloseWithError(e,r){e._inFlightCloseRequest._reject(r),e._inFlightCloseRequest=void 0,void 0!==e._pendingAbortRequest&&(e._pendingAbortRequest._reject(r),e._pendingAbortRequest=void 0),WritableStreamDealWithRejection(e,r)}function WritableStreamCloseQueuedOrInFlight(e){return void 0!==e._closeRequest||void 0!==e._inFlightCloseRequest}function WritableStreamHasOperationMarkedInFlight(e){return void 0===e._inFlightWriteRequest&&void 0===e._inFlightCloseRequest?(verbose("WritableStreamHasOperationMarkedInFlight() is false"),!1):(verbose("WritableStreamHasOperationMarkedInFlight() is true"),!0)}function WritableStreamMarkCloseRequestInFlight(e){e._inFlightCloseRequest=e._closeRequest,e._closeRequest=void 0}function WritableStreamMarkFirstWriteRequestInFlight(e){e._inFlightWriteRequest=e._writeRequests.shift()}function WritableStreamRejectCloseAndClosedPromiseIfNeeded(e){verbose("WritableStreamRejectCloseAndClosedPromiseIfNeeded()"),void 0!==e._closeRequest&&(e._closeRequest._reject(e._storedError),e._closeRequest=void 0);var r=e._writer;void 0!==r&&(defaultWriterClosedPromiseReject(r,e._storedError),r._closedPromise.catch(function(){}))}function WritableStreamUpdateBackpressure(e,r){var t=e._writer;void 0!==t&&r!==e._backpressure&&(!0===r?defaultWriterReadyPromiseReset(t):defaultWriterReadyPromiseResolve(t)),e._backpressure=r}function IsWritableStreamDefaultWriter(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_ownerWritableStream")}function WritableStreamDefaultWriterAbort(e,r){return WritableStreamAbort(e._ownerWritableStream,r)}function WritableStreamDefaultWriterClose(e){var r=e._ownerWritableStream,t=r._state;if("closed"===t||"errored"===t)return Promise.reject(new TypeError("The stream (in "+t+" state) is not in the writable state and cannot be closed"));var i=new Promise(function(e,t){var i={_resolve:e,_reject:t};r._closeRequest=i});return!0===r._backpressure&&"writable"===t&&defaultWriterReadyPromiseResolve(e),WritableStreamDefaultControllerClose(r._writableStreamController),i}function WritableStreamDefaultWriterCloseWithErrorPropagation(e){var r=e._ownerWritableStream,t=r._state;return!0===WritableStreamCloseQueuedOrInFlight(r)||"closed"===t?Promise.resolve():"errored"===t?Promise.reject(r._storedError):WritableStreamDefaultWriterClose(e)}function WritableStreamDefaultWriterEnsureClosedPromiseRejected(e,r){"pending"===e._closedPromiseState?defaultWriterClosedPromiseReject(e,r):defaultWriterClosedPromiseResetToRejected(e,r),e._closedPromise.catch(function(){})}function WritableStreamDefaultWriterEnsureReadyPromiseRejected(e,r){verbose("WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, %o)",r),"pending"===e._readyPromiseState?defaultWriterReadyPromiseReject(e,r):defaultWriterReadyPromiseResetToRejected(e,r),e._readyPromise.catch(function(){})}function WritableStreamDefaultWriterGetDesiredSize(e){var r=e._ownerWritableStream,t=r._state;return"errored"===t||"erroring"===t?null:"closed"===t?0:WritableStreamDefaultControllerGetDesiredSize(r._writableStreamController)}function WritableStreamDefaultWriterRelease(e){var r=e._ownerWritableStream,t=new TypeError("Writer was released and can no longer be used to monitor the stream's closedness");WritableStreamDefaultWriterEnsureReadyPromiseRejected(e,t),WritableStreamDefaultWriterEnsureClosedPromiseRejected(e,t),r._writer=void 0,e._ownerWritableStream=void 0}function WritableStreamDefaultWriterWrite(e,r){var t=e._ownerWritableStream,i=t._writableStreamController,a=WritableStreamDefaultControllerGetChunkSize(i,r);if(t!==e._ownerWritableStream)return Promise.reject(defaultWriterLockException("write to"));var o=t._state;if("errored"===o)return Promise.reject(t._storedError);if(!0===WritableStreamCloseQueuedOrInFlight(t)||"closed"===o)return Promise.reject(new TypeError("The stream is closing or closed and cannot be written to"));if("erroring"===o)return Promise.reject(t._storedError);var l=WritableStreamAddWriteRequest(t);return WritableStreamDefaultControllerWrite(i,r,a),l}function IsWritableStreamDefaultController(e){return!!typeIsObject(e)&&!!Object.prototype.hasOwnProperty.call(e,"_controlledWritableStream")}function SetUpWritableStreamDefaultController(e,r,t,i,a,o,l,s){r._controlledWritableStream=e,e._writableStreamController=r,r._queue=void 0,r._queueTotalSize=void 0,ResetQueue(r),r._started=!1,r._strategySizeAlgorithm=s,r._strategyHWM=l,r._writeAlgorithm=i,r._closeAlgorithm=a,r._abortAlgorithm=o;var n=WritableStreamDefaultControllerGetBackpressure(r);WritableStreamUpdateBackpressure(e,n);var u=t();Promise.resolve(u).then(function(){r._started=!0,WritableStreamDefaultControllerAdvanceQueueIfNeeded(r)},function(t){r._started=!0,WritableStreamDealWithRejection(e,t)}).catch(rethrowAssertionErrorRejection)}function SetUpWritableStreamDefaultControllerFromUnderlyingSink(e,r,t,i){var a=Object.create(WritableStreamDefaultController.prototype),o=CreateAlgorithmFromUnderlyingMethod(r,"write",1,[a]),l=CreateAlgorithmFromUnderlyingMethod(r,"close",0,[]),s=CreateAlgorithmFromUnderlyingMethod(r,"abort",1,[]);SetUpWritableStreamDefaultController(e,a,function startAlgorithm(){return InvokeOrNoop(r,"start",[a])},o,l,s,t,i)}function WritableStreamDefaultControllerClose(e){EnqueueValueWithSize(e,"close",0),WritableStreamDefaultControllerAdvanceQueueIfNeeded(e)}function WritableStreamDefaultControllerGetChunkSize(e,r){try{return e._strategySizeAlgorithm(r)}catch(r){return WritableStreamDefaultControllerErrorIfNeeded(e,r),1}}function WritableStreamDefaultControllerGetDesiredSize(e){return e._strategyHWM-e._queueTotalSize}function WritableStreamDefaultControllerWrite(e,r,t){var i={chunk:r};try{EnqueueValueWithSize(e,i,t)}catch(r){return void WritableStreamDefaultControllerErrorIfNeeded(e,r)}var a=e._controlledWritableStream;!1===WritableStreamCloseQueuedOrInFlight(a)&&"writable"===a._state&&WritableStreamUpdateBackpressure(a,WritableStreamDefaultControllerGetBackpressure(e)),WritableStreamDefaultControllerAdvanceQueueIfNeeded(e)}function WritableStreamDefaultControllerAdvanceQueueIfNeeded(e){verbose("WritableStreamDefaultControllerAdvanceQueueIfNeeded()");var r=e._controlledWritableStream;if(!1!==e._started&&void 0===r._inFlightWriteRequest){var t=r._state;if("closed"!==t&&"errored"!==t)if("erroring"!==t){if(0!==e._queue.length){var i=PeekQueueValue(e);"close"===i?WritableStreamDefaultControllerProcessClose(e):WritableStreamDefaultControllerProcessWrite(e,i.chunk)}}else WritableStreamFinishErroring(r)}}function WritableStreamDefaultControllerErrorIfNeeded(e,r){"writable"===e._controlledWritableStream._state&&WritableStreamDefaultControllerError(e,r)}function WritableStreamDefaultControllerProcessClose(e){var r=e._controlledWritableStream;WritableStreamMarkCloseRequestInFlight(r),DequeueValue(e),e._closeAlgorithm().then(function(){WritableStreamFinishInFlightClose(r)},function(e){WritableStreamFinishInFlightCloseWithError(r,e)}).catch(rethrowAssertionErrorRejection)}function WritableStreamDefaultControllerProcessWrite(e,r){var t=e._controlledWritableStream;WritableStreamMarkFirstWriteRequestInFlight(t),e._writeAlgorithm(r).then(function(){WritableStreamFinishInFlightWrite(t);var r=t._state;if(DequeueValue(e),!1===WritableStreamCloseQueuedOrInFlight(t)&&"writable"===r){var i=WritableStreamDefaultControllerGetBackpressure(e);WritableStreamUpdateBackpressure(t,i)}WritableStreamDefaultControllerAdvanceQueueIfNeeded(e)},function(e){WritableStreamFinishInFlightWriteWithError(t,e)}).catch(rethrowAssertionErrorRejection)}function WritableStreamDefaultControllerGetBackpressure(e){return WritableStreamDefaultControllerGetDesiredSize(e)<=0}function WritableStreamDefaultControllerError(e,r){WritableStreamStartErroring(e._controlledWritableStream,r)}function streamBrandCheckException(e){return new TypeError("WritableStream.prototype."+e+" can only be used on a WritableStream")}function defaultWriterBrandCheckException(e){return new TypeError("WritableStreamDefaultWriter.prototype."+e+" can only be used on a WritableStreamDefaultWriter")}function defaultWriterLockException(e){return new TypeError("Cannot "+e+" a stream using a released writer")}function defaultWriterClosedPromiseInitialize(e){e._closedPromise=new Promise(function(r,t){e._closedPromise_resolve=r,e._closedPromise_reject=t,e._closedPromiseState="pending"})}function defaultWriterClosedPromiseInitializeAsRejected(e,r){e._closedPromise=Promise.reject(r),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0,e._closedPromiseState="rejected"}function defaultWriterClosedPromiseInitializeAsResolved(e){e._closedPromise=Promise.resolve(void 0),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0,e._closedPromiseState="resolved"}function defaultWriterClosedPromiseReject(e,r){e._closedPromise_reject(r),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0,e._closedPromiseState="rejected"}function defaultWriterClosedPromiseResetToRejected(e,r){e._closedPromise=Promise.reject(r),e._closedPromiseState="rejected"}function defaultWriterClosedPromiseResolve(e){e._closedPromise_resolve(void 0),e._closedPromise_resolve=void 0,e._closedPromise_reject=void 0,e._closedPromiseState="resolved"}function defaultWriterReadyPromiseInitialize(e){verbose("defaultWriterReadyPromiseInitialize()"),e._readyPromise=new Promise(function(r,t){e._readyPromise_resolve=r,e._readyPromise_reject=t}),e._readyPromiseState="pending"}function defaultWriterReadyPromiseInitializeAsRejected(e,r){verbose("defaultWriterReadyPromiseInitializeAsRejected(writer, %o)",r),e._readyPromise=Promise.reject(r),e._readyPromise_resolve=void 0,e._readyPromise_reject=void 0,e._readyPromiseState="rejected"}function defaultWriterReadyPromiseInitializeAsResolved(e){verbose("defaultWriterReadyPromiseInitializeAsResolved()"),e._readyPromise=Promise.resolve(void 0),e._readyPromise_resolve=void 0,e._readyPromise_reject=void 0,e._readyPromiseState="fulfilled"}function defaultWriterReadyPromiseReject(e,r){verbose("defaultWriterReadyPromiseReject(writer, %o)",r),e._readyPromise_reject(r),e._readyPromise_resolve=void 0,e._readyPromise_reject=void 0,e._readyPromiseState="rejected"}function defaultWriterReadyPromiseReset(e){verbose("defaultWriterReadyPromiseReset()"),e._readyPromise=new Promise(function(r,t){e._readyPromise_resolve=r,e._readyPromise_reject=t}),e._readyPromiseState="pending"}function defaultWriterReadyPromiseResetToRejected(e,r){verbose("defaultWriterReadyPromiseResetToRejected(writer, %o)",r),e._readyPromise=Promise.reject(r),e._readyPromiseState="rejected"}function defaultWriterReadyPromiseResolve(e){verbose("defaultWriterReadyPromiseResolve()"),e._readyPromise_resolve(void 0),e._readyPromise_resolve=void 0,e._readyPromise_reject=void 0,e._readyPromiseState="fulfilled"}var _createClass=function(){function defineProperties(e,r){for(var t=0;t<r.length;t++){var i=r[t];i.enumerable=i.enumerable||!1,i.configurable=!0,"value"in i&&(i.writable=!0),Object.defineProperty(e,i.key,i)}}return function(e,r,t){return r&&defineProperties(e.prototype,r),t&&defineProperties(e,t),e}}(),assert=_dereq_("better-assert"),verbose=_dereq_("debug")("streams:writable-stream:verbose"),_require=_dereq_("./helpers.js"),CreateAlgorithmFromUnderlyingMethod=_require.CreateAlgorithmFromUnderlyingMethod,InvokeOrNoop=_require.InvokeOrNoop,ValidateAndNormalizeHighWaterMark=_require.ValidateAndNormalizeHighWaterMark,IsNonNegativeNumber=_require.IsNonNegativeNumber,MakeSizeAlgorithmFromSizeFunction=_require.MakeSizeAlgorithmFromSizeFunction,typeIsObject=_require.typeIsObject,_require2=_dereq_("./utils.js"),rethrowAssertionErrorRejection=_require2.rethrowAssertionErrorRejection,_require3=_dereq_("./queue-with-sizes.js"),DequeueValue=_require3.DequeueValue,EnqueueValueWithSize=_require3.EnqueueValueWithSize,PeekQueueValue=_require3.PeekQueueValue,ResetQueue=_require3.ResetQueue,AbortSteps=Symbol("[[AbortSteps]]"),ErrorSteps=Symbol("[[ErrorSteps]]"),WritableStream=function(){function WritableStream(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{},r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},t=r.size,i=r.highWaterMark,a=void 0===i?1:i;if(_classCallCheck(this,WritableStream),InitializeWritableStream(this),void 0!==e.type)throw new RangeError("Invalid type is specified");var o=MakeSizeAlgorithmFromSizeFunction(t);SetUpWritableStreamDefaultControllerFromUnderlyingSink(this,e,a=ValidateAndNormalizeHighWaterMark(a),o)}return _createClass(WritableStream,[{key:"abort",value:function abort(e){return!1===IsWritableStream(this)?Promise.reject(streamBrandCheckException("abort")):!0===IsWritableStreamLocked(this)?Promise.reject(new TypeError("Cannot abort a stream that already has a writer")):WritableStreamAbort(this,e)}},{key:"getWriter",value:function getWriter(){if(!1===IsWritableStream(this))throw streamBrandCheckException("getWriter");return AcquireWritableStreamDefaultWriter(this)}},{key:"locked",get:function get(){if(!1===IsWritableStream(this))throw streamBrandCheckException("locked");return IsWritableStreamLocked(this)}}]),WritableStream}();module.exports={AcquireWritableStreamDefaultWriter:AcquireWritableStreamDefaultWriter,CreateWritableStream:CreateWritableStream,IsWritableStream:IsWritableStream,IsWritableStreamLocked:IsWritableStreamLocked,WritableStream:WritableStream,WritableStreamAbort:WritableStreamAbort,WritableStreamDefaultControllerErrorIfNeeded:WritableStreamDefaultControllerErrorIfNeeded,WritableStreamDefaultWriterCloseWithErrorPropagation:WritableStreamDefaultWriterCloseWithErrorPropagation,WritableStreamDefaultWriterRelease:WritableStreamDefaultWriterRelease,WritableStreamDefaultWriterWrite:WritableStreamDefaultWriterWrite,WritableStreamCloseQueuedOrInFlight:WritableStreamCloseQueuedOrInFlight};var WritableStreamDefaultWriter=function(){function WritableStreamDefaultWriter(e){if(_classCallCheck(this,WritableStreamDefaultWriter),!1===IsWritableStream(e))throw new TypeError("WritableStreamDefaultWriter can only be constructed with a WritableStream instance");if(!0===IsWritableStreamLocked(e))throw new TypeError("This stream has already been locked for exclusive writing by another writer");this._ownerWritableStream=e,e._writer=this;var r=e._state;if("writable"===r)!1===WritableStreamCloseQueuedOrInFlight(e)&&!0===e._backpressure?defaultWriterReadyPromiseInitialize(this):defaultWriterReadyPromiseInitializeAsResolved(this),defaultWriterClosedPromiseInitialize(this);else if("erroring"===r)defaultWriterReadyPromiseInitializeAsRejected(this,e._storedError),this._readyPromise.catch(function(){}),defaultWriterClosedPromiseInitialize(this);else if("closed"===r)defaultWriterReadyPromiseInitializeAsResolved(this),defaultWriterClosedPromiseInitializeAsResolved(this);else{var t=e._storedError;defaultWriterReadyPromiseInitializeAsRejected(this,t),this._readyPromise.catch(function(){}),defaultWriterClosedPromiseInitializeAsRejected(this,t),this._closedPromise.catch(function(){})}}return _createClass(WritableStreamDefaultWriter,[{key:"abort",value:function abort(e){return!1===IsWritableStreamDefaultWriter(this)?Promise.reject(defaultWriterBrandCheckException("abort")):void 0===this._ownerWritableStream?Promise.reject(defaultWriterLockException("abort")):WritableStreamDefaultWriterAbort(this,e)}},{key:"close",value:function close(){if(!1===IsWritableStreamDefaultWriter(this))return Promise.reject(defaultWriterBrandCheckException("close"));var e=this._ownerWritableStream;return void 0===e?Promise.reject(defaultWriterLockException("close")):!0===WritableStreamCloseQueuedOrInFlight(e)?Promise.reject(new TypeError("cannot close an already-closing stream")):WritableStreamDefaultWriterClose(this)}},{key:"releaseLock",value:function releaseLock(){if(!1===IsWritableStreamDefaultWriter(this))throw defaultWriterBrandCheckException("releaseLock");void 0!==this._ownerWritableStream&&WritableStreamDefaultWriterRelease(this)}},{key:"write",value:function write(e){return!1===IsWritableStreamDefaultWriter(this)?Promise.reject(defaultWriterBrandCheckException("write")):void 0===this._ownerWritableStream?Promise.reject(defaultWriterLockException("write to")):WritableStreamDefaultWriterWrite(this,e)}},{key:"closed",get:function get(){return!1===IsWritableStreamDefaultWriter(this)?Promise.reject(defaultWriterBrandCheckException("closed")):this._closedPromise}},{key:"desiredSize",get:function get(){if(!1===IsWritableStreamDefaultWriter(this))throw defaultWriterBrandCheckException("desiredSize");if(void 0===this._ownerWritableStream)throw defaultWriterLockException("desiredSize");return WritableStreamDefaultWriterGetDesiredSize(this)}},{key:"ready",get:function get(){return!1===IsWritableStreamDefaultWriter(this)?Promise.reject(defaultWriterBrandCheckException("ready")):this._readyPromise}}]),WritableStreamDefaultWriter}(),WritableStreamDefaultController=function(){function WritableStreamDefaultController(){throw _classCallCheck(this,WritableStreamDefaultController),new TypeError("WritableStreamDefaultController cannot be constructed explicitly")}return _createClass(WritableStreamDefaultController,[{key:"error",value:function error(e){if(!1===IsWritableStreamDefaultController(this))throw new TypeError("WritableStreamDefaultController.prototype.error can only be used on a WritableStreamDefaultController");"writable"===this._controlledWritableStream._state&&WritableStreamDefaultControllerError(this,e)}},{key:AbortSteps,value:function value(e){return this._abortAlgorithm(e)}},{key:ErrorSteps,value:function value(){ResetQueue(this)}}]),WritableStreamDefaultController}();

},{"./helpers.js":10,"./queue-with-sizes.js":11,"./utils.js":14,"better-assert":16,"debug":18}],16:[function(_dereq_,module,exports){
(function (process){
function assert(e){if(!e){var r=callsite(),s=r[1],t=s.getFileName(),i=s.getLineNumber(),n=(n=fs.readFileSync(t,"utf8")).split("\n")[i-1].match(/assert\((.*)\)/)[1];throw new AssertionError({message:n,stackStartFunction:r[0].getFunction()})}}var AssertionError=_dereq_("assert").AssertionError,callsite=_dereq_("callsite"),fs=_dereq_("fs");module.exports=process.env.NO_ASSERT?function(){}:assert;

}).call(this,_dereq_('_process'))

},{"_process":4,"assert":2,"callsite":17,"fs":3}],17:[function(_dereq_,module,exports){
module.exports=function(){var r=Error.prepareStackTrace;Error.prepareStackTrace=function(r,e){return e};var e=new Error;Error.captureStackTrace(e,arguments.callee);var a=e.stack;return Error.prepareStackTrace=r,a};

},{}],18:[function(_dereq_,module,exports){
(function (process){
function useColors(){return!("undefined"==typeof window||!window.process||"renderer"!==window.process.type)||("undefined"==typeof navigator||!navigator.userAgent||!navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))&&("undefined"!=typeof document&&document.documentElement&&document.documentElement.style&&document.documentElement.style.WebkitAppearance||"undefined"!=typeof window&&window.console&&(window.console.firebug||window.console.exception&&window.console.table)||"undefined"!=typeof navigator&&navigator.userAgent&&navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)&&parseInt(RegExp.$1,10)>=31||"undefined"!=typeof navigator&&navigator.userAgent&&navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/))}function formatArgs(e){var o=this.useColors;if(e[0]=(o?"%c":"")+this.namespace+(o?" %c":" ")+e[0]+(o?"%c ":" ")+"+"+exports.humanize(this.diff),o){var C="color: "+this.color;e.splice(1,0,C,"color: inherit");var t=0,r=0;e[0].replace(/%[a-zA-Z%]/g,function(e){"%%"!==e&&(t++,"%c"===e&&(r=t))}),e.splice(r,0,C)}}function log(){return"object"==typeof console&&console.log&&Function.prototype.apply.call(console.log,console,arguments)}function save(e){try{null==e?exports.storage.removeItem("debug"):exports.storage.debug=e}catch(e){}}function load(){var e;try{e=exports.storage.debug}catch(e){}return!e&&"undefined"!=typeof process&&"env"in process&&(e=process.env.DEBUG),e}function localstorage(){try{return window.localStorage}catch(e){}}exports=module.exports=_dereq_("./debug"),exports.log=log,exports.formatArgs=formatArgs,exports.save=save,exports.load=load,exports.useColors=useColors,exports.storage="undefined"!=typeof chrome&&void 0!==chrome.storage?chrome.storage.local:localstorage(),exports.colors=["#0000CC","#0000FF","#0033CC","#0033FF","#0066CC","#0066FF","#0099CC","#0099FF","#00CC00","#00CC33","#00CC66","#00CC99","#00CCCC","#00CCFF","#3300CC","#3300FF","#3333CC","#3333FF","#3366CC","#3366FF","#3399CC","#3399FF","#33CC00","#33CC33","#33CC66","#33CC99","#33CCCC","#33CCFF","#6600CC","#6600FF","#6633CC","#6633FF","#66CC00","#66CC33","#9900CC","#9900FF","#9933CC","#9933FF","#99CC00","#99CC33","#CC0000","#CC0033","#CC0066","#CC0099","#CC00CC","#CC00FF","#CC3300","#CC3333","#CC3366","#CC3399","#CC33CC","#CC33FF","#CC6600","#CC6633","#CC9900","#CC9933","#CCCC00","#CCCC33","#FF0000","#FF0033","#FF0066","#FF0099","#FF00CC","#FF00FF","#FF3300","#FF3333","#FF3366","#FF3399","#FF33CC","#FF33FF","#FF6600","#FF6633","#FF9900","#FF9933","#FFCC00","#FFCC33"],exports.formatters.j=function(e){try{return JSON.stringify(e)}catch(e){return"[UnexpectedJSONParseError]: "+e.message}},exports.enable(load());

}).call(this,_dereq_('_process'))

},{"./debug":19,"_process":4}],19:[function(_dereq_,module,exports){
function selectColor(e){var r,t=0;for(r in e)t=(t<<5)-t+e.charCodeAt(r),t|=0;return exports.colors[Math.abs(t)%exports.colors.length]}function createDebug(e){function debug(){if(debug.enabled){var e=debug,t=+new Date,s=t-(r||t);e.diff=s,e.prev=r,e.curr=t,r=t;for(var o=new Array(arguments.length),n=0;n<o.length;n++)o[n]=arguments[n];o[0]=exports.coerce(o[0]),"string"!=typeof o[0]&&o.unshift("%O");var a=0;o[0]=o[0].replace(/%([a-zA-Z%])/g,function(r,t){if("%%"===r)return r;a++;var s=exports.formatters[t];if("function"==typeof s){var n=o[a];r=s.call(e,n),o.splice(a,1),a--}return r}),exports.formatArgs.call(e,o),(debug.log||exports.log||console.log.bind(console)).apply(e,o)}}var r;return debug.namespace=e,debug.enabled=exports.enabled(e),debug.useColors=exports.useColors(),debug.color=selectColor(e),debug.destroy=destroy,"function"==typeof exports.init&&exports.init(debug),exports.instances.push(debug),debug}function destroy(){var e=exports.instances.indexOf(this);return-1!==e&&(exports.instances.splice(e,1),!0)}function enable(e){exports.save(e),exports.names=[],exports.skips=[];var r,t=("string"==typeof e?e:"").split(/[\s,]+/),s=t.length;for(r=0;r<s;r++)t[r]&&("-"===(e=t[r].replace(/\*/g,".*?"))[0]?exports.skips.push(new RegExp("^"+e.substr(1)+"$")):exports.names.push(new RegExp("^"+e+"$")));for(r=0;r<exports.instances.length;r++){var o=exports.instances[r];o.enabled=exports.enabled(o.namespace)}}function disable(){exports.enable("")}function enabled(e){if("*"===e[e.length-1])return!0;var r,t;for(r=0,t=exports.skips.length;r<t;r++)if(exports.skips[r].test(e))return!1;for(r=0,t=exports.names.length;r<t;r++)if(exports.names[r].test(e))return!0;return!1}function coerce(e){return e instanceof Error?e.stack||e.message:e}exports=module.exports=createDebug.debug=createDebug.default=createDebug,exports.coerce=coerce,exports.disable=disable,exports.enable=enable,exports.enabled=enabled,exports.humanize=_dereq_("ms"),exports.instances=[],exports.names=[],exports.skips=[],exports.formatters={};

},{"ms":20}],20:[function(_dereq_,module,exports){
function parse(e){if(!((e=String(e)).length>100)){var r=/^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(e);if(r){var a=parseFloat(r[1]);switch((r[2]||"ms").toLowerCase()){case"years":case"year":case"yrs":case"yr":case"y":return a*y;case"days":case"day":case"d":return a*d;case"hours":case"hour":case"hrs":case"hr":case"h":return a*h;case"minutes":case"minute":case"mins":case"min":case"m":return a*m;case"seconds":case"second":case"secs":case"sec":case"s":return a*s;case"milliseconds":case"millisecond":case"msecs":case"msec":case"ms":return a;default:return}}}}function fmtShort(e){return e>=d?Math.round(e/d)+"d":e>=h?Math.round(e/h)+"h":e>=m?Math.round(e/m)+"m":e>=s?Math.round(e/s)+"s":e+"ms"}function fmtLong(e){return plural(e,d,"day")||plural(e,h,"hour")||plural(e,m,"minute")||plural(e,s,"second")||e+" ms"}function plural(s,e,r){if(!(s<e))return s<1.5*e?Math.floor(s/e)+" "+r:Math.ceil(s/e)+" "+r+"s"}var s=1e3,m=60*s,h=60*m,d=24*h,y=365.25*d;module.exports=function(s,e){e=e||{};var r=typeof s;if("string"===r&&s.length>0)return parse(s);if("number"===r&&!1===isNaN(s))return e.long?fmtLong(s):fmtShort(s);throw new Error("val is not a non-empty string or a valid number. val="+JSON.stringify(s))};

},{}]},{},[1])(1)
});


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[1]);
