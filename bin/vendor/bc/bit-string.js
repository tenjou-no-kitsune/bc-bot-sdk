// Scripts/BitString.js


"use strict";

/**
 * @module BitString
 * @author Lisa the Orange <lisatheorange@proton.me>
 * @description
 * BitString: a module allowing a space-efficient packing of a sequence
 * of arbitrary-width integers (up to {@link Number.MAX_SAFE_INTEGER}) into
 * a {@link String}.
 *
 * This works by treating a {@link String} as a bit sequence and packing
 * the values as little-endian integers into it, using
 * twos complement for representing signed numbers.
 *
 * The module contains many excessive checks of the invariants due to
 * the complexity of the code. The errors associated with those excessive
 * are marked with *Internal error* and can be removed in the future for
 * minor speed gains. Note that the users are not supposed to catch those
 * errors, because the internal state of the reader/writer object
 * is NOT guaranteed to be correct after throwing those errors.
 *
 * Another type of errors is *Invalid argument*. While the reader/writer objects
 * do preserve the state in case those errors are thrown, it is nonetheless not
 * recommended to catch them either. The only recoverable error of those
 * objects is thrown on reading overflow, which is best handled by using
 * {@link BitStringReader.tryReadUnsigned}/{@link BitStringReader.tryReadSigned}
 * methods, which return `undefined` when and only when there is
 * not enough bits of data remaining.
 *
 * ---
 *
 * It is important to remember that this module supports zero-width fields.
 * This means that {@link BitStringHelper.getBitsCountForUnsigned} would return
 * `0` if given a zero value.
 *
 * Writing a literal `0` into a zero-width field with {@link BitStringWriter.writeUnsigned}
 * is a no-op; trying to write any other value would throw an error.
 *
 * Reading zero bits with {@link BitStringReader.readUnsigned} would always return `0`
 * and not change the internal state.
 *
 * The user then must take additional care when working with dynamic-width fields, and bear in mind
 * that the calculated maximum width of an array can be zero, in which case errors
 * like division by zero might occur. Another problem might occur when the user tries to
 * read the string with {@link BitStringReader.tryReadUnsigned}
 * until the rest of the bits are consumed. If the requested bit width is zero,
 * {@link BitStringReader.tryReadUnsigned} would never return `undefined`.
 *
 * ---
 *
 * Note that this module by itself does not offer any compression capabilities like LZW or RLE
 * besides the ability to efficiently pack and unpack a set of variable-width numbers.
 *
 * Additionally, be careful to not use byte-/character-level compression algorithms
 * (for example, the one implemented by `LZString`) on a BitString, since doing so would most likely
 * increase the size of the resulting string instead of compressing it.
 * This happens because even if the BitString contains a lot of repeating values, the resulting
 * characters more often than not would be chaotic, without obvious patterns for
 * a byte-level compression to spot.
 *
 * ---
 *
 * @todo
 * Currently, there is no floating point numbers encoding support in this module.
 * If the need to support packing floating point numbers or other kind of data arises,
 * feel free to reach out to the initial author for help.
 *
 * @example <caption>A simple workflow example</caption>
 * const writer = new BitStringWriter();
 * writer.writeUnsigned(42, 15);  // writes a 15-bit unsigned integer
 * writer.writeSigned(-999, 23);  // writes a 23-bit signed integer
 * writer.writeUnsigned(1023, 10);  // writes a 10-bit signed integer
 *
 * const bitStr = writer.toBitString();  // creates a 3-characters long string holding
 *                                       // 48 bits of data.
 *
 * // Reading
 *
 * const reader = new BitStringReader(bitStr);
 * reader.readUnsigned(15);  // returns 42
 * reader.readSigned(23);  // returns -999
 * reader.readUnsigned(10);  // returns 1023
 *
 * @example <caption>A more complex workflow; dynamic calculation of the required bit width.</caption>
 * // The data to pack.
 * let arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 32];
 *
 * // Calculate the maximum bit width of the data values.
 * let requiredBitWidth = 0;
 * for (const value of arr) {
 *   requiredBitWidth = Math.max(requiredBitWidth, BitStringHelper.getBitsCountForUnsigned(value));
 * }
 * // requiredBitWidth == 6 given the arr above. Slightly inefficient because of one big integer at the end.
 * // Otherwise, it would've been 4.
 *
 * let writer = new BitStringWriter();
 * // Write the amount of elements and their width. Using 16 bit for length, should add more checks or logic
 * // if it is expected that arr can be arbitrarily long.
 * writer.writeUnsigned(arr.length, 16);
 * writer.writeUnsigned(requiredBitWidth, 6);  // 6 bit is enough to store bit width of any safe JavaScript integer
 *
 * // Write the elements themselves. Again, assuming unsigned values here.
 * for (const value of arr) {
 *   writer.writeUnsigned(value, requiredBitWidth);
 * }
 *
 * const bitStr = writer.toBitString();
 * // bitStr is only 6 characters.
 * // Compare to 25 characters required to store the minified JSON representation of the same array.
 *
 * // Reading
 *
 * const reader = new BitStringReader(bitStr);
 * const len = reader.readUnsigned(16);
 * const bitsPerElement = reader.readUnsigned(6);
 * arr = [];
 * for (let i = 0; i < len; i++) {
 *   arr.push(reader.readUnsigned(bitsPerElement));
 * }
 *
 * // arr is now equals to [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 32].
 */

/**
 * Same as String.fromCharCode(...array), but supports very long arrays unlike the original.
 * @param {number[]} array
 * @returns {string}
 */
function CreateStringFromCharCodes(array) {
	const chunkSize = 8191;
	let result = "";
	for (let i = 0; i < array.length; i += chunkSize) {
		result += String.fromCharCode.apply(null, array.slice(i, i + chunkSize));
	}
	return result;
}

/**
 * A collection of helper functions used throughout the module.
 * They should be used by the users when working with dynamically-sized fields.
 */
export class BitStringHelper {
	/**
	 * @param {number} value a non-negative integer. The value to be encoded.
	 * @param {number} bits a non-negative integer between 0 and `SAFE_INTEGER_BITS`, inclusive.
	 * The amount of bits the value should be encoded in.
	 * @returns {boolean} Whether we can encode an unsigned `value` in `bits` bits.
	 */
	static canFitUnsigned(value, bits) {
		if (bits < 0) {
			return false;
		}

		// This correctly handles bits === 0 special case since getMask(0) === 0
		return value <= _BitStringHelperInternal.getMask(bits);
	}

	/**
	 * @param {number} value an integer. The value to be encoded.
	 * @param {number} bits a non-negative integer between 0 and `SAFE_INTEGER_BITS`, inclusive.
	 * The amount of bits the value should be encoded in.
	 * @returns {boolean} Whether we can encode a signed `value` in `bits` bits.
	 */
	static canFitSigned(value, bits) {
		// Special case: we can always write 0 to zero-width fields, but no other values
		if (bits === 0) {
			return value === 0;
		}

		if (value < 0) {
			value = -value - 1;
		}

		return BitStringHelper.canFitUnsigned(value, bits - 1);
	}

	/**
	 * @param {number} value a non-negative integer. The value to be encoded.
	 * @returns {number} The minimal amount of bits required to encode a given unsigned value.
	 * For zero values returns zero.
	 */
	static getBitsCountForUnsigned(value) {
		if (value < 0) {
			throw new Error(
				`Invalid argument: getBitsCountForUnsigned() called on a negative value ${value}`,
			);
		}
		return value === 0 ? 0 : Math.floor(Math.log2(value)) + 1;
	}

	/**
	 * @param {number} value an integer. The value to be encoded.
	 * @returns {number} The minimal amount of bits required to encode a given signed value.
	 * For zero values returns zero.
	 */
	static getBitsCountForSigned(value) {
		if (value === 0) {
			return 0;
		}

		if (value < 0) {
			value = -value - 1;
		}

		return BitStringHelper.getBitsCountForUnsigned(value) + 1;
	}

	/**
	 * The maximum unsigned number which can fit into a given number of bits.
	 * @param {number} bits
	 * @return {number}
	 */
	static maxUnsignedInBits(bits) {
		return Math.pow(2, bits) - 1;
	}

	/**
	 * The maximum signed number which can fit into a given number of bits.
	 * @param {number} bits
	 * @return {number}
	 */
	static maxSignedInBits(bits) {
		if (bits <= 1) {
			return 0;
		}
		return Math.pow(2, bits - 1) - 1;
	}

	/**
	 * The minimum signed number which can fit into a given number of bits.
	 * @param {number} bits
	 * @return {number}
	 */
	static minSignedInBits(bits) {
		if (bits === 1) {
			return -1;
		} else if (bits <= 0) {
			return 0;
		}
		return -Math.pow(2, bits - 1);
	}
}

/**
 * Internal functions used by the module.
 */
class _BitStringHelperInternal {
	static CHAR_BITS = 16;
	static CHAR_BYTES = 2;
	static CHAR_MASK = 0xffff;
	static SAFE_INTEGER_BITS = 53;

	/**
	 * @param {number} bits
	 * @returns {number} An integer mask with `bits` lower bits set to 1.
	 */
	static getMask(bits) {
		return Math.pow(2, bits) - 1;
	}

	/**
	 * @param {number} uval a non-negative integer
	 * @param {number} bits
	 * @returns {number} a signed integer from an unsigned interpretation of a `bits`-long twos complement integer `uval`.
	 */
	static twosComplementToSigned(uval, bits) {
		const complement = Math.pow(2, bits);
		const highBit = Math.pow(2, bits - 1);

		if (uval < highBit) {
			return uval;
		}

		return uval - complement;
	}

	/**
	 * @param {number} val a signed integer
	 * @param {number} bits
	 * @returns {number} an unsigned `bits`-long twos complement interpretation of a given signed integer.
	 */
	static twosComplementToUnsigned(val, bits) {
		const complement = Math.pow(2, bits);

		if (val < 0) {
			val += complement;
		}

		return val;
	}

	/**
	 * A helper checking user-provided `bits` range.
	 * @param {number} bits
	 * @param {string} funcName
	 * @throws {Error} if `bits` is out of [0; SAFE_INTEGER_BITS] range.
	 */
	static checkBitsCountCorrect(bits, funcName) {
		if (bits < 0) {
			throw new Error(
				`Invalid argument: ${funcName} bits must be non-negative, got ${bits}`,
			);
		}

		if (bits > _BitStringHelperInternal.SAFE_INTEGER_BITS) {
			throw new Error(
				`Invalid argument: ${funcName} bits must be <= than ${_BitStringHelperInternal.SAFE_INTEGER_BITS} ` +
					`to prevent handling a number greater than Number.MAX_SAFE_INTEGER, got ${bits} bits`,
			);
		}
	}

	/**
	 * Converts a given array of unsigned 16-bit integers into a base64 string.
	 *
	 * @param {number[]} array
	 * @returns {string}
	 */
	static u16ArrayToBase64(array) {
		const bytes = [];
		for (const char of array) {
			bytes.push(char & 0xff);
			bytes.push(char >> 8);
		}
		const byteString = CreateStringFromCharCodes(bytes);
		return btoa(byteString);
	}

	/**
	 * Converts a base64 string obtained from calling {@link _BitStringHelperInternal.u16ArrayToBase64}
	 * into a string which the {@link BitStringReader} can read.
	 *
	 * @param {string} b64Str
	 * @returns {string | undefined}
	 */
	static base64ToU16String(b64Str) {
		let byteString;
		try {
			byteString = atob(b64Str);
		} catch (e) {
			console.error(
				`base64ToU16String(): invalid base64 string "${b64Str}": ${e}`,
			);
			return undefined;
		}

		const chars = new Array(Math.floor(byteString.length / _BitStringHelperInternal.CHAR_BYTES));
		for (let i = 0; i < byteString.length; i += _BitStringHelperInternal.CHAR_BYTES) {
			chars[i / _BitStringHelperInternal.CHAR_BYTES] =
				byteString.charCodeAt(i) | (byteString.charCodeAt(i + 1) << 8);
		}
		return CreateStringFromCharCodes(chars);
	}
}

/**
 * The writer class. It is responsible for creating a BitString from a sequence of variable-sized integers.
 */
export class BitStringWriter {
	/**
	 * Creates a new and empty `BitStringWriter`.
	 */
	constructor() {
		/**
		 * The current buffer: an array of 16-bit unsigned integers representing the bit stream this class writes to.
		 * @type {number[]}
		 * @private
		 */
		this._buffer = [];
		/**
		 * The amount of free bits in the last char of the {@link BitStringWriter._buffer}.
		 *
		 * Always inside `[CHAR_BITS, 0]`.
		 *
		 * Writing to the bit stream decreases this value until 0 is hit, in which case
		 * the next non-zero-bits writing attempt pushes `0` into the {@link BitStringWriter._buffer}
		 * and resets {@link BitStringWriter._freeBitsLastChar}
		 * back to {@link _BitStringHelperInternal.CHAR_BITS}.
		 *
		 * @type {number}
		 * @private
		 */
		this._freeBitsLastChar = 0;
	}

	/**
	 * Resets the current writer, discarding any data written so far.
	 * @returns {this}
	 */
	reset() {
		this._buffer = [];
		this._freeBitsLastChar = 0;
		return this;
	}

	/**
	 * Converts the currently held data into a `string` and returns it. Does not modify the internal buffer.
	 * @returns {string}
	 */
	toBitString() {
		return CreateStringFromCharCodes(this._buffer);
	}

	/**
	 * Converts the currently held data into a `base64` string and returns it. Does not modify the internal buffer.
	 * @returns {string}
	 */
	toBase64() {
		return _BitStringHelperInternal.u16ArrayToBase64(this._buffer);
	}

	/**
	 * Converts the currently held data into a `string` and returns it. Resets the internal buffer.
	 * @returns {string}
	 */
	flush() {
		const res = this.toBitString();
		this.reset();
		return res;
	}

	/**
	 * Converts the currently held data into a `base64` string and returns it. Resets the internal buffer.
	 * @returns {string}
	 */
	flushBase64() {
		const res = this.toBase64();
		this.reset();
		return res;
	}

	/**
	 * Writes an unsigned integer with `bits` width.
	 *
	 * Throws an `Invalid argument` error when any of the following is true:
	 * - `value` is negative;
	 * - `bits` is outside [0; SAFE_INTEGER_BITS] range;
	 * - `bits` bits is not enough to store `value`.
	 *
	 * @param {number} value a non-negative integer to be encoded.
	 * @param {number} bits a non-negative integer. The amount of bits the value should take.
	 * @returns {this}
	 */
	writeUnsigned(value, bits) {
		_BitStringHelperInternal.checkBitsCountCorrect(
			bits,
			"BitStringWriter.writeUnsigned()",
		);

		if (value < 0) {
			throw new Error(
				`Invalid argument: BitStringWriter.writeUnsigned() cannot write negative values, got ${value}`,
			);
		}

		if (!BitStringHelper.canFitUnsigned(value, bits)) {
			throw new Error(
				`Invalid argument: BitStringWriter.writeUnsigned() value overflow: ` +
				`cannot fit unsigned value ${value} into ${bits} bits`,
			);
		}

		this._writeUnsignedValueNoChecks(value, bits);
		return this;
	}

	/**
	 * Writes a signed integer with `bits` width.
	 *
	 * Throws an `Invalid argument` error when any of the following is true:
	 * - `bits` is outside [0; SAFE_INTEGER_BITS] range;
	 * - `bits` bits is not enough to store `value`.
	 *
	 * @param {number} value a signed integer to be encoded.
	 * @param {number} bits a non-negative integer. The amount of bits the value should take.
	 * @returns {this}
	 */
	writeSigned(value, bits) {
		_BitStringHelperInternal.checkBitsCountCorrect(
			bits,
			"BitStringWriter.writeSigned()",
		);

		if (!BitStringHelper.canFitSigned(value, bits)) {
			throw new Error(
				`Invalid argument: BitStringWriter.writeSigned() value overflow: cannot fit signed value ${value} into ${bits} bits`,
			);
		}

		this._writeUnsignedValueNoChecks(
			_BitStringHelperInternal.twosComplementToUnsigned(value, bits),
			bits,
		);
		return this;
	}

	/**
	 * A convenience function for writing a single bit expressed as an integer of value of either `0` or `1`.
	 *
	 * With the correct arguments behaves exactly like `writeUnsigned(value, 1)`.
	 *
	 * Any other value passed to this function would result in an error.
	 * @param {number} value either `0` or `1`.
	 * @throws {Error} when a value not equal to either `0` or `1` is received.
	 * @returns {this}
	 */
	writeBit(value) {
		if (value !== 0 && value !== 1) {
			throw new Error(
				`Invalid argument: BitStringWriter.writeBit requires either a literal 0 or a literal 1, got ${value}`,
			);
		}

		this._writeBitNoChecks(value);
		return this;
	}

	/**
	 * A convenience function for writing a single boolean value.
	 *
	 * Coerces {@link value} to a boolean, then writes `1` if the result is truthy, `0` otherwise.
	 *
	 * @param {any} value
	 * @returns {this}
	 */
	writeBool(value) {
		if (value) {
			this._writeBitNoChecks(1);
		} else {
			this._writeBitNoChecks(0);
		}
		return this;
	}

	/**
	 * Writes an unsigned value without bit-width checks.
	 * @param {number} value
	 * @param {number} bits
	 * @private
	 */
	_writeUnsignedValueNoChecks(value, bits) {
		// Special case for zero-width fields; value is guaranteed to be 0 here because canFit*() functions check for it
		if (bits === 0) {
			return;
		}

		// 1. Write the lower bits into the free bits of the current last char
		if (this._freeBitsLastChar > 0) {
			const bitsToWrite = Math.min(this._freeBitsLastChar, bits);
			// Using & here is safe because bitsToWrite is always <= CHAR_BITS (which is 16),
			// thus & truncating bits higher than the lower 32 is not an issue
			this._addBitsToBufferLastChar(
				value & _BitStringHelperInternal.getMask(bitsToWrite),
				bitsToWrite,
			);
			bits -= bitsToWrite;
			value = Math.floor(value / Math.pow(2, bitsToWrite)); // value >>= bitsToWrite
		}

		// 2. Write full chars into the buffer
		while (bits >= _BitStringHelperInternal.CHAR_BITS) {
			// Using & here is safe because we only need the lower CHAR_BITS == 16 bits,
			// thus & truncating bits higher than the lower 32 is not an issue
			this._pushFullCharToBuffer(value & _BitStringHelperInternal.CHAR_MASK);
			bits -= _BitStringHelperInternal.CHAR_BITS;
			value = Math.floor(value / Math.pow(2, _BitStringHelperInternal.CHAR_BITS)); // value >>= CHAR_BITS
		}

		// 3. Write the rest bits into the new last char and indicate we have free space in it
		if (bits > 0) {
			this._pushPartCharToBuffer(value, bits);
		}
	}

	/**
	 * Writes `value`, a `bits`-wide integer, to the free space in the last character being written.
	 *
	 * The last char must contain at least `bits` free bits.
	 *
	 * @param {number} value
	 * @param {number} bits
	 * @private
	 */
	_addBitsToBufferLastChar(value, bits) {
		if (this._freeBitsLastChar < bits) {
			throw new Error(
				`Internal error: BitStringWriter._addBitsToBufferLastChar() value ` +
					`overflow: requested to write ${bits} bits, free bits = ${this._freeBitsLastChar}`,
			);
		}

		if (!BitStringHelper.canFitUnsigned(value, bits)) {
			throw new Error(
				`Internal error: BitStringWriter._addBitsToBufferLastChar() value overflow: ` +
					`cannot fit ${value} into ${bits} bits`,
			);
		}

		this._freeBitsLastChar -= bits;
		const lastIdx = this._buffer.length - 1;
		this._buffer[lastIdx] += value * Math.pow(2, this._freeBitsLastChar);
	}

	/**
	 * Adds a full `CHAR_BIT`-wide value to the buffer.
	 *
	 * The last char of the buffer must NOT contain any free bits.
	 *
	 * @param {number} value
	 * @private
	 */
	_pushFullCharToBuffer(value) {
		if (!BitStringHelper.canFitUnsigned(value, _BitStringHelperInternal.CHAR_BITS)) {
			throw new Error(
				`Internal error: BitStringWriter._pushFullCharToBuffer() value overflow: ` +
					`cannot fit ${value} into ${_BitStringHelperInternal.CHAR_BITS} bits`,
			);
		}

		if (this._freeBitsLastChar !== 0) {
			throw new Error(
				`Internal error: BitStringWriter._pushFullCharToBuffer() ` +
					`called when the buffer last char contained ${this._freeBitsLastChar} unfilled bits`,
			);
		}

		this._buffer.push(value);
		this._freeBitsLastChar = 0;
	}

	/**
	 * A specialized version of {@link BitStringWriter._addBitsToBufferLastChar}.
	 * Instead of modifying the last char, it pushes a new one and writes {@link value}
	 * to its first bits.
	 *
	 * The last char of the buffer must NOT contain any free bits.
	 *
	 * @param {number} value
	 * @param {number} bits
	 * @private
	 */
	_pushPartCharToBuffer(value, bits) {
		if (this._freeBitsLastChar !== 0) {
			throw new Error(
				`Internal error: BitStringWriter._pushPartCharToBuffer() ` +
					`called when the buffer last char contained ${this._freeBitsLastChar} unfilled bits`,
			);
		}

		if (bits > _BitStringHelperInternal.CHAR_BITS) {
			throw new Error(
				`Internal error: BitStringWriter._pushPartCharToBuffer() value overflow: ` +
					`bits must be <= ${_BitStringHelperInternal.CHAR_BITS}`,
			);
		}

		if (!BitStringHelper.canFitUnsigned(value, bits)) {
			throw new Error(
				`Internal error: BitStringWriter._addBitsToBufferLastChar() value overflow: ` +
					`cannot fit ${value} into ${bits} bits`,
			);
		}

		this._freeBitsLastChar = _BitStringHelperInternal.CHAR_BITS - bits;
		this._buffer.push(value * Math.pow(2, this._freeBitsLastChar));
	}

	/**
	 * An efficient way to add a single bit to the buffer.
	 * @param {number} value
	 * @private
	 */
	_writeBitNoChecks(value) {
		// Check if we need to expand the buffer
		if (this._freeBitsLastChar <= 0) {
			this._buffer.push(0);
			this._freeBitsLastChar = _BitStringHelperInternal.CHAR_BITS;
		}

		this._freeBitsLastChar -= 1;
		const lastIdx = this._buffer.length - 1;
		// We only need to touch buffer if we need to write a `1` since the free bits
		// are always `0`-initialized
		if (value) {
			this._buffer[lastIdx] += Math.pow(2, this._freeBitsLastChar);
		}
	}
}

/**
 * The reader class. It is responsible for reading packed integers from a BitString.
 */
export class BitStringReader {
	/**
	 * Initialize the reader with a string obtained from calling
	 * {@link BitStringWriter.toBitString} or similar methods.
	 *
	 * @param {string} bitString the input BitString.
	 */
	constructor(bitString) {
		/**
		 * The current buffer, representing the input bit stream.
		 * @type {string}
		 * @private
		 */
		this._buffer = bitString;
		/**
		 * The index of the current char in the {@link BitStringReader._buffer}.
		 *
		 * Together with {@link BitStringReader._bitPosLastChar} it specifies the exact
		 * bit position in the input bit stream.
		 *
		 * @type {number}
		 * @private
		 */
		this._charPos = 0;
		/**
		 * The amount of bits read from the current char. Always inside `[0; CHAR_BITS - 1]`.
		 * @type {number}
		 * @private
		 */
		this._bitPosLastChar = 0;
	}

	/**
	 * Create a new {@link BitStringReader} instance from a base64-encoded string obtained
	 * from a call to {@link BitStringWriter.toBase64}.
	 *
	 * @param {string} b64String
	 * @returns {BitStringReader | undefined}
	 */
	static fromBase64(b64String) {
		const str = _BitStringHelperInternal.base64ToU16String(b64String);
		if (str === undefined) {
			console.error(`BitStringReader.fromBase64(): failed to decode base64 string.`);
			return undefined;
		}
		return new BitStringReader(str);
	}

	/**
	 * Reads an unsigned integer from the reader. Throws an *Invalid argument* error if
	 * there is not enough data left to read full {@link bits} bits.
	 *
	 * If {@link bits} is zero, returns `0` and does not change the state, even if
	 * {@link BitStringReader.overflown} is true.
	 *
	 * @param {number} bits a non-negative integer. The amount of bits to read.
	 * @returns {number} a non-negative integer. The read value.
	 * @throws {Error} if there is not enough bits to read, that is,
	 * if {@link bits} `>` {@link BitStringReader.bitsAvailable}.
	 */
	readUnsigned(bits) {
		const res = this.tryReadUnsigned(bits);
		if (res === undefined) {
			throw new Error(
				`Invalid argument: BitStringReader.readUnsigned() requested ${bits} bits, ` +
					`only ${this.bitsAvailable} bits are available`,
			);
		}
		return res;
	}

	/**
	 * Reads an unsigned integer from the reader. Returns `undefined` if
	 * there is not enough data left to read full {@link bits} bits.
	 *
	 * If {@link bits} is zero, returns `0` and does not change the state, even if
	 * {@link BitStringReader.overflown} is true.
	 *
	 * @param {number} bits a non-negative integer. The amount of bits to read.
	 * @returns {number | undefined} a non-negative integer or `undefined`.
	 * The read value or `undefined` if there is not enough data left to read the full {@link bits} bits.
	 */
	tryReadUnsigned(bits) {
		// Special case for zero-width fields; they always "contain" zeroes
		if (bits === 0) {
			return 0;
		}

		if (this.bitsAvailable < bits) {
			return undefined;
		}

		_BitStringHelperInternal.checkBitsCountCorrect(
			bits,
			"BitStringReader.tryReadUnsigned()",
		);

		const bitsRequired = bits;

		// 1. Read all available/needed bits from the current last char
		const bitsToReadLastChar = Math.min(bits, this._unreadBitsLastChar);
		let acc = this._readBitsLastChar(bitsToReadLastChar);
		let accBitRead = bitsToReadLastChar;
		bits -= bitsToReadLastChar;

		// 2. Read full chars
		while (bits >= _BitStringHelperInternal.CHAR_BITS) {
			acc += this._readFullChar() * Math.pow(2, accBitRead);
			accBitRead += _BitStringHelperInternal.CHAR_BITS;
			bits -= _BitStringHelperInternal.CHAR_BITS;
		}

		// 3. Read the rest of the bits from the current last char
		if (bits > 0) {
			acc += this._readBitsLastChar(bits) * Math.pow(2, accBitRead);
			accBitRead += bits;
		}

		if (accBitRead !== bitsRequired) {
			throw new Error(
				`Internal error: BitStringReader.tryReadUnsigned() ` +
					`read ${accBitRead} bits when ${bits} bits were requested`,
			);
		}

		return acc;
	}

	/**
	 * Reads a signed integer from the reader. Throws an *Invalid argument* error if
	 * there is not enough data left to read full {@link bits} bits.
	 *
	 * If {@link bits} is zero, returns `0` and does not change the state, even if
	 * {@link BitStringReader.overflown} is true.
	 *
	 * @param {number} bits a non-negative integer. The amount of bits to read.
	 * @returns {number} a signed integer. The read value.
	 * @throws {Error} if there is not enough bits to read, that is,
	 * if {@link bits} `>` {@link BitStringReader.bitsAvailable}.
	 */
	readSigned(bits) {
		const res = this.tryReadSigned(bits);
		if (res === undefined) {
			throw new Error(
				`Invalid argument: BitStringReader.readSigned() requested ${bits} bits, ` +
					`only ${this.bitsAvailable} bits are available`,
			);
		}
		return res;
	}

	/**
	 * Reads a signed integer from the reader. Returns `undefined` if
	 * there is not enough data left to read full {@link bits} bits.
	 *
	 * If {@link bits} is zero, returns `0` and does not change the state, even if
	 * {@link BitStringReader.overflown} is true.
	 *
	 * @param {number} bits a non-negative integer. The amount of bits to read.
	 * @returns {number | undefined} a signed integer or `undefined`.
	 * The read value or `undefined` if there is not enough data left to read the full {@link bits} bits.
	 */
	tryReadSigned(bits) {
		// Special case for zero-width fields; they always "contain" zeroes
		if (bits === 0) {
			return 0;
		}

		const uval = this.tryReadUnsigned(bits);
		if (uval === undefined) {
			return undefined;
		}
		return _BitStringHelperInternal.twosComplementToSigned(uval, bits);
	}

	/**
	 * A helper function for efficient reading of a single bit.
	 *
	 * Behaves exactly like `readUnsigned(1)` but is more efficient.
	 *
	 * @returns {0 | 1} either `0` or `1`.
	 * @throws {Error} if there is no more data available.
	 */
	readBit() {
		const res = this._tryReadBitFast();
		if (res === undefined) {
			throw new Error(
				`Invalid argument: BitStringReader.readBit() called on a reader with mo more data available`,
			);
		}
		return res;
	}

	/**
	 * A helper function for efficient reading of a single bit.
	 *
	 * Behaves exactly like `tryReadUnsigned(1)` but is more efficient.
	 *
	 * @returns {0 | 1 | undefined} either `0`, `1`, or `undefined`, the latter indicating
	 * there is no more data to read.
	 */
	tryReadBit() {
		if (this.overflown) {
			return undefined;
		}
		return this._tryReadBitFast();
	}

	/**
	 * A helper function for efficient reading of a single bit.
	 *
	 * Behaves exactly like {@link BitStringReader.readBit}, but returns a boolean
	 * value instead of a number.
	 *
	 * @returns {boolean}
	 * @throws {Error} if there is no more data available.
	 */
	readBool() {
		return !!this.readBit();
	}

	/**
	 * A helper function for efficient reading of a single bit.
	 *
	 * Behaves exactly like {@link BitStringReader.tryReadBit}, but returns a boolean
	 * value instead of a number.
	 *
	 * @returns {boolean | undefined} either the value of the bit, or `undefined`
	 * if there is no more data to read.
	 */
	tryReadBool() {
		if (this.overflown) {
			return undefined;
		}
		return !!this._tryReadBitFast();
	}

	/**
	 * @returns {boolean} whether the current reader has any more data to read.
	 */
	get overflown() {
		return this._charPos >= this._buffer.length;
	}

	/**
	 * @returns {number} the amount of bits in total that can be read from the current reader,
	 * not including already read ones.
	 */
	get bitsAvailable() {
		return (
			(this._buffer.length - this._charPos) * _BitStringHelperInternal.CHAR_BITS - this._bitPosLastChar
		);
	}

	/**
	 * Reads {@link bits} bits from the current char and returns them as an unsigned integer.
	 *
	 * The current char MUST contain at least {@link bits} unread bits.
	 *
	 * @param {number} bits
	 * @returns {number}
	 * @private
	 */
	_readBitsLastChar(bits) {
		if (this.overflown) {
			throw new Error(
				`Internal error: BitStringReader._readBitsLastChar() overflown: reading past the end of the buffer`,
			);
		}

		if (bits > this._unreadBitsLastChar) {
			throw new Error(
				`Internal error: BitStringReader._readBitsLastChar() overflow: requested to read ${bits} bits, ` +
					`have only ${this._unreadBitsLastChar} unread bits in the last char`,
			);
		}

		const mask = _BitStringHelperInternal.getMask(bits);
		const skipLowBits = this._unreadBitsLastChar - bits;

		// Using & here is safe because bits is always <= CHAR_BITS (which is 16),
		// thus & truncating bits higher than the lower 32 is not an issue.
		// >> is safe as well because charCodeAt always returns a 16-bit integer.
		const res = (this._buffer.charCodeAt(this._charPos) >> skipLowBits) & mask;
		this._advanceBits(bits);
		return res;
	}

	/**
	 * Reads a full {@link _BitStringHelperInternal.CHAR_BITS}-bits unsigned integer
	 * from the current char, and advances to the next one.
	 *
	 * Must only be called when {@link BitStringReader._bitPosLastChar} === 0.
	 *
	 * @returns {number}
	 * @private
	 */
	_readFullChar() {
		if (this.overflown) {
			throw new Error(
				`Internal error: BitStringReader._readFullChar() overflown: reading past the end of the buffer`,
			);
		}

		if (this._bitPosLastChar !== 0) {
			throw new Error(
				`Internal error: BitStringReader._readFullChar() ` +
					`called when the buffer last char still contained ${this._unreadBitsLastChar} unread bits`,
			);
		}

		const res = this._buffer.charCodeAt(this._charPos);
		this._charPos += 1;
		return res;
	}

	/**
	 * A faster way of reading a single bit.
	 *
	 * @returns {0 | 1 | undefined} 0, 1, or `undefined`, the latter indicating
	 * there is no more data to read.
	 * @private
	 */
	_tryReadBitFast() {
		if (this.overflown) {
			return undefined;
		}

		const skipLowBits = this._unreadBitsLastChar - 1;
		// Using bitwise arithmetic here is safe because `charCodeAt()` always returns a 16-bit integer.
		const lastCharSkipped =
			this._buffer.charCodeAt(this._charPos) >> skipLowBits;
		this._advanceBits(1);
		// The `& 1` guarantees the return value is either 0 or 1.
		// @ts-expect-error: TS2322
		return lastCharSkipped & 1;
	}

	/**
	 * Advances the current bit position in the buffer.
	 *
	 * The resulting {@link BitStringReader._bitPosLastChar} after calling this function
	 * always lies inside `[0; CHAR_BITS - 1]` range, meaning there is always at least one bit
	 * to read in the current char, unless {@link BitStringReader._charPos} is >= the length
	 * of {@link BitStringReader._buffer}, which indicates that there is no more data to read.
	 *
	 * @param {number} bits how many bits to advance.
	 * @private
	 */
	_advanceBits(bits) {
		const bitPosOverflown = this._bitPosLastChar + bits;
		this._bitPosLastChar = bitPosOverflown % _BitStringHelperInternal.CHAR_BITS;
		this._charPos += Math.floor(bitPosOverflown / _BitStringHelperInternal.CHAR_BITS);
	}

	/**
	 * @returns {number} the amount of bits available for reading in the current char.
	 * Always > 0, even if {@link BitStringReader.overflown} is `true`.
	 * @private
	 */
	get _unreadBitsLastChar() {
		return _BitStringHelperInternal.CHAR_BITS - this._bitPosLastChar;
	}
}
