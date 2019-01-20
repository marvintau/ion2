/**
 * **QUOTE STRING** 
 *
 * If a string contains character '@' or a white space, then
 * quote it with quotation mark. This happens when converting
 * a JSON string into ION one.
 *
 * @param {string} str input string
 *
 */
function quoteString(str){
    return str.match(/[ @]/) ? '"' + str + '"' : str;
}

/**
 * **ARRAY WARPED PREFIX**
 *
 * With the line index given, this function inserts either the
 * array prefix (@) or the indentation white space before each
 * array element.
 *
 * @param {string} e element
 * @param {number} i index
 */
function arrayWarpedPrefix(e, i){
    return (i == 0 ? "@ " : "  ") + e;
}

/**
 * **OBJECT WARPED PREFIX**
 *
 * With the line index given, this function inserts either the
 * object prefix (#) or the indentation white space before each
 * object entry.
 *
 * @param {string} e element
 * @param {number} i element index
 */
function objectWarpedPrefix(e, i){
    return (i == 0 ? "# " : "  ") + e;
}

/**
 * **OBJECT WARPED KEY**
 *
 * After processed the value of each key-value pair, which means
 * the value has been turned into a string, this function turns
 * the key-value pair into the final form and add white space to
 * align them.
 *
 * @param {string} e element
 * @param {number} i index
 * @param {stirng} key the key followed by
 */
function objectWarpedKey(e, i, key){
    var quotedKey = quoteString(key);
    return (i == 0 ? quotedKey + ": " : " ".repeat(quotedKey.length+2)) + e;
}

/**
 * **OBJECT WARPED KEY NEXT**
 *
 * if the final string of the ION key-value pair is much shorter
 * than the given length, then this function gathers several lines
 * into one line, so that to save lines.
 *
 * @param {string} returnedArray array of element returned from next level
 * @param {*} key the key of current key-value pair
 */
function objectWarpedKeyNext(returnedArray, key){
    return [key+":"].concat(returnedArray.map( e=> " " + e));
}

/**
 * process if an array of next level is identified.
 * @param {object} object sub-level of object.
 * @param {function} recurFunc the call-back recursive function.
 * @param {number} remLen remaining length of current line
 */
function handleArray(object, recurFunc, remLen){
    var res       = object.map((e) => recurFunc(e, remLen - 2)).flat(),
        joined    = res.join(' '),
        notAtomic = res.some(e => e.includes("@") || e.includes("#")),
        warpCond  = ( notAtomic || joined.length > remLen);
        
    return (warpCond) ? res.map(arrayWarpedPrefix) : ["@ " + joined];
}


function handleObject(object, recurFunc, remLen, fullLen){
    var keys           = Object.keys(object),
        resSameLine    = keys.map((k) => ({key:k, val:recurFunc(object[k], remLen - k.length, fullLen)})),
        notAtomic      = resSameLine.map(e => e.val.some(e => e.includes("@") || e.includes("#"))).some(e=>e),
        
        joined           = resSameLine.map((e) => quoteString(e.key) + ": " + e.val[0]).join(" "),
        warpSamelineCond = ( notAtomic || joined.length > remLen),
        warpedSameLine   = resSameLine.map((e) => e.val.map((v, i) => objectWarpedKey(v, i, e.key))).flat(),

        warpNextLineCond = warpedSameLine.some(e => e.length > fullLen),
        resNextLine = keys.map((k) => ({key:k, val:recurFunc(object[k], remLen - 2, fullLen)})),
        warpedNextLine   = resNextLine.map((e) => objectWarpedKeyNext(e.val, e.key)).flat();
        
    return (warpNextLineCond) ? warpedNextLine.map(objectWarpedPrefix) :
           (warpSamelineCond) ? warpedSameLine.map(objectWarpedPrefix) : ["# " + joined];
}

/**
 * fromJSONObject
 * 
 * @param {object} object object to be interpreted
 * @param {number} currCursor the current place of interpreted string
 * @param {number} nextLineCursor the position where the warped line starts
 * 
 * @returns {object} an array of string
 */
function fromJSONObjectRecursive(object, remLen, fullLen){

    switch(typeof object){
        case "string":
            return [quoteString(object)];
        case "number":

            return [ object % 1 == 0 ? object.toString() : object.toFixed(3)];
        case "object":
            var res = (Array.isArray(object)) 
                      ? handleArray(object, fromJSONObjectRecursive, remLen)
                      : handleObject(object, fromJSONObjectRecursive, remLen, fullLen);
            
            return res;
    }
}

export function fromJSONObject(object, lineLength){
    return fromJSONObjectRecursive(object, lineLength, lineLength).join("\n");
}


function returnRightBracket(stack){
    var pairs = {"{": "}", "[": "]", ":":""};
    return pairs[stack[stack.length - 1].type];
}

//  The only thing that really matter is the end of indentation.
//  so this function will scan the text line by line, word by word.
//  when meet @, push stack with [, and # with { . when encounter
//  the ", find the next " and append to text with string, or anything 
//  end with space or comma.
export function toJSONText(text){
    
    var lines = text.split("\n").filter(e => !e.match(/^\s*$/));
    
    var resultText = "",
        stack      = [],
        currIndent = 0;

    for (let i = 0; i < lines.length; i++){

        var lineIndent = lines[i].search(/\S|$/);
        while (stack.length > 0 && stack[stack.length - 1].indent >= lineIndent){
            resultText += returnRightBracket(stack);
            stack.pop();
        }

        currIndent = 0;
        var currLineRem = lines[i];
        
        while(currLineRem.length > 0){
            switch(currLineRem[0]){
                case " ":
                    // a space, might be a delimiter (comma)
                    
                    if (stack[stack.length - 1].comma)
                        resultText += ", ";
                    else
                        stack[stack.length - 1].comma = true;

                    currIndent  += currLineRem.search(/\S|$/);
                    currLineRem  = currLineRem.trim();
                    break;

                case "@": 
                    // beginning of an arary
                    resultText += "["; stack.push({type:"[", indent: currIndent, comma:false});
                    currIndent += 1;
                    currLineRem = currLineRem.slice(1);
                    break;

                case "#":
                    // beginning of an object
                    resultText += "{"; stack.push({type:"{", indent: currIndent, comma:false});
                    currIndent += 1;
                    currLineRem = currLineRem.slice(1);
                    break;

                case ":":
                    resultText += ":"; stack.push({type:":", indent: currIndent});
                    currIndent += 1;
                    currLineRem = currLineRem.slice(1);
                    break;

                case '"':
                    // beginning of a quoted string. Notably, we don't accept
                    // a single quotation mark appearing on a single line.

                    var quoted = currLineRem.match(/"(?:\\"|[^"])*"/);
                    if (!quoted) throw "Quoted string missing at Line: " + i;
                    
                    if (stack.length > 0 && stack[stack.length - 1].type == ":") stack.pop();
                    currIndent += quoted[0].length;
                    resultText += currLineRem.slice(0, quoted[0].length);
                    currLineRem = currLineRem.slice(quoted[0].length);
                    break;


                default :
                    // means we meet a simple string, that a string doesn't
                    // contains space, and quotation marks on both ends.
                    // however, it's okay to contain a single quotation mark
                    // in the middle of the string.
                    // console.log("gotcha");
                    var simple = currLineRem.match(/[^\s:]*/);
                    if (!simple) throw "Simple string got some problem at Line: " + 1;
                    if (stack.length > 0 && stack[stack.length - 1].type == ":") {stack.pop();}

                    currIndent += simple[0].length;

                    var result = currLineRem.slice(0, simple[0].length),
                        parsed = parseFloat(result) ;
                    
                    resultText += (!parsed && parsed != 0) ? '"' + result + '"' : parsed;

                    currLineRem = currLineRem.slice(simple[0].length);
                    break;

            }
        }
    }

    while (stack.length > 0 && stack[stack.length - 1].indent >= 0){
        resultText += returnRightBracket(stack);
        stack.pop();
    }

    return resultText;
}

export function highlightION(text, keyStyleString, keywordStyleString){
    return text.split('\n').map(t=> t
        .replace(/(\S+\s*)(?=:)/g, '<b class="'+keyStyleString+'">$1</b>')
        .replace(/([#@:])/g, '<b class="'+keywordStyleString+'">$1</b>'))
        .join('\n');
}
