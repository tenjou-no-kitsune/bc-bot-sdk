// Scripts/Common.js

// Main variables
"use strict";
/** @type {PlayerCharacter} */
var Player;
/** @type {ModuleType} */
var CurrentModule;
/** @type {ModuleScreens[CurrentModule]} */
var CurrentScreen;
/** @type {ScreenFunctions} */
var CurrentScreenFunctions;
/** @type {Character|NPCCharacter|null} */
var CurrentCharacter = null;
var CurrentOnlinePlayers = 0;
/**
 * A per-screen ratio of how darkened the background must be
 *
 * 1 is bright, 0 is pitch black
 */
var CurrentDarkFactor = 1.0;
var CommonIsMobile = false;
/** @type {Record<string, string[][]>} */
var CommonCSVCache = {};
var CutsceneStage = 0;
var CommonPhotoMode = false;

/**
 * An enum encapsulating possible chatroom message substitution tags. Character name substitution tags are interpreted
 * in chatrooms as follows (assuming the character name is Ben987):
 * SOURCE_CHAR: "Ben987"
 * DEST_CHAR: "Ben987's" (if character is not self), "her" (if character is self)
 * DEST_CHAR_NAME: "Ben987's"
 * TARGET_CHAR: "Ben987" (if character is not self), "herself" (if character is self)
 * TARGET_CHAR_NAME: "Ben987"
 * Additionally, sending the following tags will ensure that asset names in messages are correctly translated by
 * recipients:
 * ASSET_NAME: (substituted with the localized name of the asset, if available)
 * @type {Record<"SOURCE_CHAR"|"DEST_CHAR"|"DEST_CHAR_NAME"|"TARGET_CHAR"|"TARGET_CHAR_NAME"|"ASSET_NAME"|"AUTOMATIC", CommonChatTags>}
 */
const CommonChatTags = {
	SOURCE_CHAR: "SourceCharacter",
	DEST_CHAR: "DestinationCharacter",
	DEST_CHAR_NAME: "DestinationCharacterName",
	TARGET_CHAR: "TargetCharacter",
	TARGET_CHAR_NAME: "TargetCharacterName",
	ASSET_NAME: "AssetName",
	AUTOMATIC: "Automatic",
};

/** @type {(this: string, index: number, character: string) => string} */
String.prototype.replaceAt=function(index, character) {
	return this.substr(0, index) + character + this.substr(index+character.length);
};

/**
 * A map of keys to common font stack definitions. Each stack definition is a
 * two-item array whose first item is an ordered list of fonts, and whose
 * second item is the generic fallback font family (e.g. sans-serif, serif,
 * etc.)
 * @constant
 * @type {Record<String, [String[], String]>}
 */
const CommonFontStacks = {
	Arial: [["Arial"], "sans-serif"],
	TimesNewRoman: [["Times New Roman", "Times"], "serif"],
	Papyrus: [["Papyrus", "Ink Free", "Segoe Script", "Gabriola"], "fantasy"],
	ComicSans: [["Comic Sans MS", "Comic Sans", "Brush Script MT", "Segoe Print"], "cursive"],
	Impact: [["Impact", "Arial Black", "Franklin Gothic", "Arial"], "sans-serif"],
	HelveticaNeue: [["Helvetica Neue", "Helvetica", "Arial"], "sans-serif"],
	Verdana: [["Verdana", "Helvetica Neue", "Arial"], "sans-serif"],
	CenturyGothic: [["Century Gothic", "Apple Gothic", "AppleGothic", "Futura"], "sans-serif"],
	Georgia: [["Georgia", "Times"], "serif"],
	CourierNew: [["Courier New", "Courier"], "monospace"],
	Copperplate: [["Copperplate", "Copperplate Gothic Light"], "fantasy"],
};

function CommonPrefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Checks if a variable is a number
 * @param {any} n - Variable to check for
 * @returns {n is number} - Returns TRUE if the variable is a finite number
 */
function CommonIsNumeric(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * Gets the current time as a string
 * @returns {string} - Returns the current date and time in a yyyy-mm-dd hh:mm:ss format
 */
function CommonGetFormatDate() {
	var d = new Date();
	var yyyy = d.getFullYear();
	var mm = d.getMonth() < 9 ? "0" + (d.getMonth() + 1) : (d.getMonth() + 1); // getMonth() is zero-based
	var dd = d.getDate() < 10 ? "0" + d.getDate() : d.getDate();
	var hh = d.getHours() < 10 ? "0" + d.getHours() : d.getHours();
	var min = d.getMinutes() < 10 ? "0" + d.getMinutes() : d.getMinutes();
	var ss = d.getSeconds() < 10 ? "0" + d.getSeconds() : d.getSeconds();
	return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Detects if the user is on a mobile browser
 * @returns {boolean} - Returns TRUE if the user is on a mobile browser
 */
function CommonDetectMobile() {

	// First check
	var mobile = ['iphone', 'ipad', 'android', 'blackberry', 'nokia', 'opera mini', 'windows mobile', 'windows phone', 'iemobile', 'mobile/', 'webos', 'kindle'];
	for (let i in mobile) if (navigator.userAgent.toLowerCase().indexOf(mobile[i].toLowerCase()) > 0) return true;

	// IPad pro check
	if (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform)) return true;

	// Second check
	if (sessionStorage.desktop) return false;
	else if (localStorage.mobile) return true;

	// If nothing is found, we assume desktop
	return false;

}

/**
 * Gets the current browser name and version
 * @returns {{Name: string, Version: string}} - Browser info
 */
function CommonGetBrowser() {
	var ua = navigator.userAgent, tem, M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
	if (/trident/i.test(M[1])) {
		tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
		return { Name: "IE", Version: (tem[1] || "N/A") };
	}
	if (M[1] === 'Chrome') {
		tem = ua.match(/\bOPR|Edge\/(\d+)/);
		if (tem != null) return { Name: "Opera", Version: tem[1] || "N/A" };
	}
	M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
	if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1]);
	return { Name: M[0] || "N/A", Version: M[1] || "N/A" };
}

/**
 * Parses a string into an integer
 * @param {string} val The string to parse into a number
 * @param {null | number} radix A value between 2 and 36 that specifies the base of the number in the string. Defaults to 10 if not provided
 * @returns {number | null}
 */
function CommonParseInt(val, radix=null) {
	const num = parseInt(val, radix ?? 10);
	if (isNaN(num))
		return null;
	return num;
}

/**
 * Parse a CSV file content into an array
 * @param {string} str - Content of the CSV
 * @returns {string[][]} Array representing each line of the parsed content, each line itself is split by commands and stored within an array.
 */
function CommonParseCSV(str) {
	/** @type {string[][]} */
	var arr = [];
	var quote = false;  // true means we're inside a quoted field
	var c;
	var col;
	// We remove whitespace on start and end
	str = str.replace(/\r\n/g, '\n').trim();

	// iterate over each character, keep track of current row and column (of the returned array)
	for (let row = col = c = 0; c < str.length; c++) {
		var cc = str[c], nc = str[c + 1];        // current character, next character
		arr[row] = arr[row] || [];             // create a new row if necessary
		arr[row][col] = arr[row][col] || '';   // create a new column (start with empty string) if necessary

		// If the current character is a quotation mark, and we're inside a
		// quoted field, and the next character is also a quotation mark,
		// add a quotation mark to the current column and skip the next character
		if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }

		// If it's just one quotation mark, begin/end quoted field
		if (cc == '"') { quote = !quote; continue; }

		// If it's a comma and we're not in a quoted field, move on to the next column
		if (cc == ',' && !quote) { ++col; continue; }

		// If it's a newline and we're not in a quoted field, move on to the next
		// row and move to column 0 of that new row
		if (cc == '\n' && !quote) { ++row; col = 0; continue; }

		// Otherwise, append the current character to the current column
		arr[row][col] += cc;
	}
	return arr;
}

/**
 * Read a CSV file from the server
 *
 * If the file has been cached already it'll use that.
 *
 * @warning Note that due to the way fetching is async, the
 * array you'll get back won't be populated until the fetch completes
 *
 * @param {string} url - URL to load
 * @returns {string[][]}
 */
function CommonReadCSV(url) {
	if (CommonCSVCache[url]) {
		return CommonCSVCache[url];
	}

	/** @type {string[][]} */
	const temp = CommonCSVCache[url] = [];

	// Opens the file, parse it and returns the result in an Object
	CommonGet(url, function () {
		if (this.status == 200) {
			const parsed = CommonParseCSV(this.responseText);
			temp.push(...parsed);
		}
	});

	// If a translation file is available, we open the txt file and keep it in cache
	const TranslationPath = url.replace(".csv", "_" + TranslationLanguage + ".txt");
	if (TranslationAvailable(TranslationPath))
		CommonGet(TranslationPath, function () {
			if (this.status == 200) TranslationCache[TranslationPath] = TranslationParseTXT(this.responseText);
		});

	return temp;
}


/**
 * Sleep for a number of milliseconds
 * @param {number} ms
 * @returns {Promise<number>}
 */
async function CommonSleep(ms) {
	return new Promise(resolve => window.setTimeout(resolve, ms));
}

/**
 *
 * @param {() => boolean} func
 * @param {() => boolean} [cancelFunc]
 * @returns
 */
async function CommonWaitFor(func, cancelFunc = () => false) {
	while (!func()) {
		if (cancelFunc()) {
			return false;
		}
		await CommonSleep(10);
	}
	return true;
}

/**
 * How many times do we retry a resource fetch.
 */
const FETCH_MAX_RETRIES = 10;

/**
 * How much to wait max between each attempt.
 */
const FETCH_MAX_RETRY_BACKOFF_TIME = 16;

/**
 * Fetch a remote resource
 *
 * @param {RequestInfo | URL} request
 * @returns {Promise<Response>}
 */
async function CommonFetch(request) {
	let retries = FETCH_MAX_RETRIES;
	const method = request instanceof Request ? request.method : "GET";
	const url = request instanceof Request ? request.url : request;
	let reply = await fetch(request);
	while (retries-- > 0) {
		if (reply.status >= 400) {
			const retrySeconds = Math.min(Math.pow(2, Math.max(0, FETCH_MAX_RETRIES - retries)), FETCH_MAX_RETRY_BACKOFF_TIME);
			console.warn(`${method} request to ${url} failed - retrying in ${retrySeconds} second${retrySeconds === 1 ? "" : "s"}...`);
			await CommonSleep(retrySeconds * 1000);
			reply = await fetch(request);
			continue;
		}
		break;
	}
	if (retries <= 0) {
		console.error(`${method} request to ${url} failed - no more retries`);
	}
	return reply;
}

/**
 * AJAX utility to get a file and return its content. By default will retry requests 10 times
 * @param {string} Path - Path of the resource to request
 * @param {(this: XMLHttpRequest, xhr: XMLHttpRequest) => void} Callback - Callback to execute once the resource is received
 * @param {number} [RetriesLeft] - How many more times to retry if the request fails - after this hits zero, an error will be logged
 * @returns {void} - Nothing
 */
function CommonGet(Path, Callback, RetriesLeft) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", Path);
	xhr.onloadend = function() {
		// For non-error responses, call the callback
		if (this.status < 400) Callback.bind(this)(xhr);
		// Otherwise, retry
		else CommonGetRetry(Path, Callback, RetriesLeft);
	};
	xhr.onerror = function() { CommonGetRetry(Path, Callback, RetriesLeft); };
	xhr.send(null);
}

/**
 * Retry handler for CommonGet requests. Exponentially backs off retry attempts up to a limit of 1 minute. By default,
 * retries up to a maximum of 10 times.
 * @param {string} Path - The path of the resource to request
 * @param {(this: XMLHttpRequest, xhr: XMLHttpRequest) => void} Callback - Callback to execute once the resource is received
 * @param {number} [RetriesLeft] - How many more times to retry - after this hits zero, an error will be logged
 * @returns {void} - Nothing
 */
function CommonGetRetry(Path, Callback, RetriesLeft) {
	if (typeof RetriesLeft !== "number") RetriesLeft = FETCH_MAX_RETRIES;
	if (RetriesLeft <= 0) {
		console.error(`GET request to ${Path} failed - no more retries`);
	} else {
		const retrySeconds = Math.min(Math.pow(2, Math.max(0, FETCH_MAX_RETRIES - RetriesLeft)), FETCH_MAX_RETRY_BACKOFF_TIME);
		console.warn(`GET request to ${Path} failed - retrying in ${retrySeconds} second${retrySeconds === 1 ? "" : "s"}...`);
		setTimeout(() => CommonGet(Path, Callback, RetriesLeft - 1), retrySeconds * 1000);
	}
}

/** @type {MouseEventListener} */
function CommonMouseDown(event) {
	if (CurrentCharacter == null) {
		if (ScreenIsLoading) return;
		if (CurrentScreenFunctions.MouseDown) {
			CurrentScreenFunctions.MouseDown(event);
		}
	} else {
		DialogMouseDown(event);
	}
}

/** @type {MouseEventListener} */
function CommonMouseUp(event) {
	if (ScreenIsLoading) return;
	if (CurrentScreenFunctions.MouseUp)
	{
		CurrentScreenFunctions.MouseUp(event);
	}
}

/** @type {MouseEventListener} */
function CommonMouseMove(event) {
	if (ScreenIsLoading) return;
	if (CurrentScreenFunctions.MouseMove)
	{
		CurrentScreenFunctions.MouseMove(event);
	}
}

/** @type {MouseWheelEventListener} */
function CommonMouseWheel(event) {
	if (ScreenIsLoading) return;
	if (CurrentScreenFunctions.MouseWheel) {
		CurrentScreenFunctions.MouseWheel(event);
	}
}

/** @type {ScreenResizeHandler} */
function CommonResize(load) {
	if (CurrentScreenFunctions.Resize) {
		CurrentScreenFunctions.Resize(load);
	}
}

/**
 * Catches the clicks on the main screen and forwards it to the current screen click function if it exists, otherwise it sends it to the dialog click function
 * @type {MouseEventListener}
 */
function CommonClick(event) {
	if (CurrentCharacter == null)
		CurrentScreenFunctions.Click(event);
	else
		DialogClick(event);
}

/**
 * Returns TRUE if a section of the screen is currently touched on a mobile device
 * @param {number} X - The X position
 * @param {number} Y - The Y position
 * @param {number} W - The width of the square
 * @param {number} H - The height of the square
 * @param {null | TouchList} [TL] - Can give a specific touch event instead of the default one
 * @returns {boolean}
 */
function CommonTouchActive(X, Y, W, H, TL=null) {
	if (!CommonIsMobile) return false;
	if (TL == null) TL = CommonTouchList;
	if (TL == null) return false;
	for (let index = 0; index < TL.length; index++) {
		const Touch = TL[index];
		let TouchX = Math.round((Touch.pageX - MainCanvas.canvas.offsetLeft) * 2000 / MainCanvas.canvas.clientWidth);
		let TouchY = Math.round((Touch.pageY - MainCanvas.canvas.offsetTop) * 1000 / MainCanvas.canvas.clientHeight);
		if ((TouchX >= X) && (TouchX <= X + W) && (TouchY >= Y) && (TouchY <= Y + H))
			return true;
	}
	return false;
}

/**
 * Calls a basic dynamic function if it exists, for complex functions, use: CommonDynamicFunctionParams
 * @param {string} FunctionName - Name of the function to call
 * @returns {void} - Nothing
 */
function CommonDynamicFunction(FunctionName) {
	/** @type {Record<string, any>} */
	const namespace = window;
	const func = namespace[FunctionName.substr(0, FunctionName.indexOf("("))];
	if (typeof func === "function")
		func();
	else
		console.log("Trying to launch invalid function: " + FunctionName);
}


/**
 * Calls a dynamic function with parameters (if it exists), also allow ! in front to reverse the result. The dynamic function is the provided function name in the dialog option object and it is prefixed by the current screen.
 * @param {string} FunctionName - Function name to call dynamically
 * @returns {unknown | boolean} - Returns what the dynamic function returns or FALSE if the function does not exist
 */
function CommonDynamicFunctionParams(FunctionName) {

	// Gets the reverse (!) sign
	var Reverse = false;
	if (FunctionName.substring(0, 1) == "!") Reverse = true;
	FunctionName = FunctionName.replace("!", "");

	// Gets the real function name and parameters
	var openParenthesisIndex = FunctionName.indexOf("(");
	var closedParenthesisIndex = FunctionName.indexOf(")", openParenthesisIndex);
	var ParamsString = FunctionName.substring(openParenthesisIndex + 1, closedParenthesisIndex);
	var Params = ParamsString.length === 0 ? [] : ParamsString.split(",");
	for (let P = 0; P < Params.length; P++)
		Params[P] = Params[P].trim().replace('"', '').replace('"', '');
	FunctionName = FunctionName.substring(0, openParenthesisIndex);
	if ((FunctionName.indexOf("Dialog") != 0) && (FunctionName.indexOf("Inventory") != 0) && (FunctionName.indexOf(CurrentScreen) != 0)) FunctionName = CurrentScreen + FunctionName;

	// If it's really a function, we continue
	/** @type {Record<string, any>} */
	const namespace = window;
	const func = namespace[FunctionName];
	if (typeof func === "function") {

		// Launches the function with the params and returns the result
		var Result = func(...Params);
		return Reverse ? !Result : Result;
	} else {

		// Log the error in the console
		console.log("Trying to launch invalid function: " + FunctionName);
		return false;
	}
}


/**
 *  Calls a named global function with the passed in arguments, if the named function exists. Differs from
 *  CommonDynamicFunctionParams in that arguments are not parsed from the passed in FunctionName string, but
 *  passed directly into the function call, allowing for more complex JS objects to be passed in. This
 *  function will not log to console if the provided function name does not exist as a global function.
 * @param {string} FunctionName - The name of the global function to call
 * @param {readonly any[]} args - zero or more arguments to be passed to the function (optional)
 * @returns {any} - returns the result of the function call, or undefined if the function name isn't valid
 */
function CommonCallFunctionByName(FunctionName, ...args) {
	/** @type {Record<string, any>} */
	const namespace = window;
	const func = namespace[FunctionName];
	if (typeof func === "function") {
		return func(...args);
	}
}

/**
 * Behaves exactly like CommonCallFunctionByName, but logs a warning if the function name is invalid.
 * @param {string} FunctionName - The name of the global function to call
 * @param {readonly any[]} args - zero or more arguments to be passed to the function (optional)
 * @returns {any} - returns the result of the function call, or undefined if the function name isn't valid
 */
function CommonCallFunctionByNameWarn(FunctionName, ...args) {
	/** @type {Record<string, any>} */
	const namespace = window;
	const func = namespace[FunctionName];
	if (typeof func === "function") {
		return func(...args);
	} else {
		console.warn(`Attempted to call invalid function "${FunctionName}"`);
	}
}

/**
 * Get the current screen
 * @returns {ScreenSpecifier}
 */
function CommonGetScreen() {
	return /** @type {ScreenSpecifier} */([CurrentModule, CurrentScreen]);
}

var ScreenIsLoading = false;

/**
 * Sets the current screen and calls the loading script if needed
 * @param {ScreenSpecifier} spec
 * @returns {Promise<void>} - Nothing
 */
async function CommonSetScreen(...spec) {
	const { recursive } = spec[2] ?? {};
	if (CurrentScreenFunctions && CurrentScreenFunctions.Unload) {
		CurrentScreenFunctions.Unload();
	}
	if (ControllerIsActive()) {
		ControllerClearAreas();
	}


	const [NewModule, NewScreen] = spec;
	const [OldModule, OldScreen] = [CurrentModule, CurrentScreen];
	// Check for required functions
	/** @type {Record<string, any>} */
	const namespace = window;
	if (typeof namespace[`${NewScreen}Run`] !== "function") {
		throw Error(`Screen "${NewScreen}": Missing required Run function`);
	}
	if (typeof namespace[`${NewScreen}Click`] !== "function") {
		throw Error(`Screen "${NewScreen}": Missing required Click function`);
	}

	ScreenIsLoading = true;
	CurrentModule = NewModule;
	CurrentScreen = NewScreen;
	CurrentScreenFunctions = {
		Run: (time) => namespace[`${NewScreen}Run`](time),
		Click: (e) => namespace[`${NewScreen}Click`](e),
		MouseDown: typeof namespace[`${NewScreen}MouseDown`] === "function" ? (e) => namespace[`${NewScreen}MouseDown`](e) : undefined,
		MouseUp: typeof namespace[`${NewScreen}MouseUp`] === "function" ? (e) => namespace[`${NewScreen}MouseUp`](e) : undefined,
		MouseMove: typeof namespace[`${NewScreen}MouseMove`] === "function" ? (e) => namespace[`${NewScreen}MouseMove`](e) : undefined,
		MouseWheel: typeof namespace[`${NewScreen}MouseWheel`] === "function" ? (e) => namespace[`${NewScreen}MouseWheel`](e) : undefined,
		Draw: typeof namespace[`${NewScreen}Draw`] === "function" ? () => namespace[`${NewScreen}Draw`]() : undefined,
		Load: typeof namespace[`${NewScreen}Load`] === "function" ? () => namespace[`${NewScreen}Load`]() : undefined,
		Unload: typeof namespace[`${NewScreen}Unload`] === "function" ? () => namespace[`${NewScreen}Unload`]() : undefined,
		Resize: typeof namespace[`${NewScreen}Resize`] === "function" ? (load) => namespace[`${NewScreen}Resize`](load) : undefined,
		KeyDown: typeof namespace[`${NewScreen}KeyDown`] === "function" ? (e) => namespace[`${NewScreen}KeyDown`](e) : undefined,
		KeyUp: typeof namespace[`${NewScreen}KeyUp`] === "function" ? (e) => namespace[`${NewScreen}KeyUp`](e) : undefined,
		Exit: typeof namespace[`${NewScreen}Exit`] === "function" ? () => namespace[`${NewScreen}Exit`]() : undefined,
		Paste: typeof namespace[`${NewScreen}Paste`] === "function" ? (e) => namespace[`${NewScreen}Paste`](e) : undefined,
	};

	CurrentDarkFactor = 1.0;
	CommonGetFont.clearCache();
	CommonGetFontName.clearCache();
	const textCache = TextLoad();
	try {
		await textCache.loadedPromise;
	} catch (_e) {
		console.error(`Failed to load text strings for screen!`);
	}

	ElementToggleGeneratedElements(CurrentScreen, true);

	try {
		await CurrentScreenFunctions.Load?.();
	} catch (error) {
		if (!recursive) {
			// Plan A: failed to load the new screen; revert back to the old screen
			console.error(`Failed to load "${NewModule}/${NewScreen}" screen:\n`, error);
			ToastManager.error(`Failed to load "${NewModule}/${NewScreen}" screen`);
			return CommonSetScreen(.../** @type {ScreenSpecifier} */([OldModule, OldScreen, { recursive: true }]));
		} else {
			// Plan B: can't even reload the old screen; things are FUBAR at this point ¯\_(ツ)_/¯
			// @ts-expect-error: `options.cause` requires es2022, though is inert and harmless on older browsers
			throw new Error(`Failed to reload previous "${NewModule}/${NewScreen}" screen`, { cause: error });
		}
	}
	const background = DrawGetBackgroundURL(false);
	if (background) {
		DrawGetImage(background);
	}
	ScreenIsLoading = false;

	CommonResize(true);
}

/**
 * Gets the current time in ms
 * @returns {number} - Date in ms
 */
function CommonTime() {
	return Date.now();
}

/**
 * Checks if a given value is a valid HEX color code (optionally with alpha channel)
 * @param {string | undefined} Value - Potential HEX color code
 * @param {null | { allowAlpha?: boolean }} [options]
 * @returns {Value is HexColor} - Returns TRUE if the string is a valid HEX color
 */
function CommonIsColor(Value, options=null) {
	options ??= {};
	if ((Value == null) || (Value.length < 3)) return false;
	//convert short hand hex color to standard format
	if (/^#[0-9A-F]{3}$/i.test(Value)) Value = "#" + Value[1] + Value[1] + Value[2] + Value[2] + Value[3] + Value[3];
	return options.allowAlpha ? /^#[0-9A-F]{6,8}$/i.test(Value) : /^#[0-9A-F]{6}$/i.test(Value);
}

/**
 * Checks whether an item's color has a valid value that can be interpreted by the drawing
 * functions. Valid values are null, undefined, strings, and an array containing any of the
 * aforementioned types.
 * @param {null | string | readonly (null | string)[]} [Color] - The Color value to check
 * @returns {boolean} - Returns TRUE if the color is a valid item color
 */
function CommonColorIsValid(Color) {
	if (Color == null || typeof Color === "string") return true;
	if (Array.isArray(Color)) return Color.every(C => C == null || typeof C === "string");
	return false;
}

/**
 * Remove the (potential present) alpha component of the passed color hex code, turning the likes of `RRGGBB(AA)` into `RRGGBB`.
 * @param {HexColor} color The color hex code
 * @returns {HexColor} The color hex code with its (potentially present) alpha component removed
 */
function CommonColorTrimAlpha(color) {
	return /** @type {HexColor} */(color.slice(0, 7));
}

/**
 * Check that the passed string looks like an acceptable email address.
 *
 * @param {string} Email
 * @returns {boolean}
 */
function CommonEmailIsValid(Email) {
	if (Email.length < 5 || Email.length > 100) return false;

	const parts = Email.split("@");
	if (parts.length !== 2) return false;
	if (parts[1].indexOf(".") === -1) return false;

	return ServerAccountEmailRegex.test(Email);
}

/**
 * Remove item from list on given index and returns it
 * @template T
 * @param {T[]} list
 * @param {number} index
 * @returns {undefined|T}
 */
function CommonRemoveItemFromList(list, index) {
	if(index > list.length || index < 0) return undefined;
	return list.splice(index, 1)[0];
}

/**
 * Removes random item from list and returns it
 * @template T
 * @param {T[]} list
 * @returns {undefined | T}
 */
function CommonRemoveRandomItemFromList(list) {
	return CommonRemoveItemFromList(list, Math.floor(Math.random() * list.length));
}

/**
 * Get a random item from a list while making sure not to pick the previous one.
 * Function expects unique values in the list. If there are multiple instances of ItemPrevious, it may still return it.
 * @template T
 * @param {T} ItemPrevious - Previously selected item from the given list
 * @param {readonly T[]} ItemList - List for which to pick a random item from
 * @returns {T} - The randomly selected item from the list
 */
function CommonRandomItemFromList(ItemPrevious, ItemList) {
	let previousIndex = ItemList.indexOf(ItemPrevious);
	let maxRandom = ItemList.length;
	if(previousIndex > -1){
		maxRandom--;
	}
	if(maxRandom > 0){
		let randomIndex = Math.floor(Math.random() * maxRandom);
		if( previousIndex > -1 && randomIndex >= previousIndex) randomIndex++;
		return ItemList[randomIndex];
	} else return ItemPrevious;
}

/**
 * Converts a string of numbers split by commas to an array, sanitizes the array by removing all NaN or undefined elements.
 * @param {string} s - String of numbers split by commas
 * @returns {number[]} - Array of valid numbers from the given string
 */
function CommonConvertStringToArray(s) {
	/** @type {number[]} */
	var arr = [];
	if (typeof s === "string") {
		arr = s.split(',').reduce((list, curr) => {
			if (!(!curr || Number.isNaN(Number(curr)))) list.push(Number(curr));
			return list;
		}, arr);
	}
	return arr;
}

/**
 * Shuffles all characters in a string
 * @param {string} string - The string to shuffle
 * @returns {string} - The shuffled string
 */
function CommonStringShuffle(string) {
	var parts = string.split('');
	for (var i = parts.length; i > 0;) {
		var random = parseInt(Math.random() * i);
		var temp = parts[--i];
		parts[i] = parts[random];
		parts[random] = temp;
	}
	return parts.join('');
}

/**
 * Generate a unique ID
 * @returns {string}
 */
function CommonGenerateUniqueID() {
	return Math.random().toString(36).substring(2);
}
/**
 * Converts an array to a string separated by commas (equivalent of .join(","))
 * @param {readonly any[]} Arr - Array to convert to a joined string
 * @returns {string} - String of all the array items joined together
 */
function CommonConvertArrayToString(Arr) {
	var S = "";
	for (let P = 0; P < Arr.length; P++) {
		if (P != 0) S = S + ",";
		S = S + Arr[P].toString();
	}
	return S;
}

/**
 * Checks whether two item colors are equal. An item color may either be a string or an array of strings.
 * @param {string | readonly string[]} C1 - The first color to check
 * @param {string | readonly string[]} C2 - The second color to check
 * @returns {boolean} - TRUE if C1 and C2 represent the same item color, FALSE otherwise
 */
function CommonColorsEqual(C1, C2) {
	if (Array.isArray(C1) && Array.isArray(C2)) {
		return CommonArraysEqual(C1, C2);
	}
	return C1 === C2;
}

/**
 * Checks whether two arrays are equal. The arrays are considered equal if they have the same length and contain the same items in the same
 * order, as determined by === comparison
 * @template {readonly *[]} T
 * @param {T} a1 - The first array to compare
 * @param {readonly *[]} a2 - The second array to compare
 * @param {boolean} [ignoreOrder] - Whether to ignore item order when considering equality
 * @returns {a2 is T} - TRUE if both arrays have the same length and contain the same items in the same order, FALSE otherwise
 */
function CommonArraysEqual(a1, a2, ignoreOrder = false) {
	return a1.length === a2.length && a1.every((item, i) => ignoreOrder ? a2.includes(item) : item === a2[i]);
}

/**
 * Creates a debounced wrapper for the provided function with the provided wait time. The wrapped function will not be called as long as
 * the debounced function continues to be called. If the debounced function is called, and then not called again within the wait time, the
 * wrapped function will be called.
 * @template {any[]} argsT
 * @template retT
 * @param {(...args: argsT) => retT} func - The function to debounce
 * @returns {(waitInterval: number, ...args: argsT) => retT} - A debounced version of the provided function
 */
function CommonDebounce(func) {
	/** @type {null | number} */
	let timeout;
	/** @type {number} */
	let timestamp;
	/** @type {retT} */
	let result;
	/** @type {number} */
	let wait;

	// Just a `setTimeout()` alias with some proper function-specific argument typing tailored around `later()`
	/** @type {(handler: TimerHandler, timeout: number, context: unknown, args: argsT) => number} */
	const laterSetTimeout = setTimeout;

	/** @type {(context: unknown, args: argsT) => void} */
	function later(context, args) {
		const last = CommonTime() - timestamp;
		if (last >= 0 && last < wait) {
			timeout = laterSetTimeout(later, wait - last, context, args);
		} else {
			timeout = null;
			result = func.apply(context, args);
		}
	}

	/** @type {(this: unknown, waitInterval: number, ...args: argsT) => retT} */
	return function (waitInterval, ...args) {
		wait = waitInterval;
		timestamp = CommonTime();
		if (!timeout) {
			timeout = laterSetTimeout(later, wait, this, args);
		}
		return result;
	};
}

/**
 * Creates a throttling wrapper for the provided function with the provided wait time. If the wrapped function has been successfully called
 * within the wait time, further call attempts will be delayed until the wait time has passed.
 * @template {any[]} argsT
 * @template retT
 * @param {(...args: argsT) => retT} func - The function to throttle
 * @returns {(waitInterval: number, ...args: argsT) => retT} - A throttled version of the provided function
 */
function CommonThrottle(func) {
	/** @type {null | number} */
	let timeout;
	/** @type {argsT} */
	let args;
	/** @type {unknown} */
	let context;
	let timestamp = 0;
	/** @type {retT} */
	let result;

	function run() {
		timeout = null;
		result = func.apply(context, args);
		timestamp = CommonTime();
	}

	/** @type {(this: unknown, wait: number, ...innerArgs: argsT) => retT} */
	return function (wait, ...innerArgs) {
		context = this;
		args = innerArgs;
		if (!timeout) {
			const last = CommonTime() - timestamp;
			if (last >= 0 && last < wait) {
				timeout = setTimeout(run, wait - last);
			} else {
				run();
			}
		}
		return result;
	};
}

/**
 * Creates a wrapper for a function to limit how often it can be called. The player-defined wait interval setting determines the
 * allowed frequency. Below 100 ms the function will be throttled and above will be debounced.
 * @template {any[]} argsT
 * @template retT
 * @param {(...args: argsT) => retT} func - The function to limit calls of
 * @param {number} [minWait=0] - A lower bound for how long the wait interval can be, 0 by default
 * @param {number} [maxWait=1000] - An upper bound for how long the wait interval can be, 1 second by default
 * @returns {(...args: argsT) => retT} - A debounced or throttled version of the function
 */
function CommonLimitFunction(func, minWait = 0, maxWait = 1000) {
	const funcDebounced = CommonDebounce(func);
	const funcThrottled = CommonThrottle(func);

	/** @type {(this: unknown, ...args: argsT) => retT} */
	return function (...args) {
		const wait = Math.min(
			Math.max(
				Player.GraphicsSettings ? Player.GraphicsSettings.AnimationQuality : 100, minWait
			),
			maxWait,
		);
		return wait < 100 ? funcThrottled.apply(this, [wait, ...args]) : funcDebounced.apply(this, [wait, ...args]);
	};
}

/**
 * Creates a simple memoizer.
 * The memoized function does calculate its result exactly once and from that point on, uses
 * the result stored in a local cache to speed up things.
 * @template {(...args: any) => any} T
 * @param {T} func - The function to memoize
 * @param {null | ((arg: any) => string)[]} argConvertors - A list of stringification functions for creating a memo, one for each function argument
 * @returns {MemoizedFunction<T>} - The result of the memoized function
 */
function CommonMemoize(func, argConvertors=null) {
	/** @type {Record<string, ReturnType<T>>} */
	var memo = {};
	var memoized = /** @type {MemoizedFunction<T>} */(function (...args) {
		let index = "";
		if (argConvertors !== null) {
			index += argConvertors.map((callback, i) => callback(args[i])).join(",");
		} else {
			for (const arg of args) {
				if (typeof arg === "object") {
					index += JSON.stringify(arg);
				} else {
					index += String(arg);
				}
			}
		}

		if (!(index in memo)) {
			memo[index] = func(...args);
		}
		return memo[index];
	});

	// add a clear cache method
	memoized.clearCache = function () {
		memo = {};
	};
	return memoized;
}

/**
 * Memoized getter function. Returns a font string specifying the player's
 * preferred font and the provided size. This is memoized as it is called on
 * every frame in many cases.
 * @param {number} size - The font size that should be specified in the
 * returned font string
 * @returns {string} - A font string specifying the requested font size and
 * the player's preferred font stack. For example:
 * 12px "Courier New", "Courier", monospace
 */
const CommonGetFont = CommonMemoize((size) => {
	return `${size}px ${CommonGetFontName()}`;
});

/**
 * Memoized getter function. Returns a font string specifying the player's
 * preferred font stack. This is memoized as it is called on every frame in
 * many cases.
 * @returns {string} - A font string specifying the player's preferred font
 * stack. For example:
 * "Courier New", "Courier", monospace
 */
const CommonGetFontName = CommonMemoize(() => {
	const pref = Player && Player.GraphicsSettings && Player.GraphicsSettings.Font;
	const fontStack = CommonFontStacks[pref] || CommonFontStacks.Arial;
	const font = fontStack[0].map(fontName => `"${fontName}"`).join(", ");
	return `${font}, ${fontStack[1]}`;
});

/**
 * Take a screenshot of specified area in "photo mode" and open the image in a new tab
 * @param {number} Left - Position of the area to capture from the left of the canvas
 * @param {number} Top - Position of the area to capture from the top of the canvas
 * @param {number} Width - Width of the area to capture
 * @param {number} Height - Height of the area to capture
 * @returns {void} - Nothing
 */
function CommonTakePhoto(Left, Top, Width, Height) {
	CommonPhotoMode = true;

	// Ensure everything is redrawn once in photo-mode
	DrawProcess(0);

	// Capture screen as image URL
	const ImgData = /** @type {HTMLCanvasElement | null} */ (document.getElementById("MainCanvas"))?.getContext('2d')?.getImageData(Left, Top, Width, Height);
	if (!ImgData) {
		return;
	}

	let PhotoCanvas = document.createElement('canvas');
	PhotoCanvas.width = Width;
	PhotoCanvas.height = Height;
	PhotoCanvas.getContext('2d')?.putImageData(ImgData, 0, 0);
	const PhotoImg = PhotoCanvas.toDataURL("image/png");

	// Open the image in a new window
	let newWindow = window.open('about:blank', '_blank');
	if (newWindow) {
		newWindow.document.write("<img src='" + PhotoImg + "' alt='from canvas'/>");
		newWindow.document.close();
	} else {
		console.warn("Popups blocked: Cannot open photo in new tab.");
	}

	CommonPhotoMode = false;
}

/**
 * Compares two version numbers and returns -1/0/1 if Other number is smaller/same/larger than Current one
 * @param {string} Current Current version number
 * @param {string} Other Other version number
 * @returns {-1|0|1} Comparison result
 */
function CommonCompareVersion(Current, Other) {
	const CurrentMatch = GameVersionFormat.exec(Current);
	const OtherMatch = GameVersionFormat.exec(Other);
	if (!CurrentMatch || !OtherMatch) return -1;
	const CurrentVer = [
		Number.parseInt(CurrentMatch[1]),
		CurrentMatch[2] === "Alpha" ? 1 : CurrentMatch[2] === "Beta" ? 2 : 3,
		Number.parseInt(CurrentMatch[3]) || 0
	];
	const OtherVer = [
		Number.parseInt(OtherMatch[1]),
		OtherMatch[2] === "Alpha" ? 1 : OtherMatch[2] === "Beta" ? 2 : 3,
		Number.parseInt(OtherMatch[3]) || 0
	];
	for (let i = 0; i < 3; i++) {
		if (CurrentVer[i] !== OtherVer[i]) {
			return /** @type {-1|0|1} */ (Math.sign(OtherVer[i] - CurrentVer[i]));
		}
	}
	return 0;
}

/**
 * A simple deep equality check function which checks whether two objects are equal. The function traverses recursively
 * into objects and arrays to check for equality. Primitives and simple types are considered equal as defined by `===`.
 * @template T
 * @param {unknown} obj1 - The first object to compare
 * @param {T} obj2 - The second object to compare
 * @returns {obj1 is T} - TRUE if both objects are equal, up to arbitrarily deeply nested property values, FALSE
 * otherwise.
 */
function CommonDeepEqual(obj1, obj2) {
	if (obj1 === obj2) {
		return true;
	}

	if (obj1 && obj2 && typeof obj1 === "object" && typeof obj2 === "object") {
		// If the objects do not share a prototype, they are not equal
		if (Object.getPrototypeOf(obj1) !== Object.getPrototypeOf(obj2)) {
			return false;
		}

		// Get the keys for the objects
		const keys1 = Object.keys(obj1);
		const keys2 = Object.keys(obj2);

		// If the objects have different numbers of keys, they are not equal
		if (keys1.length !== keys2.length) {
			return false;
		}

		// Sort the keys
		keys1.sort();
		keys2.sort();
		return keys1.every((key, i) => {
			// If the keys are different, the objects are not equal
			if (key !== keys2[i]) {
				return false;
			}

			// Otherwise, compare the values
			/** @type {Record<string, any>} */
			const obj1Compare = obj1;
			/** @type {Record<string, any>} */
			const obj2Compare = obj2;
			return CommonDeepEqual(obj1Compare[key], obj2Compare[key]);
		});
	}

	return false;
}

/**
 * A simple deep equality check function which checks whether two objects are equal for all properties in `subRec`.
 * The function traverses recursively into objects and arrays to check for equality.
 * Primitives and simple types are considered equal as defined by `===`.
 * @template T
 * @param {unknown} subRec - The subset-containg object to compare
 * @param {T} superRec - The superset-containg object to compare
 * @returns {subRec is Partial<T>} - Whether `subRec` is a subset of `superRec` up to arbitrarily deeply nested property values
 */
function CommonDeepIsSubset(subRec, superRec) {
	if (subRec === superRec) {
		return true;
	}

	if (subRec && superRec && typeof subRec === "object" && typeof superRec === "object") {
		// If the objects do not share a prototype, they are not equal
		if (Object.getPrototypeOf(subRec) !== Object.getPrototypeOf(superRec)) {
			return false;
		}

		if (CommonIsArray(subRec) && CommonIsArray(superRec)) {
			return subRec.every(subValue => superRec.some(superValue => CommonDeepIsSubset(subValue, superValue)));
		} else {
			// Get the keys for the objects
			const subKeys = Object.keys(subRec);
			const superKeys = new Set(Object.keys(superRec));

			// If the objects have different numbers of keys, they are not equal
			if (!subKeys.every(k => superKeys.has(k))) {
				return false;
			} else {
				/** @type {Record<string, any>} */
				const subRecCompare = subRec;
				/** @type {Record<string, any>} */
				const superRecCompare = superRec;
				return subKeys.every(key => CommonDeepIsSubset(subRecCompare[key], superRecCompare[key]));
			}
		}
	}
	return false;
}

/**
 * Adds all items from the source array to the destination array if they aren't already included
 * @template T
 * @param {T[]} dest - The destination array
 * @param {readonly T[]} src - The source array
 * @returns {T[]} - The destination array
 */
function CommonArrayConcatDedupe(dest, src) {
	if (Array.isArray(src) && Array.isArray(dest)) {
		for (const item of src) {
			if (!dest.includes(item)) dest.push(item);
		}
	}
	return dest;
}

/**
 * Common function for removing a padlock from an item and publishing a corresponding chat message (must be called with
 * the item's group focused)
 * @param {Character} C - The character on whom the item is equipped
 * @param {Item} Item - The item to unlock
 * @returns {void} - Nothing
 */
function CommonPadlockUnlock(C, Item) {
	if (!C.FocusGroup) {
		return;
	}

	for (let A = 0; A < C.Appearance.length; A++) {
		if (C.Appearance[A].Asset.Group.Name === C.FocusGroup.Name) {
			C.Appearance[A] = Item;
			break;
		}
	}
	InventoryUnlock(C, C.FocusGroup.Name);
	if (ChatRoomPublishAction(C, "ActionUnlock", Item, null))
		DialogLeave();
}

/**
 * Common noop function
 * @returns {void} - Nothing
 */
function CommonNoop() {
	// Noop function
}

/**
 * Redirects the address to HTTPS for all production environments, returns the proper heroku server
 * @returns {String} - Returns the proper server to use in production or test
 */
function CommonGetServer() {
	if ((location.href.indexOf("bondageprojects") < 0) && (location.href.indexOf("bondage-europe") < 0) && (location.href.indexOf("bondage-asia") < 0)) return "https://bondage-club-server-test.herokuapp.com/";
	if (location.protocol !== 'https:') location.replace(`https:${location.href.substring(location.protocol.length)}`);
	return "https://bondage-club-server.herokuapp.com/";
}

/**
 * Performs the required substitutions on the given message
 *
 * @param {string} msg - The string to perform the substitutions on.
 * @param {CommonSubtituteSubstitution[]} substitutions - An array of [string, replacement, replacer?] subtitutions.
 */
function CommonStringSubstitute(msg, substitutions) {
	if (typeof msg !== "string" || msg.trim() === "")
		return "";

	/**
	 *
	 * @param {CommonSubstituteReplacer | undefined} replacer
	 * @param {string} replacement
	 * @returns {(match: string, offset: number, string: string) => string}
	 */
	function makeReplacer(replacer, replacement) {
		if (typeof replacer === "function")
			return (match, offset, string) => replacer(match, offset, replacement, string);
		return () => replacement;
	}

	substitutions = substitutions.sort((a, b) => b[0].length - a[0].length);
	for (const [tag, subst, replacer] of substitutions) {
		let repl = makeReplacer(replacer, subst);
		msg = msg.replace(new RegExp(tag, "g"), repl);
	}
	return msg;
}

/**
 * Returns a nice version of the passed strings
 *
 * This turns ["this", "this", "that"] into "this, this, and that" using appropriate localization
 *
 * @param {string[]} strings The strings to join
 */
function CommonArrayJoinPretty(strings) {
	const last = strings.pop();
	let pretty = strings.join(InterfaceTextGet("PrettyArrayJoin"));
	pretty += InterfaceTextGet("PrettyArrayJoinFinal") + last;
	return pretty;
}

/**
 * Returns a titlecased version of the given string.
 * @param {string} str
 * @returns {string}
 */
function CommonStringTitlecase(str) {
	return str[0].toUpperCase() + str.substring(1);
}

/**
 * Censors a string or words in that string based on the player preferences
 * @param {string} S - The string to censor
 * @returns {String} - The censored string
 */
function CommonCensor(S) {

	// Validates that we must apply censoring
	if ((Player.ChatSettings == null) || (Player.ChatSettings.CensoredWordsLevel == null) || (Player.ChatSettings.CensoredWordsList == null)) return S;
	let WordList = PreferenceCensoredWordsList = Player.ChatSettings.CensoredWordsList.split("|");
	if (WordList.length <= 0) return S;

	// At level zero, we replace the word with ***
	if (Player.ChatSettings.CensoredWordsLevel == 0)
		for (let W of WordList)
			if ((W != "") && (W != " ") && !W.includes("*") && S.toUpperCase().includes(W.toUpperCase())) {
				let searchMask = W;
				let regEx = new RegExp(searchMask, "ig");
				let replaceMask = "***";
				S = S.replace(regEx, replaceMask);
			}

	// At level one, we replace the full phrase with ***, at level two we return a ¶¶¶ string indicating to filter out
	if (Player.ChatSettings.CensoredWordsLevel >= 1)
		for (let W of WordList)
			if ((W != "") && (W != " ") && !W.includes("*") && S.toUpperCase().includes(W.toUpperCase()))
				return (Player.ChatSettings.CensoredWordsLevel >= 2) ? "¶¶¶" : "***";

	// Returns the mashed string
	return S;

}

/**
 * Type guard which checks that a value is a simple object (i.e. a non-null object which is not an array)
 * @param {unknown} value - The value to test
 * @returns {value is object}
 */
export function CommonIsObject(value) {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Type guard which checks that a value is a character
 * @param {unknown} value - The value to test
 * @returns {value is Character | PlayerCharacter}
 */
function CommonIsCharacter(value) {
	const char = /** @type {Character} */ (value);
	return CommonIsObject(char) && (char.Type === "online" || char.Type === "npc" || char.Type === "simple" || char.Type === "player");
}

/**
 * Deep-clones an object
 * @todo JSON serialization will break things like functions, Sets and Maps.
 * @template T
 * @param {T} obj
 * @param {null | ((this: any, key: string, value: any) => any)} [replacer]
 * @param {null | ((this: any, key: string, value: any) => any)} [reviver]
 * @returns {T}
 */
function CommonCloneDeep(obj, reviver=null, replacer=null) {
	reviver ??= undefined;
	replacer ??= undefined;
	return /** @type {T} */ (JSON.parse(JSON.stringify(obj, replacer), reviver));
}

/**
 * Type guard which checks that a value is a non-negative (i.e. positive or zero) integer
 * @param {unknown} value - The value to test
 * @returns {value is number}
 * @see {@link CommonIsInteger}
 */
function CommonIsNonNegativeInteger(value) {
	return CommonIsInteger(value, 0);
}

/**
 * Type guard which checks that a value is an integer that, optionally, falls within the specified range
 * @param {unknown} value - The value to test
 * @param {number} min - The minimum allowed value
 * @param {number} max - The maximum allowed value
 * @returns {value is number}
 */
function CommonIsInteger(value, min=-Infinity, max=Infinity) {
	return (
		typeof value === "number"
		&& Number.isInteger(value)
		&& value >= min
		&& value <= max
	);
}

/**
 * Type guard which checks that a value is a finite number that, optionally, falls within the specified range
 * @param {unknown} value - The value to test
 * @param {number} min - The minimum allowed value
 * @param {number} max - The maximum allowed value
 * @returns {value is number}
 */
function CommonIsFinite(value, min=-Infinity, max=Infinity) {
	return (
		typeof value === "number"
		&& Number.isFinite(value)
		&& value >= min
		&& value <= max
	);
}

/**
 * A version of {@link Array.isArray} more friendly towards readonly arrays.
 * @template {unknown} T
 * @param {T} arg - The to-be validated object
 * @returns {arg is (arg extends readonly unknown[] ? readonly unknown[] : unknown[])} Whether the passed object is a (potentially readonly) array
 */
function CommonIsArray(arg) {
	return Array.isArray(arg);
}

/**
 * A {@link Object.keys} variant annotated to return respect literal key types
 * @template {object} T
 * @param {T} obj A record with string-based keys
 * @returns {(keyof T)[]} The keys in the passed record
 */
function CommonKeys(obj) {
	return /** @type {(keyof T)[]} */(Object.keys(obj));
}

/**
 * A {@link Object.entries} variant annotated to return respect literal key types
 * @template {{}} T
 * @param {T} obj A record with string-based keys
 * @returns {[keyof T, T[keyof T]][]} The key/value pairs in the passed record
 */
function CommonEntries(obj) {
	return /** @type {[keyof T, T[keyof T]][]} */(Object.entries(obj));
}

/**
 * A {@link Array.includes} version annotated to return a type guard.
 * @template T
 * @param {readonly T[]} array The array in question
 * @param {unknown} searchElement The value to search for
 * @param {number} [fromIndex] Zero-based index at which to start searching
 * @returns {searchElement is T} Whether the array contains the passed element
 */
function CommonIncludes(array, searchElement, fromIndex) {
	return array.includes(/** @type {T} */(searchElement), fromIndex);
}

/**
 * A {@link Object.fromEntries} variant annotated to return respect literal key types.
 * @note The returned record is typed as being non-{@link Partial}, an assumption that may not hold in practice
 * @template {string} KT
 * @template VT
 * @param {Iterable<[key: KT, value: VT]>} iterable An iterable object that contains key-value entries for properties and methods
 * @returns {Record<KT, VT>} A record created from the passed key/value pairs
 */
function CommonFromEntries(iterable) {
	return /** @type {Record<KT, VT>} */(Object.fromEntries(iterable));
}

/**
 * Automatically generate grid coordinates based on parameters.
 * @param {number} nItems - The upper bound to the number of grid points; fewer can be returned if they do not all fit on the grid
 * @param {CommonGenerateGridParameters} grid - The grid parameters
 * @returns {RectTuple[]} - A list of grid coordinates with a length of `<= nItems`
 * @see {@link CommonGenerateGrid}
 */
function CommonGenerateGridCoords(nItems, grid) {
	// Calculate horizontal & vertical margins
	const minMarginX = grid.minMarginX ?? 0;
	const minMarginY = grid.minMarginY ?? 0;
	const itemCountX = Math.floor(grid.width / grid.itemWidth);
	const marginX = Math.max(minMarginX, grid.itemMarginX ?? (grid.width - (itemCountX * grid.itemWidth)) / (itemCountX - 1));
	const itemCountY = Math.floor(grid.height / grid.itemHeight);
	const marginY = Math.max(minMarginY, grid.itemMarginY ?? (grid.height - (itemCountY * grid.itemHeight)) / (itemCountY - 1));
	const direction = grid.direction ?? "horizontal";

	/** @type {RectTuple[]} */
	const gridList = [];
	let i = 0;
	let x = grid.x;
	let y = grid.y;
	if (direction === "horizontal") {
		for (i; i < nItems && y <= grid.y + grid.height; i++) {
			gridList.push([x, y, grid.itemWidth, grid.itemHeight]);
			x += grid.itemWidth + marginX;
			if (x - grid.x >= grid.width) {
				x = grid.x;
				y += grid.itemHeight + marginY;
			}
		}
	} else {
		for (i; i < nItems && x <= grid.x + grid.width; i++) {
			gridList.push([x, y, grid.itemWidth, grid.itemHeight]);
			y += grid.itemHeight + marginY;
			if (y - grid.y >= grid.height) {
				y = grid.y;
				x += grid.itemWidth + marginX;
			}
		}
	}
	return gridList;
}

/**
 * Automatically generate a grid based on parameters and apply a callback to each grid point.
 *
 * This function takes a list of items, grid parameters, and a callback to manage
 * creating a grid of them. It'll find the best value for margins between each cell,
 * then will call the callback passing each item with its calculated coordinates in turn.
 *
 * Returning true from the callback to stop the iteration, useful for click handlers
 * so you don't keep checking items after handling one.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {number} offset
 * @param {CommonGenerateGridParameters} grid
 * @param {CommonGenerateGridCallback<T>} callback
 * @returns {number} - The (offsetted) index for which the callback evaluated to `true`, or `-1` if no elements satisfy the testing
 */
function CommonGenerateGrid(items, offset, grid, callback) {
	const gridCoords = CommonGenerateGridCoords(items.length - offset, grid);
	const index = gridCoords.findIndex((coords, i) => callback(items[i + offset], ...coords));
	return index === -1 ? -1 : index - offset;
}

/**
 * Create a copy of the passed record with all specified keys removed
 * @template {keyof RecordType} KeyType
 * @template {{}} RecordType
 * @param {RecordType} object - The to-be copied record
 * @param {Iterable<KeyType>} keys - The to-be removed keys from the record
 * @returns {Omit<RecordType, KeyType>}
 */
function CommonOmit(object, keys) {
	const ret = { ...object };
	for (const k of keys) {
		delete ret[k];
	}
	return ret;
}

/**
 * Create a copy of the passed record with all specified keys removed
 * @template {keyof RecordType} KeyType
 * @template {{}} RecordType
 * @param {RecordType} object - The to-be copied record
 * @param {Iterable<KeyType>} keys - The to-be removed keys from the record
 * @returns {Pick<RecordType, KeyType>}
 */
function CommonPick(object, keys) {
	const ret = /** @type {Pick<RecordType, KeyType>} */({});
	for (const k of keys) {
		ret[k] = object[k];
	}
	return ret;
}

/**
 * Iterate through the passed iterable and yield index/value pairs.
 * @template T
 * @param {Iterable<T>} iterable - The to-be iterated iterable
 * @param {number} start - The starting index
 * @param {number} step - The step size in which the index is incremented
 * @returns {Generator<[index: number, value: T], void>}
 */
function* CommonEnumerate(iterable, start=0, step=1) {
	let i = start;
	for (const item of iterable) {
		yield [i, item];
		i += step;
	}
}

/**
 * Return a value clamped to a minimum and maximum
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function CommonClamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

/**
 * Return value % divisor but properly handling negative values
 *
 * Useful if you have a set of keys and want to move an index within its bounds with proper wrap-around.
 *
 * @param {number} value
 * @param {number} divisor
 */
function CommonModulo(value, divisor) {
	return Math.abs((divisor + value) % divisor);
}

/**
 * Returns TRUE if the URL is valid, is from http or https or screens/ or backgrounds/ and has the required extension
 * @param {string} TestURL - The URL to test
 * @param {readonly string[]} Extension - An array containing the valid extensions
 * @returns {boolean}
*/
function CommonURLHasExtension(TestURL, Extension) {
	if ((TestURL == null) || (typeof TestURL !== "string") || (Extension == null) || !CommonIsArray(Extension)) return false;
	try {
		const Url = new URL(TestURL);
		if ((Url.protocol !== 'http:') && (Url.protocol !== 'https:')) return false;
		let FormatUrl = Url.pathname.trim().toLowerCase();
		for (let Ext of Extension)
			if (FormatUrl.endsWith(Ext))
				return true;
	} catch (_err) {
		let FormatUrl = TestURL.trim().toLowerCase();
		if ((FormatUrl.startsWith("screens/")) || (FormatUrl.startsWith("backgrounds/")))
			for (let Ext of Extension)
				if (FormatUrl.endsWith(Ext))
					return true;
	}
	return false;
}

/**
 * Return whether two records are equivalent for all fields as returned by {@link Object.keys}.
 * @note does *not* support the comparison of nested structures.
 * @template T
 * @param {T} rec1
 * @param {unknown} rec2
 * @returns {rec2 is T}
 */
function CommonObjectEqual(rec1, rec2) {
	if (!CommonIsObject(rec1) || !CommonIsObject(rec2)) {
		return false;
	}

	const entries1 = Object.entries(rec1);
	const keys2 = Object.keys(rec2);
	if (entries1.length !== keys2.length) {
		return false;
	}
	return entries1.every(([k, v]) => /** @type {Record<string, any>} */ (rec2)[k] === v);
}

/**
 * Return if the key/value pairs of `subRec` form a subset of `superRec`
 * @template T
 * @param {unknown} subRec
 * @param {T} superRec
 * @returns {subRec is Partial<T>}
 */
function CommonObjectIsSubset(subRec, superRec) {
	if (!CommonIsObject(subRec) || !CommonIsObject(superRec)) {
		return false;
	}
	const entries = Object.entries(subRec);
	return entries.every(([k, v]) => /** @type {Record<string, any>} */ (superRec)[k] === v);
}

/**
 * Returns the object with keys and values reversed
 * @param {object} obj
 */
function CommonObjectFlip(obj) {
	return Object.keys(obj).reduce((ret, key) => {
		ret[/** @type {Record<string, any>} */ (obj)[key]] = key;
		return ret;
	  }, /** @type {Record<string, any>} */ ({}));
}

/**
 * Parse the passed stringified JSON data and catch any exceptions.
 * Exceptions will cause the function to return `undefined`.
 * @param {string} data
 * @returns {unknown}
 * @see {@link JSON.parse}
 */
function CommonJSONParse(data) {
	try {
		return JSON.parse(data);
	} catch (error) {
		console.error(error, data);
		return undefined;
	}
}

/**
 * Translates the current event into movement directions
 *
 * This returns a layout independent u/d/l/r string
 *
 * These keybinds get documented in {@link KeybindingDefaults.DefaultKeybindings}
 * @param {KeyboardEvent} event
 * @returns {"u"|"d"|"l"|"r"|undefined}
 */
function CommonKeyMove(event, allowArrowKeys = true, checkModifiers=true) {
	if (checkModifiers && CommonKey.GetModifiers(event)) {
		return undefined;
	} else if (event.code === "KeyW" || allowArrowKeys && event.code === "ArrowUp") {
		return "u";
	} else if (event.code === "KeyA" || allowArrowKeys && event.code === "ArrowLeft") {
		return "l";
	} else if (event.code === "KeyS" || allowArrowKeys && event.code === "ArrowDown") {
		return "d";
	} else if (event.code === "KeyD" || allowArrowKeys && event.code === "ArrowRight") {
		return "r";
	}
	return undefined;
}

/**
 * A {@link Set.has}/{@link Map.has} version annotated to return a type guard.
 * @template T
 * @param {{ has: (key: T) => boolean }} obj The set or map in question
 * @param {unknown} key The key to search for
 * @returns {key is T} Whether the object contains the passed key
 */
function CommonHas(obj, key) {
	return obj.has(/** @type {T} */(key));
}

/**
 * Defines a property with the given name and the passed setter and getter
 * @example
 * CommonDeprecate(
 *  "OldFunc",
 *  function NewFunc (a, b) { return a + b; },
 * );
 * @template {readonly any[]} T
 * @param {string} propertyName - The name for the new property
 * @param {() => T} [getter] - The getter function for the property
 * @param {(args: T) => void} [setter] - The setter function for the property
 */
function CommonProperty(propertyName, getter=undefined, setter=undefined) {
	/** @type {Record<string, any>} */
	const windowNamespace = window;
	if (windowNamespace[propertyName] !== undefined) {
		throw new Error(`The name ${setter} already exists.`);
	}

	getter ??= function(){ throw Error(`Property "${propertyName}" has no getter defined`); };
	setter ??= function(){ throw Error(`Property "${propertyName}" has no setter defined`); };

	Object.defineProperty(window, propertyName, {
		enumerable: true,
		configurable: true,
		get: function() {
			return getter();
		},
		set: function(val) { setter(val); },
	});
}

/**
 * Assign a function to the passed namespace, creating a deprecated and non-deprecated symbol.
 * Both symbols will are in fact get/set wrappers around the same object, enforcing that `namespace[oldName] === namespace[callback.name]` *always* holds.
 * @example
 * CommonDeprecateFunction(
 *  "OldFunc",
 *  function NewFunc (a, b) { return a + b; },
 * );
 * @template {(...args: any[]) => any} T
 * @param {string} oldName - The old (deprecated) name of the symbol
 * @param {T} callback - The function with its new name
 * @param {Record<string, any>} namespace - The namespace wherein the new and old names will be stored
 */
function CommonDeprecateFunction(oldName, callback, namespace=globalThis) {
	const newName = callback.name;
	if (!newName) {
		throw new Error("Passed function lacks a name");
	} else if (newName === oldName) {
		throw new Error(`Callback name (${newName}) and oldName (${oldName}) must not be equivalent`);
	}

	const privateName = `_${newName}`;
	namespace[privateName] = callback;

	/** @type {Record<string, any>} */
	const windowNamespace = window;
	windowNamespace[newName].get = function() { return namespace[privateName]; };
	/** @type {(value: unknown) => void} */
	windowNamespace[newName].set = function(val) { namespace[privateName] = val; };

	Object.defineProperty(window, oldName, {
		enumerable: true,
		configurable: true,
		get: function() {
			console.warn(`"${oldName}" is deprecated, use "${newName}" instead`);
			return namespace[privateName];
		},
		set: function(val) { namespace[privateName] = val; },
	});
}

/**
 * Capitalize the first character of the passed string.
 * @template {string} T
 * @param {T} string
 * @returns {Capitalize<T>}
 */
function CommonCapitalize(string) {
	return /** @type {Capitalize<T>} */(string ? `${string[0].toUpperCase()}${string.slice(1)}` : "");
}

/**
 * Construct an object for holding arbitrary (user-specified) values with a mechanism to reset them to a default
 * @template T1
 * @template [T2={}]
 * @param {T1} defaults - Default values that should be restored upon reset
 * @param {null | T2} extraVars - Extra values that should *not* affected by resets
 * @param {null | { replacer?: (this: any, key: string, value: any) => any, reviver?: (this: any, key: string, value: any) => any }} resetCallbacks - Extra callbacks for affecting the deep cloning process on reset.
 * Generally only relevant if one of the fields contains non-JSON-serializible data.
 * @returns {VariableContainer<T1, T2>} - The newly created object
 */
function CommonVariableContainer(defaults, extraVars=null, resetCallbacks=null) {
	const ret = Object.assign(
		/** @type {VariableContainer<T1, T2>} */(extraVars ?? {}),
		defaults,
		{
			Defaults: defaults,
			Reset: () => {
				Object.assign(ret, CommonCloneDeep(ret.Defaults, resetCallbacks?.reviver, resetCallbacks?.replacer));
			},
		},
	);
	ret.Reset();
	return ret;
}

/**
 * Namespace with helper functions for validating key presses.
 * @namespace
 */
var CommonKey = /** @type {const} */({
	/** Bitmask component for the {@link KeyboardEvent.altKey} modifier */
	ALT: 1,
	/** Bitmask component for the {@link KeyboardEvent.ctrlKey} modifier */
	CTRL: 2,
	/** Bitmask component for the {@link KeyboardEvent.metaKey} modifier */
	META: 4,
	/** Bitmask component for the {@link KeyboardEvent.shiftKey} modifier */
	SHIFT: 8,

	/**
	 * Check whether the expected key and all its modifiers were pressed
	 * @example
	 * // `Enter` without modifiers
	 * CommonKey(event, "Enter");
	 * // `Enter` with the `Ctrl` and `Shift` modifiers
	 * CommonKey(event, "Enter", CommonKey.SHIFT | CommonKey.CTRL);
	 * @param {KeyboardEvent} event - The keyboard event in question
	 * @param {string} key - The expected key (see {@link KeyboardEvent.prototype.key})
	 * @param {null | number} modifiers - An optional bit mask of all expected modifiers (see examples)
	 * @returns {boolean} - Whether the expected key and all its modifiers were pressed
	 */
	IsPressed: function IsPressed(event, key, modifiers=null) {
		modifiers ??= 0;
		return event.key === key && modifiers === CommonKey.GetModifiers(event);
	},

	/**
	 * Return a bit mask with all modifiers in the passed keyboard event
	 * @param {KeyboardEvent} event - The keyboard event in question
	 * @returns {number} - The bitmask of keyboard modifiers
	 */
	GetModifiers: function GetModifiers(event) {
		return [
			event.altKey ? CommonKey.ALT : undefined,
			event.ctrlKey ? CommonKey.CTRL : undefined,
			event.metaKey ? CommonKey.META : undefined,
			event.shiftKey ? CommonKey.SHIFT : undefined,
		].filter(Boolean).reduce((sum, bit) => sum | bit, 0);
	},

	/**
	 * A {@link ScreenFunctions.KeyDown} helper function for implementing the navigation key handling of scrollable elements.
	 * These keybinds get documented in {@link KeybindingDefaults.DefaultKeybindings}
	 * @param {HTMLElement} scrollableElem - The scrollable element
	 * @param {KeyboardEvent} event - The `keydown` event
	 * @param {(scrollableElem: HTMLElement) => number} getArrowScrollDistance - A callback for computing the (absolute) scroll distance for up/down arrow key presses
	 * @returns {boolean} - Whether a navigation key was (successfuly pressed)
	 */
	NavigationKeyDown: function NavigationKeyDown(scrollableElem, event, getArrowScrollDistance) {
		// Abort if an element has been (explicitly)
		// Dialog elements are a bit weird, they can (and must) be focusable despite not being interactive
		const root = ElementGetRoot(scrollableElem);
		const noFocus = (
			root.activeElement === null
			|| root.activeElement === document.body
			|| root.activeElement.id === "MainCanvas"
			|| root.activeElement instanceof HTMLDialogElement
		);

		if (!scrollableElem || !noFocus || !event || CommonKey.GetModifiers(event)) {
			return false;
		}

		const sign = (event.key === "PageUp" || event.key === "ArrowUp") ? -1 : 1;
		switch (event.key) {
			case "Home":
				scrollableElem.scrollTop = 0;
				return true;
			case "End":
				scrollableElem.scrollTop = scrollableElem.scrollHeight;
				return true;
			case "PageUp":
			case "PageDown":
				scrollableElem.scrollBy({ top: sign * scrollableElem.clientHeight, behavior: "instant" });
				return true;
			case "ArrowUp":
			case "ArrowDown":
				scrollableElem.scrollBy({ top: sign * getArrowScrollDistance(scrollableElem), behavior: "instant" });
				return true;
			default:
				return false;
		}
	},

	/**
	 * A {@link ScreenFunctions.KeyDown} helper function for automatically forwarding key presses to the passed input element.
	 * @param {HTMLInputElement | HTMLTextAreaElement} inputElem - The input or textarea element in question
	 * @param {KeyboardEvent} ev - The keydown event
	 * @param {null | { allowCtrlA?: boolean }} options
	 * @returns {boolean} - Whether the keypress was processed
	 */
	InputKeyDown: function InputKeyDown(inputElem, ev, options=null) {
		options ??= {};
		const activeElement = ElementGetRoot(inputElem).activeElement;
		const noFocus = (
			activeElement === null
			|| activeElement === document.body
			|| activeElement.id === "MainCanvas"
			|| activeElement instanceof HTMLDialogElement
		);

		if (
			!(inputElem instanceof HTMLInputElement || inputElem instanceof HTMLTextAreaElement)
			|| inputElem.disabled
			|| inputElem.readOnly
			|| !noFocus
		) {
			return false;
		}

		const ctrl = navigator.userAgent.includes("Mac") ? CommonKey.META : CommonKey.CTRL;
		const modifiers = CommonKey.GetModifiers(ev);
		if (ev.key.length === 1 && (!modifiers || modifiers === CommonKey.SHIFT)) {
			if (inputElem.maxLength === -1 || inputElem.value.length < inputElem.maxLength) {
				inputElem.value += ev.key;
			}
			inputElem.setSelectionRange(inputElem.value.length, inputElem.value.length);
		} else if (ev.key === "Backspace" && !modifiers) {
			inputElem.value = inputElem.value.slice(0, -1);
			inputElem.setSelectionRange(inputElem.value.length, inputElem.value.length);
		} else if ((ev.key === "Enter" || ev.key === "Delete" || ev.key === "Insert") && !modifiers) {
			inputElem.setSelectionRange(inputElem.value.length, inputElem.value.length);
		} else if (options.allowCtrlA && ev.key === "a" && modifiers === ctrl) {
			inputElem.setSelectionRange(0, inputElem.value.length);
		} else {
			return false;
		}

		inputElem.focus();
		inputElem.dispatchEvent(new InputEvent("input"));
		return true;
	},

	/**
	 * A {@link ScreenFunctions.Paste} helper function for automatically forwarding paste actions to the passed input element.
	 * @param {HTMLInputElement | HTMLTextAreaElement} inputElem - helper function for automatically forwarding paste actions to the passed input element.
	 * @param {ClipboardEvent} ev - The `paste` event
	 * @returns {void}
	 */
	InputPaste: function InputPaste(inputElem, ev) {
		const activeElement = ElementGetRoot(inputElem).activeElement;
		const noFocus = (
			activeElement === null
			|| activeElement === document.body
			|| activeElement.id === "MainCanvas"
			|| activeElement instanceof HTMLDialogElement
		);

		if (
			!(inputElem instanceof HTMLInputElement || inputElem instanceof HTMLTextAreaElement)
			|| inputElem.disabled
			|| inputElem.readOnly
			|| !noFocus
		) {
			return;
		}

		const content = ev.clipboardData?.getData("text") ?? "";
		inputElem.value = (inputElem.value + content).slice(0, inputElem.maxLength === -1 ? undefined : inputElem.maxLength);
		inputElem.focus();
		inputElem.setSelectionRange(inputElem.value.length, inputElem.value.length);
		inputElem.dispatchEvent(new InputEvent("input"));
		return;
	},
});

/**
 * Partition the string into separate parts using the given replacer keys, replacing them with replacer values
 * @template T
 * @param {string} string
 * @param {Record<string, T>} replacers - An object with replacements. Note that {@link Node} elements are cloned prior to the replacement
 * @returns {(string | T)[]}
 */
function CommonStringPartitionReplace(string, replacers) {
	const pattern = new RegExp(`(${Object.keys(replacers).map(key => CommonRegEscape(key)).join("|")})`, "g");
	const matches = Array.from(string.matchAll(pattern));
	if (matches.length === 0) {
		return [string];
	}
	matches.sort((a, b) => a.index - b.index);

	/** @type {(string | T)[]} */
	const ret = [];
	let i = 0;
	for (const match of matches) {
		if (match.index < i) {
			continue;
		}
		const prefix = string.slice(i, match.index);
		if (prefix) {
			ret.push(prefix);
		}
		const obj = replacers[match[0]];
		ret.push(obj instanceof Node ? /** @type {T} */(obj.cloneNode(true)) : obj);
		i = match.index + match[0].length;
	}

	const suffix = string.slice(i);
	if (suffix) {
		ret.push(suffix);
	}
	return ret;
}

/**
 * Escapes any potential regex syntax characters in a string, and returns a new string that can be safely used as a literal pattern for the {@link RegExp} constructor.
 * @license MIT - Copyright (c) 2014-2025 Denis Pushkarev, core-js 3.40.0 - 2025.01.08
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/escape
 * @see https://github.com/zloirock/core-js/blob/v3.40.0/packages/core-js/modules/esnext.regexp.escape.js
 * @param S The string to escape.
 * @returns A new string that can be safely used as a literal pattern for the {@link RegExp} constructor.
 */
var CommonRegEscape = (() => {
	// As of the time of writing a limited number of browsers have native `RegExp.escape` support
	// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/escape
	if ("escape" in RegExp && typeof RegExp.escape === "function") {
		return RegExp.escape;
	}

	var WHITESPACES = (
		'\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002' +
		'\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF'
	);

	var FIRST_DIGIT_OR_ASCII = /^[0-9a-z]/i;
	var SYNTAX_SOLIDUS = /^[$()*+./?[\\\]^{|}]/;
	var OTHER_PUNCTUATORS_AND_WHITESPACES = RegExp('^[!"#%&\',\\-:;<=>@`~' + WHITESPACES + ']');
	var ControlEscape = {
		'\u0009': 't',
		'\u000A': 'n',
		'\u000B': 'v',
		'\u000C': 'f',
		'\u000D': 'r',
	};

	/** @type {(chr: string) => string} */
	function escapeChar(chr) {
		var hex = chr.charCodeAt(0).toString(16);
		return hex.length < 3 ? '\\x' + hex.padStart(2, '0') : '\\u' + hex.padStart(4, '0');
	}

	// `RegExp.escape` method
	// https://github.com/tc39/proposal-regex-escaping
	/** @type {(S: string) => string} */
	return function escape(S) {
		if (typeof S !== 'string') {
			throw new TypeError('Argument is not a string');
		}

		var length = S.length;
		var result = Array(length);

		for (var i = 0; i < length; i++) {
			var chr = S.charAt(i);
			if (i === 0 && FIRST_DIGIT_OR_ASCII.exec(chr)) {
				result[i] = escapeChar(chr);
			} else if (chr in ControlEscape) {
				// @ts-ignore: `chr` _is_ in `ControlEscape`; stop your whining TS
				result[i] = '\\' + ControlEscape[chr];
			} else if (SYNTAX_SOLIDUS.exec(chr)) {
				result[i] = '\\' + chr;
			} else if (OTHER_PUNCTUATORS_AND_WHITESPACES.exec(chr)) {
				result[i] = escapeChar(chr);
			} else {
				var charCode = chr.charCodeAt(0);
				if ((charCode & 0xF800) !== 0xD800) { // single UTF-16 code unit
					result[i] = chr;
				} else if (charCode >= 0xDC00 || i + 1 >= length || (S.charCodeAt(i + 1) & 0xFC00) !== 0xDC00) { // unpaired surrogate
					result[i] = escapeChar(chr);
				} else { // surrogate pair
					result[i] = chr;
					result[++i] = S.charAt(i);
				}
			}
		}

		return result.join('');
	};
})();

/**
 *
 * @param {RoomName} screen
 */
function CommonScreenName(screen) {
	const cache = TextAllScreenCache.get(`Screens/Room/MainHall/Text_MainHall.csv`);
	return cache?.get(screen);
}

/**
 * Generates the path to a translation CSV file for a screen
 *
 * @param {string} [module] - The screen's module
 * @param {string} [screen] - The screen's name
 * @param {string} [group] - The text group
 * @returns {string | undefined}
 */
function ScreenFileGetTranslation(module, screen, group) {
	if (!module) module = CurrentModule;
	if (!screen) screen = CurrentScreen;
	if (!group) group = screen;
	if (!module || !screen || !group) return undefined;
	return ScreenFileGetPath(`Text_${group}.csv`, module, screen);
}

/**
 * Generates the path to a CSV Dialog file for a screen
 *
 * @param {string} npcType - The dialog file name
 * @param {string} [module] - The screen's module
 * @param {string} [screen] - The screen's name
 * @returns {string}
 */
function ScreenFileGetDialog(npcType, module, screen) {
	if (!module) module = CurrentModule;
	if (!screen) screen = CurrentScreen;
	return ScreenFileGetPath(`Dialog_${npcType}.csv`, module, screen);
}

/**
 * Generate a path to one of our Screen assets
 *
 * @param {string} file
 * @param {string} [module]
 * @param {string} [screen]
 * @returns
 */
function ScreenFileGetPath(file, module, screen) {
	if (!module) module = CurrentModule;
	if (!screen) screen = CurrentScreen;
	return `Screens/${module}/${screen}/${file}`;
}

/**
 * Gets the common prefix of a list of strings
 * @param {string[]} strings
 * @returns {string}
 */
function CommonGetCommonPrefix(strings) {
	if (strings.length === 0) return "";

	let idx = 0;
	while (strings.every((str) => str[idx] === strings[0][idx])) {
		idx++;
	}

	return strings[0].substring(0, idx);
}

/**
 * Splits a string into tokens by delimiters and spaces
 * @param {string} input
 * @param {{
 * delimiters: [string, string][];
 * includeDelimiters?: boolean;
 * trimTrailingSpaces?: boolean;
 * }} options
 * @returns {string[]}
 */
function CommonTokenize(input, options = {
	delimiters: [],
	includeDelimiters: false,
	trimTrailingSpaces: true
}) {
	let tokens = [];
	let buffer = '';
	let inDelimiter = false;
	let currentDelimiterPair = null;
	let escapeNext = false;

	/** @type {(startIndex: number, closeChar: string) => boolean} */
	function hasUnescapedClosing(startIndex, closeChar) {
		let escaped = false;

		for (let i = startIndex; i < input.length; i++) {
			const c = input[i];

			if (escaped) {
				escaped = false;
				continue;
			}

			if (c === '\\') {
				escaped = true;
				continue;
			}

			if (c === closeChar) return true;
		}

		return false;
	}

	for (let i = 0; i < input.length; i++) {
		const char = input[i];

		if (escapeNext) {
			buffer += char;
			escapeNext = false;
			continue;
		}

		if (char === '\\') {
			escapeNext = true;
			continue;
		}

		if (!inDelimiter) {
			const delimiterPair = options.delimiters?.find(([open, close]) => {
				if (open !== char) return false;
				return hasUnescapedClosing(i + 1, close); // ✅ FIXED
			});

			if (delimiterPair) {
				if (buffer.length) {
					tokens.push(buffer);
					buffer = '';
				}

				if (options.includeDelimiters) buffer += char;

				inDelimiter = true;
				currentDelimiterPair = delimiterPair;
				continue;
			}

			if (char === ' ') {
				if (buffer.length) {
					tokens.push(buffer);
					buffer = '';
				}
				continue;
			}

			buffer += char;
			continue;
		}

		// inside delimiter
		if (char === currentDelimiterPair?.[1]) {
			if (options.includeDelimiters) buffer += char;

			tokens.push(buffer);
			buffer = '';
			inDelimiter = false;
			currentDelimiterPair = null;
			continue;
		}

		buffer += char;
	}

	if (escapeNext) buffer += '\\';
	if (buffer.length) tokens.push(buffer);

	if (options.trimTrailingSpaces) {
		tokens = tokens.map(t => t.trim()).filter(Boolean);
	}

	return tokens;
}

/**
 * Formats a duration in ms to a human readable string of days, months, and years.
 * Defaults to showing days.
 * @param {number | Date} end
 * @param {number | Date} start
 * @param {{
 *   includeYears?: boolean;
 *   includeMonths?: boolean;
 *   includeWeeks?: boolean;
 *   includeDays?: boolean;
 *   includeHours?: boolean;
 *   includeMinutes?: boolean;
 *   includeSeconds?: boolean;
 *   showFull?: boolean;
 * }} options
 * @returns {string}
 */
function CommonFormatDurationRange(end, start, options = {}) {
	const {
		includeYears = false,
		includeMonths = false,
		includeWeeks = false,
		includeDays = true,
		includeHours = false,
		includeMinutes = false,
		includeSeconds = false,
		showFull = false
	} = options;

	// Update options, because we're passing them to other function
	options = {
		...options,
		includeYears,
		includeMonths,
		includeWeeks,
		includeDays,
		includeHours,
		includeMinutes,
		includeSeconds,
	};

	const {
		y: years,
		m: months,
		d: daysLeft,
		h: hours,
		min: minutes,
		s: seconds,
	} = CommonGetDatePartsRange(new Date(end), new Date(start), options);

	// Weeks extracted from remaining days
	const weeks = includeWeeks ? Math.floor(daysLeft / 7) : 0;
	const days = includeWeeks ? daysLeft % 7 : daysLeft;
	const full = showFull ? "Full" : "";

	/** @type {[string, boolean, number][]} */
	const pairs = [
		[InterfaceTextGet("DurationFormatYear" + full), includeYears, years],
		[InterfaceTextGet("DurationFormatMonth" + full), includeMonths, months],
		[InterfaceTextGet("DurationFormatWeek" + full), includeWeeks, weeks],
		[InterfaceTextGet("DurationFormatDay" + full), includeDays, days],
		[InterfaceTextGet("DurationFormatHour" + full), includeHours, hours],
		[InterfaceTextGet("DurationFormatMinute" + full), includeMinutes, minutes],
		[InterfaceTextGet("DurationFormatSecond" + full), includeSeconds, seconds],
	]
		.filter(([, enabled]) => enabled)
		.map(([label, , value]) => /** @type {[string, boolean, number]} */ ([label, true, value]));

	const result = pairs
		.filter(([, , value], idx) => value > 0 || idx === pairs.length - 1)
		.map(([label, , v]) =>
			CommonStringPartitionReplace(label, { $value$: v }).join('')
		);

	if (result.length === 0) {
		return InterfaceTextGet("DurationFormatError");
	}

	return result.join(InterfaceTextGet("CommaDelimiter"));
}

/**
 * Formats a duration in ms to a human readable string of days, months, and years.
 * Defaults to showing days.
 * @deprecated Use CommonFormatDurationRange instead
 * @param {number} ms
 * @param {{
 *   includeYears?: boolean;
 *   includeMonths?: boolean;
 *   includeWeeks?: boolean;
 *   includeDays?: boolean;
 *   includeHours?: boolean;
 *   includeMinutes?: boolean;
 *   includeSeconds?: boolean;
 *   showFull?: boolean;
 * }} options
 * @returns {string}
 */
function CommonFormatDuration(ms, options = {}) {
	return CommonFormatDurationRange(new Date(ms), new Date(0), options);
}

/**
 * Break duration into real-calendar components (y, m, d, h, min, s),
 * optionally rolling excluded components into the next smaller unit.
 *
 * @param {Date} end
 * @param {Date} start
 * @param {{
 *   includeYears?: boolean,
 *   includeMonths?: boolean,
 *   includeDays?: boolean,
 *   includeHours?: boolean,
 *   includeMinutes?: boolean,
 * }} options
 */
function CommonGetDatePartsRange(end, start, options = {}) {
	const {
		includeYears = true,
		includeMonths = true,
		includeDays = true,
		includeHours = true,
		includeMinutes = true,
	} = options;

	if (start > end) [start, end] = [end, start];

	let y = 0, m = 0, d = 0, h = 0, min = 0;

	let diff = end.valueOf() - start.valueOf();

	// Note: this assumes if includeYears or includeMonths is true then includeDays is also true, and if includeYears is true then includeMonths is also true
	if (includeYears || includeMonths) {
		const mid = new Date(start);
		mid.setFullYear(end.getFullYear(), end.getMonth(), end.getDate());
		if (mid > end) mid.setDate(mid.getDate() - 1);

		y = mid.getFullYear() - start.getFullYear();
		m = mid.getMonth() - start.getMonth();
		d = mid.getDate() - start.getDate();

		let monthIndex = mid.getMonth();
		while (d < 0) {
			const prevMonth = new Date(mid);
			prevMonth.setMonth(monthIndex);
			prevMonth.setDate(0);
			d += prevMonth.getDate();
			m--;
			monthIndex = (monthIndex + 1) % 12;
		}
		if (m < 0) { m += 12; y--; }

		if (!includeYears) { m += 12 * y; y = 0; }

		diff = end.valueOf() - mid.valueOf();
	} else if (includeDays) {
		d = Math.floor(diff / 86400000);
		diff %= 86400000;
	}

	if (includeHours) {
		h = Math.floor(diff / 3600000);
		diff %= 3600000;
	}

	if (includeMinutes) {
		min = Math.floor(diff / 60000);
		diff %= 60000;
	}

	const s = Math.floor(diff / 1000);

	return { y, m, d, h, min, s };
}

/**
 * Break duration into real-calendar components (y, m, d, h, min, s),
 * optionally rolling excluded components into the next smaller unit.
 *
 * @deprecated Use CommonGetDatePartsRange instead.
 * @param {number} ms
 * @param {{
 *   includeYears?: boolean,
 *   includeMonths?: boolean,
 *   includeDays?: boolean,
 *   includeHours?: boolean,
 *   includeMinutes?: boolean,
 * }} options
 */
function CommonGetDateParts(ms, options = {}) {
	return CommonGetDatePartsRange(new Date(ms), new Date(0), options);
}

/**
 * Build and returns a range
 * @param {number} start If {@link end} is unspecified, then this will be the end of the range, and start will be set to 0
 * @param {number} [end] End value for the range, inclusive
 * @param {number} [step=1]
 * @returns {number[]}
 */
function CommonRange(start, end, step = 1) {
	if (end == null) [start, end] = [0, start];
	const n = Math.max(Math.ceil((end - start) / step), 0);
	return Array.from({ length: n }, (_, i) => start + i * step);
}

/**
 * Take an array and find the first element that maps to a user-specified value, returning the mapped value.
 *
 * Effectively combines {@link array.find} and {@link array.map}.
 * @template Tinp
 * @template Tout
 * @param {readonly Tinp[]} array - The array in question
 * @param {(value: Tinp, index: number, obj: readonly Tinp[]) => undefined | null | Tout} predicateMapper - A mapping
 * predicate. The first non-nullish return value will be returned by the outer function.
 * @param {any} [thisArg] - If provided, it will be used as the this value for each invocation of
 * predicate. If it is not provided, undefined is used instead.
 * @returns {undefined | Tout} - The mapped value or `undefined` if no non-nullish value was found
 */
function CommonFindMap(array, predicateMapper, thisArg=null) {
	if (thisArg != null) {
		predicateMapper = predicateMapper.bind(thisArg);
	}
	for (const [i, elem] of array.entries()) {
		const result = predicateMapper(elem, i, array);
		if (result != null) {
			return result;
		}
	}
	return undefined;
}

/**
 * Splice a string into a string at a specific index.
 *
 * The string will be automatically extended using {@link defaultValue} if the index falls outside its bounds.
 *
 * @param {string} string
 * @param {number} index
 * @param {string} value
 * @param {string} defaultValue
 * @returns
 */
function CommonStringSplice(string, index, value, defaultValue) {
	if (string.length < index) {
		string = string + defaultValue.repeat(Math.ceil((index - string.length) / defaultValue.length));
	}
	return string.substring(0, index) + value + string.substring(index + value.length);
}

/**
 * Unwraps a thunk into a value
 *
 * @template T
 * @param {Thunk<T>} thunk
 * @returns {T}
 */
function CommonUnwrapThunk(thunk) {
	return typeof thunk === "function" ? /** @type {() => T} */ (thunk)() : thunk;
}

