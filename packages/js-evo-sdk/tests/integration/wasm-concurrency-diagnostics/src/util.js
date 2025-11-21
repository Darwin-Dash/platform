export function asJsonString(value) {
    if (value == null)
        return undefined;
    if (typeof value === 'string')
        return value;
    return JSON.stringify(value);
}
