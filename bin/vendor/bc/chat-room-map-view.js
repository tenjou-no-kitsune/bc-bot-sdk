// Screens/Online/ChatRoom/ChatRoomMapView.js

import { BitStringHelper, BitStringReader, BitStringWriter } from "./bit-string";
import { CommonIsObject } from "./common";
import { decompressFromBase64, compressToBase64 } from "lz-string";

var ChatRoomMapViewWidth = 40;
var ChatRoomMapViewHeight = 40;

const ChatRoomMapViewEffectStartID = 10;

/**
 * A list of predefined lighting effects. May be replaced with a color picker in the future.
 * @type {ChatRoomMapEffect[]}
 * */
const ChatRoomMapViewEffectList = [
	{ ID: 10, Type: "StaticLighting", TypeId: 1, Color: [0, 0, 0, 0.0] }, // Blank

	{ ID: 11, Type: "StaticLighting", TypeId: 1, Color: [0, 0, 0, 0.2] }, // ShadowLight
	{ ID: 12, Type: "StaticLighting", TypeId: 1, Color: [0, 0, 0, 0.5] }, // ShadowMedium
	{ ID: 13, Type: "StaticLighting", TypeId: 1, Color: [0, 0, 0, 0.8] }, // ShadowDark
	{ ID: 14, Type: "StaticLighting", TypeId: 1, Color: [255, 0, 0, 0.3] }, // TintRed
	{ ID: 15, Type: "StaticLighting", TypeId: 1, Color: [0, 0, 255, 0.3] }, // TintBlue
	{ ID: 16, Type: "StaticLighting", TypeId: 1, Color: [0, 255, 0, 0.3] }, // TintGreen
	{ ID: 17, Type: "StaticLighting", TypeId: 1, Color: [255, 255, 0, 0.3] }, // GlowYellow
];

/**
 * @namespace
 * @description
 * # Binary-encoded map data
 * This module implements the new way of encoding the map data.
 *
 * At its core lies the concept of a BitString: a stream of tightly-packed
 * numbers with arbitrary bit width. This allows us to store data way more efficiently
 * than using plain JSONs, even if they are packed with LZString.
 *
 * # Compatibility
 * Binary encoding, while efficient, requires a very careful architectural approach to ensure
 * maximum compatibility. Notable, we must ensure that:
 *
 * - Exported map strings from any older game version *always* remain compatible
 *   with the newer game versions. Players losing their old saved maps is an unacceptable
 *   outcome; we must ensure that we recover as much data as possible from those old saves.
 * - Map data synced between the players in a map-enabled room must be readable
 *   by the clients one version older than the current one. This is to ensure
 *   that during the beta period the main branch players could join and play
 *   the rooms created by beta players. This is not as strict of a requirement
 *   as the previous point, but is still important.
 * - Exported map strings from the newer version must be usable by the players
 *   using a game one version older. This ensures that the beta players can share
 *   map strings with non-beta ones, and is the least concern among others, since
 *   beta periods are quite short and *sharing* the map string doesn't happen too often.
 *   Still, it is good to at least make some effort to allow it.
 *
 * Binary encoding makes achieving those requirements non-trivial, because
 * to decode a given BitString the game must know exactly what were the bit widths
 * of the integers encoded into it, and also their meaning. If we just change
 * the code that encodes the map data, then we would no longer able to decode the old data.
 *
 * To solve this issue, we introduce the concept of codec versions. A version
 * is a number that we write into the bit stream before the actual data, which
 * would allow the game to understand which codec was used to encode the data,
 * and call it to decode the data.
 *
 * Whenever we need to sufficiently change the encoding scheme, we copy
 * the latest codec, increase its version and make the required changes.
 * Copying and pasting the code, while usually not advised, would be a better approach
 * in this specific case. This way, we ensure that the old codecs remain "frozen"
 * in time, so no matter how old the map data is, we always have an appropriate codec
 * for it.
 *
 * One issue which may arise in the future is the change in the schemas
 * of the objects we encode. In this case, we would need an additional "migrations" layer
 * which would take the old decoded data and convert it to the one we currently require.
 *
 * Solving the issue of letting the old clients to use the data from beta versions
 * is not that straightforward, and on the most occasions we would require ad-hoc solutions.
 * For example, during the beta period we may use two fields, `Data` and `DataOld`,
 * with the former containing the data encoded with the most recent codec,
 * and the latter having the data encoded with the previous codec.
 * Of course, depending on the nature of the required changes, it may be possible
 * to make a more space-efficient solution.
 *
 * # Future work
 * Currently, we only binary-encode the map effects, to remain in the scope of the original MR.
 * We do this by storing the encoded map effects in the {@link ChatRoomData.MapData.Effects}
 * global value, while {@link ChatRoomData.MapData.Tiles} and {@link ChatRoomData.MapData.Objects}
 * remain unchanged. Thus, we don't need to change much of the existing code, which
 * continues to use those latter fields.
 *
 * In future MRs we hope to unify the encoding of tiles, objects and effects, writing them all
 * into a single BitString. This would allow us to have much greater compression and save
 * a lot of traffic.
 *
 * Later, all map data would be stored in {@link ChatRoomMapManager.Map} global value
 * instead of {@link ChatRoomData.MapData}. This is because we're no longer storing
 * the map data as simple strings which we can trivially serialize and send to the server.
 * Ideally, the outside code would use {@link ChatRoomMapManager} methods to obtain
 * the encoded map data when needed (e.g. sending it to the server, or saving the map data
 * for room recreation, or exporting the room via a room code). Failing that,
 * we can continue the approach used in the initial version of this system: having the decoded
 * map data in {@link ChatRoomMapManager.Map} and maintain the encoded representation
 * of this map in {@link ChatRoomData.MapData}.
 *
 * After that we would have an avenue for encoding additional arbitrary data within each tile
 * while retaining the compact encoding. This, then, would allow us to have any sorts of "tile settings",
 * which would be a great addition to the map rooms in the Club.
 *
 * # Mod compatibility
 * This module is a work in progress and would change significantly in the future.
 * As such, only the minimum amount of public APIs is exposed as of now. Mod authors
 * are advised to not rely on its current behavior if at all possible.
 * We expect to expose more public APIs in the future as the module matures.
 *
 * # General design choices
 * While being public, {@link ChatRoomMapManager.Map} preferably should be only
 * accessed inside this file as it is an implementation detail of this module.
 * If the outside code requires to access something in this module, it's best
 * to provide a separate function in the {@link ChatRoomMapManager} namespace,
 * or a global one.
 *
 * # Codecs general overview
 * ## Version 0
 * The initial codecs version. Only encoding map effects. Only allows for a single
 * map effect per tile (the groundwork for having multiple effects per tile is laid,
 * but the rest of the code is not ready for it).
 *
 * Effects are encoded by their IDs, similar to the original Tiles and Objects encoding.
 * A simple RLE compression is applied to the "flat" effects array, with a small twist:
 * we use larger bit width for storing run-lengths of the blank effect sequences.
 * This allows us to more efficiently encode the typical maps where the most of
 * the tiles would have blank effects.
 *
 * Additionally, we modify the effect IDs in the following way:
 * 1. First, we subtract the lowest used effect ID
 *    ({@link ChatRoomMapViewEffectStartID} in the most cases) from them, getting
 *    what we call "shifted" IDs which begin from zero.
 * 2. Next, we create the list of all used "shifted" IDs and write them in the stream.
 *    The usage of "shifted" IDs ensures this array is very compact no matter what
 *    our {@link ChatRoomMapViewEffectStartID} is.
 * 3. Finally, when writing the effect IDs, we instead use the indexes in the list
 *    from the previous step, and call them the "remapped" IDs.
 *
 * This allows us to write the least possible amount of data per effect ID: for example,
 * if only one effect - besides the blank - is used in a map, then each mention of that ID
 * would only require a single bit of data, no matter what the actual value of this effect is.
 *
 * This scheme results in a sufficiently efficient compression rate in practice.
 * - For maps without effects we will be sending 24 additional bytes (after base64 encoding).
 * - Maps with a few patches of effects require around 0.5-1 bits per tile (after base64 encoding).
 * - Moderately sophisticated maps with a lot of different effects require somewhere around 1.5-3 bits per tile.
 * - In the worst case scenario (a map fully filled with all possible effects without repetitions),
 *   we would require slightly above 5.3 bits per tile after base64 encoding.
 */
export const ChatRoomMapManager = (function () {
	/**
	 * The class storing the game map data. Currently only stores the lighting effects.
	 */
	class MapData {
		/**
		 * @param {ChatRoomMapEffect[][]=} effects
		 */
		constructor(effects) {
			const tilesLen = ChatRoomMapViewWidth * ChatRoomMapViewHeight;
			/**
			 * @type {ChatRoomMapEffect[][]}
			 */
			this.effects = effects ?? Array.from({ length: tilesLen }, () => []);
		}

		/**
		 * Removes all effects from the map.
		 */
		removeAllEffects() {
			const len = this.effects.length;
			this.effects = Array.from({ length: len }, () => []);
		}
	}

    /** @type {ServerChatRoomMapData|null} */
    let LocalMapData = null;

	/**
	 * @type {Record<number, ChatRoomMapManager.EffectsCodec>}
	 */
	const MapEffectsCodecs = {
		0: (function () {
			/**
			 * @type {ChatRoomMapManager.MapEffectsCodecs_v0.ConstSettings}
			 */
			const constSettings = (function () {
				const rleBitsEmpty = 8; // up to 257 repetitions
				const rleMaxEmpty = BitStringHelper.maxUnsignedInBits(rleBitsEmpty) + 2;
				const rleBitsFilled = 4; // up to 18 repetitions
				const rleMaxFilled =
					BitStringHelper.maxUnsignedInBits(rleBitsFilled) + 2;
				return {
					rleBitsEmpty,
					rleMaxEmpty,
					rleBitsFilled,
					rleMaxFilled,
					bitLenBits: 6, // [0; 32] bits
					arrayLenInBytesBits: 2, // up to 4 bytes == 2^32 elements, which is a JS limit
				};
			})();

			/**
			 * @param {ChatRoomMapEffect[]} effectsFlat
			 * @returns {ChatRoomMapManager.MapEffectsCodecs_v0.DynamicSettings}
			 */
			function buildDynamicSettings(effectsFlat) {
				const effectIds = [...new Set(effectsFlat.map((eff) => eff.ID))].sort();
				const effectIdMin = effectIds[0] ?? 0;
				const effectIdMax = effectIds[effectIds.length - 1] ?? 0;
				const effectIdShiftedMax = effectIdMax - effectIdMin;

				/**
				 * @type {Map<number, number>}
				 */
				const effectIdShiftedToRemapId = new Map();
				/**
				 * @type {Map<number, number>}
				 */
				const remapIdToEffectIdShifted = new Map();
				for (const [remapId, effectId] of effectIds.entries()) {
					effectIdShiftedToRemapId.set(effectId - effectIdMin, remapId);
					remapIdToEffectIdShifted.set(remapId, effectId - effectIdMin);
				}
				const baseIdBits = BitStringHelper.getBitsCountForUnsigned(effectIdMin);
				const shiftedIdBits =
					BitStringHelper.getBitsCountForUnsigned(effectIdShiftedMax);
				const remappedIdBits = BitStringHelper.getBitsCountForUnsigned(
					effectIds.length - 1,
				);

				/**
				 * @type {number[]}
				 */
				const effectIdsShifted = effectIds.map(
					(effectId) => effectId - effectIdMin,
				);

				return {
					baseIdBits,
					shiftedIdBits,
					remappedIdBits,
					effectIdMin,
					effectsLength: effectsFlat.length,
					effectIdsShifted,
					effectIdShiftedToRemapId,
					remapIdToEffectIdShifted,
				};
			}

			/**
			 * Calculates the remapped effect ID from the raw, non-shifted effect ID.
			 * No error checks are done.
			 * @param {number} effectId
			 * @param {ChatRoomMapManager.MapEffectsCodecs_v0.DynamicSettings} settings
			 * @returns {number}
			 */
			function getRemappedId(effectId, settings) {
				return (
					settings.effectIdShiftedToRemapId.get(
						effectId - settings.effectIdMin,
					) ?? 0
				);
			}

			/**
			 * Calculates the full effect ID from the remapped ID.
			 * No error checks are done.
			 * @param {number} remappedId
			 * @param {ChatRoomMapManager.MapEffectsCodecs_v0.DynamicSettings} settings
			 * @returns {number}
			 */
			function getEffectId(remappedId, settings) {
				return (
					(settings.remapIdToEffectIdShifted.get(remappedId) ?? 0) +
					settings.effectIdMin
				);
			}

			/**
			 * Writes the array length {@link length}. The byte size of the length is written
			 * in the first two bits, followed by `byte size` * 8 bits of the actual length.
			 * This enables a more efficient length encoding of small arrays while preserving the ability
			 * to encode any array length JavaScript supports (up to 2^32 - 1).
			 * @param {number} length the length of an array. Must be less than 2^32.
			 * @param {BitStringWriter} writer
			 * @returns {void}
			 */
			function writeArrayLength(length, writer) {
				const lenBytes =
					Math.ceil(BitStringHelper.getBitsCountForUnsigned(length) / 8) | 0;
				const lenBits = lenBytes * 8;
				writer.writeUnsigned(lenBytes, constSettings.arrayLenInBytesBits);
				writer.writeUnsigned(length, lenBits);
			}

			/**
			 * Reads the array length written with the {@link writeArrayLength} function.
			 * @param {BitStringReader} reader
			 * @returns {number}
			 */
			function readArrayLength(reader) {
				const lenBytes = reader.readUnsigned(constSettings.arrayLenInBytesBits);
				const lenBits = lenBytes * 8;
				return reader.readUnsigned(lenBits);
			}

			/**
			 * Writes an array of unsigned integers {@link array} to the writer {@link writer}.
			 * Each element in the array *must* fit in {@link elementBits} bits.
			 * @param {number[]} array
			 * @param {number} elementBits
			 * @param {BitStringWriter} writer
			 * @returns {void}
			 */
			function writeArray(array, elementBits, writer) {
				writeArrayLength(array.length, writer);
				for (const value of array) {
					writer.writeUnsigned(value, elementBits);
				}
			}

			/**
			 * Reads an array of unsigned integers with element size {@link elementBits}
			 * from {@link reader}.
			 * @param {number} elementBits
			 * @param {BitStringReader} reader
			 * @param {number} maxLen
			 * @returns {number[]}
			 * @throws {Error} when the array is too long (> {@link maxLen}) or when
			 * there is not enough data available in {@link reader}.
			 */
			function readArray(elementBits, reader, maxLen) {
				const len = readArrayLength(reader);
				if (len > maxLen) {
					throw new Error(
						`Invalid length while decoding an array: ${len} while the maximum is ${maxLen}`,
					);
				}
				const res = [];
				for (let i = 0; i < len; i++) {
					res.push(reader.readUnsigned(elementBits));
				}
				return res;
			}

			/**
			 * @param {ChatRoomMapManager.MapEffectsCodecs_v0.DynamicSettings} settings
			 * @param {BitStringWriter} writer
			 * @returns {void}
			 */
			function writeDynamicSettings(settings, writer) {
				writer.writeUnsigned(settings.baseIdBits, constSettings.bitLenBits);
				writer.writeUnsigned(settings.shiftedIdBits, constSettings.bitLenBits);
				writer.writeUnsigned(settings.remappedIdBits, constSettings.bitLenBits);
				writer.writeUnsigned(settings.effectIdMin, settings.baseIdBits);
				writeArray(settings.effectIdsShifted, settings.shiftedIdBits, writer);
				writeArrayLength(settings.effectsLength, writer);
			}

			/**
			 * @param {BitStringReader} reader
			 * @returns {ChatRoomMapManager.MapEffectsCodecs_v0.DynamicSettings}
			 */
			function readDynamicSettings(reader) {
				const baseIdBits = reader.readUnsigned(constSettings.bitLenBits);
				const shiftedIdBits = reader.readUnsigned(constSettings.bitLenBits);
				const remappedIdBits = reader.readUnsigned(constSettings.bitLenBits);
				const effectIdMin = reader.readUnsigned(baseIdBits);
				const effectIdsShifted = readArray(shiftedIdBits, reader, ChatRoomMapViewEffectList.length);
				const effectsLength = readArrayLength(reader);
				/**
				 * @type {Map<number, number>}
				 */
				const effectIdShiftedToRemapId = new Map();
				/**
				 * @type {Map<number, number>}
				 */
				const remapIdToEffectIdShifted = new Map();
				for (const [remapId, effectIdShifted] of effectIdsShifted.entries()) {
					effectIdShiftedToRemapId.set(effectIdShifted, remapId);
					remapIdToEffectIdShifted.set(remapId, effectIdShifted);
				}
				return {
					baseIdBits,
					shiftedIdBits,
					remappedIdBits,
					effectIdMin,
					effectsLength,
					effectIdsShifted,
					effectIdShiftedToRemapId,
					remapIdToEffectIdShifted,
				};
			}

			/**
			 * Calculates the maximum length of the same effects sequence in {@link effectsFlat},
			 * starting with index {@link i}.
			 * @param {number} i
			 * @param {ChatRoomMapEffect[]} effectsFlat
			 * @returns {number} same effect sequence len, >= 1, since effectsFlat[i] is counted too.
			 */
			function getRunLength(i, effectsFlat) {
				const origEffect = effectsFlat[i];
				let idx = i + 1;
				while (
					idx < effectsFlat.length &&
					effectsFlat[idx].ID === origEffect.ID
				) {
					idx++;
				}
				return idx - i;
			}

			/**
			 * @param {number} effectId
			 * @returns {{maxRun: number, rleCountBits: number}}
			 */
			function getRleSettings(effectId) {
				if (effectId === ChatRoomMapViewEffectStartID) {
					return {
						maxRun: constSettings.rleMaxEmpty,
						rleCountBits: BitStringHelper.getBitsCountForUnsigned(
							constSettings.rleMaxEmpty,
						),
					};
				} else {
					return {
						maxRun: constSettings.rleMaxFilled,
						rleCountBits: BitStringHelper.getBitsCountForUnsigned(
							constSettings.rleMaxFilled,
						),
					};
				}
			}

			/**
			 * Writes the encoded effects from {@link effectsFlat} into the writer.
			 * NOTE: this function can only encode single effect per tile.
			 * @param {ChatRoomMapEffect[][]} effectsFlat - a flat 2D array of effects at each tile.
			 * In this version of the codec each tile must contain either 0 or 1 effect.
			 * @param {BitStringWriter} writer
			 * @returns {boolean} `true` if the write operation was successful, `false` otherwise.
			 */
			function write(effectsFlat, writer) {
				// Default to the blank effect in case of zero-elements list
				const effectsFlatSingle = effectsFlat.map(
					(x) => x[0] ?? ChatRoomMapViewEffectList[0],
				);

				const settings = buildDynamicSettings(effectsFlatSingle);
				writeDynamicSettings(settings, writer);

				let i = 0;
				while (i < effectsFlatSingle.length) {
					const curEffect = effectsFlatSingle[i];

					// 1. Write the current effect ID.
					const remappedId = getRemappedId(curEffect.ID, settings);
					writer.writeUnsigned(remappedId, settings.remappedIdBits);

					// 2. Attempt to RLE-encode the current sequence of effects,
					// if it contains at least 2 items.
					const { maxRun, rleCountBits } = getRleSettings(curEffect.ID);
					let runLen = Math.min(getRunLength(i, effectsFlatSingle), maxRun);
					if (runLen >= 2) {
						writer.writeBool(true);
						// Encoded run-len is counted from 2, since it doesn't make sense to encode 0 or 1 run lengths.
						writer.writeUnsigned(runLen - 2, rleCountBits);
						i += runLen;
					} else {
						writer.writeBool(false);
						i++;
					}
				}

				return true;
			}

			/**
			 * Reads the encoded effects from {@link reader}.
			 * Does not throw.
			 * @param {BitStringReader} reader
			 * @param {number | undefined} requiredTilesCount required amount of tiles.
			 * If not `undefined`, the function returns `undefined` if the amount of tiles encoded
			 * in the reader is different from the required amount.
			 * @returns {ChatRoomMapEffect[][] | undefined}
			 * The flat list of map effects, or `undefined` if {@link reader}
			 * contains invalid data.
			 */
			function read(reader, requiredTilesCount) {
				let readLen = 0;

				/**
				 * @type ChatRoomMapEffect[][]
				 */
				let res = [];
				/**
				 * @type {Map<number, ChatRoomMapEffect>}
				 */
				let effectsCache = new Map();

				try {
					const settings = readDynamicSettings(reader);
					if (
						requiredTilesCount !== undefined &&
						settings.effectsLength !== requiredTilesCount
					) {
						return undefined;
					}

					while (readLen < settings.effectsLength) {
						// 1. Read the current effect ID.
						const remappedId = reader.readUnsigned(settings.remappedIdBits);
						const effectId = getEffectId(remappedId, settings);

						// rww: speeding up effects lookup via a cache until we have a more
						// efficient and generic lookup for effects/tiles/objects.
						/**
						 * @type {ChatRoomMapEffect | undefined}
						 */
						let effect;
						let cachedEffect = effectsCache.get(effectId);
						if (cachedEffect !== undefined) {
							effect = cachedEffect;
						} else {
							if (effectId === ChatRoomMapViewEffectStartID) {
								effect = undefined;
							} else {
								effect = ChatRoomMapViewEffectList.find(
									(e) => e.ID === effectId,
								);
							}
							effectsCache.set(effectId, effect);
						}

						// 2. Read the encoded run-len and calculate the effective on.
						// For non-RLE encoded tile, simply set it to 1.
						const isRle = reader.readBool();
						let runLen;
						if (isRle) {
							const { maxRun: _, rleCountBits } = getRleSettings(effectId);
							runLen = reader.readUnsigned(rleCountBits) + 2; // encoded run-len is counted from 2
						} else {
							runLen = 1;
						}

						// 3. Emit the required amount of tiles.
						for (let i = 0; i < runLen; i++) {
							res.push(effect === undefined ? [] : [effect]);
						}

						readLen += runLen;
					}
				} catch (e) {
					console.warn("Attempt to decode invalid map data:", e);
					return undefined;
				}

				return res;
			}

			return {
				write,
				read,
			};
		})(),
	};

	/**
	 * @type {Record<number, ChatRoomMapManager.MapCodec<MapData>>}
	 */
	const MapDataCodecs = {
		0: (function () {
			const EFFECTS_CODEC_VERSION = 0;

			/**
			 * @param {MapData} map
			 * @param {BitStringWriter} writer
			 * @returns {boolean}
			 */
			function write(map, writer) {
				const effectsCodec = MapEffectsCodecs[EFFECTS_CODEC_VERSION];
				if (effectsCodec === undefined) {
					return false;
				}

				return effectsCodec.write(map.effects, writer);
			}

			/**
			 * @param {BitStringReader} reader
			 * @param {number | undefined} requiredTilesCount
			 * @returns {MapData | undefined}
			 */
			function read(reader, requiredTilesCount) {
				const effectsCodec = MapEffectsCodecs[EFFECTS_CODEC_VERSION];
				if (effectsCodec === undefined) {
					return undefined;
				}
				const effects = effectsCodec.read(reader, requiredTilesCount);
				return new MapData(effects);
			}

			return {
				write,
				read,
			};
		})(),
	};

	const MAP_EXPORT_VERSION_TAG = "@";
	const MAP_SYNC_VERSION_BIT_SIZE = 8;
	const MAP_SYNC_CURRENT_VERSION = 0;
	const CURRENT_EFFECTS_CODEC_VERSION = 0;

	/**
	 * Decodes the string that was generated with the `/mapcopy` command.
	 * Should support every map that was generated on any prior version.
	 * @param {string} s
	 * @returns {{LegacyMapData: ServerChatRoomMapData | undefined, MapData: MapData | undefined}} the decoded map data.
	 * Both `LegacyMapData` and `Map` fields being `undefined` indicates a decoding failure.
	 */
	function DecodeExportedMap(s) {
		const versionTagIdx = s.indexOf(MAP_EXPORT_VERSION_TAG);

		if (versionTagIdx < 0) {
			// Legacy exported map without effects.
			return decodeLegacyExportedMap(s);
		}

		if (versionTagIdx > 0) {
			// Combined exported map, both tiles/objects and effects in one string,
			// with the former encoded in the legacy way.
			return decodeCombinedExportedMap(s, versionTagIdx);
		}

		if (versionTagIdx === 0) {
			// Fully BitString-encoded map data. Currently not implemented.
			return decodeModernExportedMap(s);
		}

		console.warn("Impossible exported map string value");
		return {
			LegacyMapData: undefined,
			MapData: undefined,
		};
	}

	/**
	 * Decodes the exported map string made by clients prior to the Effects update.
	 * @param {string} s
	 * @returns {{LegacyMapData: ServerChatRoomMapData | undefined, MapData: undefined}} the decoded map data.
	 */
	function decodeLegacyExportedMap(s) {
		/**
		 * @param {unknown} type
		 * @returns {type is ChatRoomMapType}
		 */
		function isMapType(type) {
			return type === "Always" || type === "Hybrid" || type === "Never";
		}

		// Try to decompress the data
		let DecompressedData = null;
		try {
			DecompressedData = decompressFromBase64(s);
		} catch {
			DecompressedData = null;
		}

		const err = {
			LegacyMapData: undefined,
			MapData: undefined,
		};

		// If we failed to decompress
		if (DecompressedData === null) {
			return err;
		}

		// Tries to get the map data object
		/** @type {ServerChatRoomMapData} */
		let mapData = null;
		try {
			const data = JSON.parse(DecompressedData);
			if (
				!CommonIsObject(data) ||
				!("Tiles" in data) ||
				typeof data.Tiles !== "string" ||
				!("Type" in data) ||
				!isMapType(data.Type)
			) {
				return err;
			}
			mapData = /** @type {ServerChatRoomMapData} */ (data);
		} catch {
			return err;
		}

		return {
			LegacyMapData: mapData,
			MapData: undefined,
		};
	}

	/**
	 * Decodes the exported map string with both legacy and effects data.
	 * The legacy and effects parts are delimited with the version tag character (@).
	 * Due to how `LZString` library works, it doesn't read the base64-like string it
	 * consumes as the input past the end of compressed data, which means it completely
	 * ignores anything we append to the result of `LZString.compressToBase64`.
	 * Base64 alphabet doesn't contain the version tag character (@), so we won't have any
	 * 'false positives' either.
	 *
	 * This means we can just append the encoded effects and their version after the version tag,
	 * allowing the old versions to read the map data exported in new ones.
	 * @param {string} s
	 * @param {number} versionTagIdx the index of version tag character (@) in {@link s}.
	 * @returns {{LegacyMapData: ServerChatRoomMapData | undefined, MapData: MapData | undefined}} the decoded map data.
	 */
	function decodeCombinedExportedMap(s, versionTagIdx) {
		const legacyPart = s.slice(0, versionTagIdx);
		const effectsPart = s.slice(versionTagIdx);

		const legacyMap = decodeLegacyExportedMap(legacyPart);
		if (legacyMap.LegacyMapData === undefined) {
			// The legacy map data is invalid, so we don't need to bother decoding the
			// effects either. We won't get a proper map anyway.
			return legacyMap;
		}

		const modernMap = decodeModernExportedMap(effectsPart);
		return {
			LegacyMapData: legacyMap.LegacyMapData,
			MapData: modernMap.MapData,
		};
	}

	/**
	 * Decodes the base64-encoded {@link MapData}.
	 * @param {string} s the exported map string. Must start with the version tag character (@).
	 * @returns {{LegacyMapData: ServerChatRoomMapData | undefined, MapData: MapData | undefined}} the decoded map data.
	 */
	function decodeModernExportedMap(s) {
		const err = {
			LegacyMapData: undefined,
			MapData: undefined,
		};

		if (s[0] !== MAP_EXPORT_VERSION_TAG) {
			console.warn(
				"Invalid modern exported map: missing MAP_EXPORT_VERSION_TAG in the beginning.",
			);
			return err;
		}

		try {
			const reader = BitStringReader.fromBase64(s.slice(1)); // skipping @
			if (reader === undefined) {
				console.error(
					"Error decoding modern exported map; invalid encoded string",
				);
				return err;
			}
			const version = reader.readUnsigned(MAP_SYNC_VERSION_BIT_SIZE);
			const codec = MapDataCodecs[version];
			if (codec === undefined) {
				console.error(
					"Error decoding modern exported map; unknown version",
					version,
				);
				return err;
			}

			const tilesCount = ChatRoomMapViewWidth * ChatRoomMapViewHeight;
			const map = codec.read(reader, tilesCount);
			return {
				LegacyMapData: undefined,
				MapData: map,
			};
		} catch (e) {
			console.warn("Error decoding modern exported map:", e);
			return err;
		}
	}

	/**
	 * Exports the current map data into a string the player can save.
	 * Currently, the function requires both the legacy map data and the MapData instance
	 * holding the effects.
	 * @param {{LegacyMapData: ServerChatRoomMapData | undefined, MapData: MapData | undefined}} mapData
	 * @returns {string | undefined}
	 */
	function ExportMap(mapData) {
		const { LegacyMapData: legacyMap, MapData: map } = mapData;

		let legacyEncoded;
		if (legacyMap !== undefined) {
			// Remove the effects from the legacy map data. They would be encoded later to avoid
			// compressing/encoding them multiple times since they're already encoded in the ServerChatRoomMapData
			// object.
			const { Effects: _, ...legacyMapFiltered } = legacyMap;
			legacyEncoded = compressToBase64(
				JSON.stringify(legacyMapFiltered),
			);
		} else {
			legacyEncoded = "";
		}

		if (map !== undefined) {
			const codec = MapDataCodecs[MAP_SYNC_CURRENT_VERSION];
			const writer = new BitStringWriter();
			writer.writeUnsigned(
				MAP_SYNC_CURRENT_VERSION,
				MAP_SYNC_VERSION_BIT_SIZE,
			);
			if (!codec.write(map, writer)) {
				console.warn("Failed to encode MapData into the BitString");
				return undefined;
			}

			return `${legacyEncoded}${MAP_EXPORT_VERSION_TAG}${writer.toBase64()}`;
		} else {
			// No MapData, simply return the legacy encoded string
			return legacyEncoded;
		}
	}

	/**
	 * Flags indicating which parts of the current map data are dirty and
	 * need to be synchronized with the server.
	 */
	const DirtyFlags = Object.freeze({
		EFFECTS: 1 << 1,
		TILES: 1 << 2,
		OBJECTS: 1 << 3,

		/**
		 * @param {number} n
		 * @param {number} flag
		 * @return {boolean}
		 */
		hasFlag(n, flag) {
			return (n & flag) === flag;
		},

		/**
		 * @param {number} n
		 * @param {number} flag
		 * @return {number}
		 */
		setFlag(n, flag) {
			return n | flag;
		},

		/**
		 * @param {number} n
		 * @param {number} flag
		 * @return {number}
		 */
		clearFlag(n, flag) {
			return n & ~flag;
		},

		/**
		 * Returns a number with all valid dirty flags enabled.
		 * @return {number}
		 */
		all() {
			return DirtyFlags.EFFECTS | DirtyFlags.OBJECTS | DirtyFlags.TILES;
		},
	});

	/**
	 * The class holding the map data and responsible for keeping it synchronized with the outside
	 * global state, notably, ChatRoomData.MapData.
	 */
	class MapManager {
		/**
		 * @param {MapData} mapData
		 */
		constructor(mapData) {
			/**
			 * @type {MapData}
			 * @private
			 */
			this._mapData = mapData;
			/**
			 * @type {number}
			 * @private
			 */
			this._dirtyFlags = 0;
		}

		/**
		 * Get the current active effects array at a given coordinates.
		 * @param {number} x
		 * @param {number} y
		 * @returns {ChatRoomMapEffect[]}
		 */
		getEffectsByXY(x, y) {
			return this.getEffectsByIndex(ChatRoomMapViewCoordinatesToIndex(x, y));
		}

		/**
		 * Get the current active effects array at a given tile index.
		 * @param {number} tileIndex the index of a map tile, as returned by ChatRoomMapViewCoordinatesToIndex.
		 * @returns {ChatRoomMapEffect[]}
		 */
		getEffectsByIndex(tileIndex) {
			return this._mapData.effects[tileIndex];
		}

		/**
		 * Sets the list of active effects at given coordinates.
		 * @param {number} x
		 * @param {number} y
		 * @param {ChatRoomMapEffect[]} effects
		 * @returns {void}
		 */
		setEffectsByXY(x, y, effects) {
			this.markDirtyEffects();
			this.setEffectsByIndex(ChatRoomMapViewCoordinatesToIndex(x, y), effects);
		}

		/**
		 * Sets the list of active effects at a given tile index.
		 * @param {number} tileIndex
		 * @param {ChatRoomMapEffect[]} effects
		 * @returns {void}
		 */
		setEffectsByIndex(tileIndex, effects) {
			this.markDirtyEffects();
			this._mapData.effects[tileIndex] = [...effects];
		}

		/**
		 * Clears the list of active effects at given coordinates.
		 * @param {number} x
		 * @param {number} y
		 * @returns {void}
		 */
		clearEffectsByXY(x, y) {
			this.markDirtyEffects();
			this.setEffectsByXY(x, y, []);
		}

		/**
		 * Clears the list of active effects at a given tile index.
		 * @param {number} tileIndex
		 * @returns {void}
		 */
		clearEffectsByIndex(tileIndex) {
			this.markDirtyEffects();
			this.setEffectsByIndex(tileIndex, []);
		}

		/**
		 * Returns the effects list for each tile in the map, one array element per tile.
		 * Currently for efficiency does not copy the underlying array.
		 * The users must not modify the returned array directly.
		 * @return {ChatRoomMapEffect[][]}
		 */
		getAllEffects() {
			return this._mapData.effects;
		}

		/**
		 * Replaces all current effects with the parsed effects array.
		 * For efficiency does not copy the passed effects.
		 * The users must not modify the passed effects array afterward.
		 * @param {ChatRoomMapEffect[][]} effectsList
		 * @returns {void}
		 */
		replaceAllEffects(effectsList) {
			this.markDirtyEffects();
			this._mapData.effects = effectsList;
		}

		/**
		 * Removes all effects from the map.
		 * @returns {void}
		 */
		removeAllEffects() {
			this._mapData.removeAllEffects();
		}

		/**
		 * Mark a specific part of the map data as dirty, that is, changed and not yet synchronized with the server.
		 * @param {number} flag
		 * @private
		 */
		_markDirty(flag) {
			this._dirtyFlags = DirtyFlags.setFlag(this._dirtyFlags, flag);
		}

		/**
		 * Marks a specific part of the map data as clean, that is, synchronized with the server.
		 * @returns {void}
		 */
		_markClean(flag) {
			this._dirtyFlags = DirtyFlags.clearFlag(this._dirtyFlags, flag);
		}

		/**
		 * Marks the current effects data as dirty, that is, changed and not yet synchronized with the server.
		 * @returns {void}
		 */
		markDirtyEffects() {
			this._markDirty(DirtyFlags.EFFECTS);
		}

		/**
		 * Marks the current effects data as clean, that is, synchronized with the server.
		 * @returns {void}
		 */
		markCleanEffects() {
			this._markClean(DirtyFlags.EFFECTS);
		}

		/**
		 * Checks whether the current effects data is dirty, that is, whether it needs
		 * to be synchronized with the server.
		 * @returns {boolean}
		 */
		isDirtyEffects() {
			return DirtyFlags.hasFlag(this._dirtyFlags, DirtyFlags.EFFECTS);
		}

		/**
		 * Marks the current tiles data as dirty, that is, changed and not yet synchronized with the server.
		 * @returns {void}
		 */
		markDirtyTiles() {
			this._markDirty(DirtyFlags.TILES);
		}

		/**
		 * Marks the current tiles data as clean, that is, synchronized with the server.
		 * @returns {void}
		 */
		markCleanTiles() {
			this._markClean(DirtyFlags.TILES);
		}

		/**
		 * Checks whether the current tiles data is dirty, that is, whether it needs
		 * to be synchronized with the server.
		 * @returns {boolean}
		 */
		isDirtyTiles() {
			return DirtyFlags.hasFlag(this._dirtyFlags, DirtyFlags.TILES);
		}

		/**
		 * Marks the current objects data as dirty, that is, changed and not yet synchronized with the server.
		 * @returns {void}
		 */
		markDirtyObjects() {
			this._markDirty(DirtyFlags.OBJECTS);
		}

		/**
		 * Marks the current objects data as clean, that is, synchronized with the server.
		 * @returns {void}
		 */
		markCleanObjects() {
			this._markClean(DirtyFlags.OBJECTS);
		}

		/**
		 * Checks whether the current objects data is dirty, that is, whether it needs
		 * to be synchronized with the server.
		 * @returns {boolean}
		 */
		isDirtyObjects() {
			return DirtyFlags.hasFlag(this._dirtyFlags, DirtyFlags.OBJECTS);
		}

		/**
		 * Mark all data in the current map as clean.
		 * @returns {void}
		 */
		markCleanAll() {
			this._dirtyFlags = 0;
		}

		/**
		 * Exports the current map data, including the tiles/objects,
		 * as a string that could be copied and stored by the players.
		 * @returns {string | undefined} the exported string, or `undefined`
		 * if there was an error while exporting the map.
		 * 
		 * @param {ServerChatRoomMapData} mapData
		 */
		exportString(mapData) {
			LocalMapData = mapData;
			this.loadGlobalMapData()
			return ExportMap({
				LegacyMapData: LocalMapData,
				MapData: this._mapData,
			});
		}

		/**
		 * Imports the map string that was exported earlier with {@link MapManager.exportString}
		 * method.
		 *
		 * This method must be as much compatible as possible, recovering as much information
		 * as possible from the exported map strings from any previous version of the game
		 * to prevent the players losing their stored maps.
		 *
		 * This method modifies the state of the current map and returns `true` in case of a successful import.
		 * If the string is malformed and cannot be parsed, the method returns `false` and doesn't modify
		 * any state.
		 * @param {string} mapString
		 * @returns {ServerChatRoomMapData | null} `true` if the string was successfully parsed and the current map data is updated,
		 * `false` otherwise
		 */
		importString(mapString) {
            LocalMapData = null;
			const mapData = DecodeExportedMap(mapString);
			// No data was decoded
			if (
				mapData.LegacyMapData === undefined &&
				mapData.MapData === undefined
			) {
				return null;
			}

			if (mapData.LegacyMapData !== undefined) {
				LocalMapData = mapData.LegacyMapData;
				this.markDirtyTiles();
				this.markDirtyObjects();
			}

			if (mapData.MapData !== undefined) {
				this._mapData = mapData.MapData;
				this.updateGlobalMapData();  // Write the modern map data to global object
				this.markDirtyEffects();
			}

			return LocalMapData;
		}

		/**
		 * Encodes the current map data and updates the global {@link ChatRoomData.MapData} value.
		 * This function must be called after the map was changed and before it is sent to the server.
		 * Ideally we want to have a single function to build the encoded map data only
		 * when required, but it would require a significant API change of the outside code.
		 *
		 * For places where the synchronization happens, see {@link ChatRoomGetSettings} usages.
		 *
		 * This function is not supposed to fail; if it indicates an error by returning `false`,
		 * this means we have a bug in our code.
		 * @return {boolean} `true` if we successfully encoded the map data; `false` if
		 * there was an error and the global state remains unchanged.
		 */
		updateGlobalMapData() {
			const newEffects = this._encodeEffects();
			if (newEffects === undefined) {
				return false;
			}
			if (newEffects === LocalMapData.Effects) {
				return true;
			}
			LocalMapData.Effects = newEffects;
			this.markDirtyEffects(); // The effects have changed
			return true;
		}

		/**
		 * Loads the data from {@link ChatRoomData.MapData} and replaces the current map data with the one
		 * stored in it.
		 * @return {boolean} `true` if the global map data was parsed successfully. `false` if
		 * the global map data is invalid, no data is changed in this case.
		 */
		loadGlobalMapData() {
			if (LocalMapData.Effects === undefined) {
				this.removeAllEffects();
				this.markCleanAll();
				return true;
			}
			const newEffects = this._decodeEffects(LocalMapData.Effects);
			if (newEffects === undefined) {
				return false;
			}
			this.replaceAllEffects(newEffects);
			this.markCleanAll();
			return true;
		}

		/**
		 * @returns {string | undefined}
		 * @private
		 */
		_encodeEffects() {
			const codec = MapEffectsCodecs[CURRENT_EFFECTS_CODEC_VERSION];
			const writer = new BitStringWriter();

			writer.writeUnsigned(
				CURRENT_EFFECTS_CODEC_VERSION,
				MAP_SYNC_VERSION_BIT_SIZE,
			);
			if (!codec.write(this.getAllEffects(), writer)) {
				console.error(
					"MapManager._encodeEffects(): failed to encode map effects: write failed.",
				);
				return undefined;
			}

			return writer.toBase64();
		}

		/**
		 * @param {string | undefined} str
		 * @returns {ChatRoomMapEffect[][] | undefined}
		 * @private
		 */
		_decodeEffects(str) {
			if (str === undefined) {
				return undefined;
			}

			const reader = BitStringReader.fromBase64(str);
			if (reader === undefined) {
				console.error(
					"MapManager._decodeEffects(): failed to decode map effects: invalid encoded string",
				);
				return undefined;
			}

			try {
				const version = reader.readUnsigned(MAP_SYNC_VERSION_BIT_SIZE);
				const codec = MapEffectsCodecs[version];
				if (codec === undefined) {
					console.error(
						`MapManager._decodeEffects(): failed to decode map effects: unknown effects version ${version}`,
					);
					return undefined;
				}

				const tilesCount = ChatRoomMapViewWidth * ChatRoomMapViewHeight;
				const effects = codec.read(reader, tilesCount);
				if (effects === undefined) {
					console.error(
						`MapManager._decodeEffects(): failed to decode map effects (v. ${version}): failed to read effects.`,
					);
					return undefined;
				}
				return effects;
			} catch (e) {
				console.error(
					`MapManager._decodeEffects(): failed to decode map effects: decoding error: ${e}`,
				);
				return undefined;
			}
		}
	}

	let initialized = false;

	return {
		Map: new MapManager(new MapData()),

		/**
		 * This function should be called each time the external code updates {@link ChatRoomData.MapData}.
		 *
		 * This function decodes the updated map data and replaces
		 * the data stored in ${@link ChatRoomMapManager.Map} with the decoded map.
		 * @returns {void}
		 */
		OnMapDataUpdated() {
			ChatRoomMapManager.Map.loadGlobalMapData();
		},

		/**
		 * Initializes the map with the current global data if needed.
		 * Must be called in {@link ChatRoomMapViewActivate}.
		 * @returns {void}
		 */
		OnViewActivate() {
			if (!initialized) {
				ChatRoomMapManager.Map.loadGlobalMapData();
				initialized = true;
			}
		},
	};
})();
