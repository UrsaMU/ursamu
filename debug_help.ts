
const stripColors = (text: string) => text.replace(/%(ch|cn|cr|cg|cy|cw|cb|cm|ci|cx|c[rgbcmyw]|b[rgbcmyw]|x[0-9]{1,3}|[rhniub])/gi, "");

const center = (text: string, width: number, padChar: string = " ") => {
    const len = stripColors(text).length; 
    console.log(`Text: "${text}"`);
    console.log(`Stripped: "${stripColors(text)}"`);
    console.log(`Length: ${len}`);
    console.log(`Width: ${width}`);
    
    if (len >= width) return text;
    const left = Math.floor((width - len) / 2);
    const right = width - len - left;
    console.log(`Left: ${left}, Right: ${right}`);
    
    return padChar.repeat(left) + text + padChar.repeat(right);
};

const header = "%cy[%cn %chHELP SYSTEM%cn %cy]%cn";
const output = center(header, 78, "%cr=%cn");
const strippedOutput = stripColors(output);
console.log(`Output Visual Length (approx): ${strippedOutput.length}`);

// Test equals logic
const footer = "%cr=%cn".repeat(78);
console.log(`Footer Visual Length: ${stripColors(footer).length}`);

// Test problematic cases
console.log("Stripped %chHELP: ", stripColors("%chHELP"));
console.log("Stripped %x123Color: ", stripColors("%x123Color"));
